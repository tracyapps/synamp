import AppKit
import SynAmpCore
import WebKit

/// One of the app's own small windows (setup, "Open on your phone"), drawn as a
/// web page from apps/mac/ui with the web app's own design tokens and
/// components, so the Mac app looks like SynAmp. The page talks to the app
/// through `bridge.js`: `send(action, data)` arrives in `onMessage`, and
/// `send(_:)` here arrives in the page's `SynAmp.on(type, …)`.
@MainActor
final class PanelWindow: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    let window: NSWindow
    private let webView: WKWebView
    private let width: CGFloat
    var onMessage: (([String: Any]) -> Void)?
    var onClose: (() -> Void)?

    /// Where the pages are: inside the app, or in the checkout while developing.
    static var folder: (pages: URL, readable: URL) {
        if let repo = ProcessInfo.processInfo.environment["SYNAMP_DEV_REPO"], !repo.isEmpty {
            let root = URL(fileURLWithPath: repo, isDirectory: true)
            // The styles are links into the web app's folder: both must be readable.
            return (root.appendingPathComponent("apps/mac/ui", isDirectory: true), root.appendingPathComponent("apps", isDirectory: true))
        }
        let pages = (Bundle.main.resourceURL ?? URL(fileURLWithPath: "/")).appendingPathComponent("ui", isDirectory: true)
        return (pages, pages)
    }

    init(title: String, page: String, width: CGFloat, state: [String: Any]) {
        self.width = width
        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()
        let json = (try? JSONSerialization.data(withJSONObject: state)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        controller.addUserScript(WKUserScript(source: "window.SYNAMP_STATE = \(json);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController = controller
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 480), configuration: configuration)
        webView.setValue(false, forKey: "drawsBackground")  // no white flash before the page draws

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 480),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        super.init()
        controller.add(WeakHandler(self), name: "synamp")
        webView.navigationDelegate = self
        window.title = title
        window.titlebarAppearsTransparent = true            // the title bar takes the page's colour
        window.appearance = NSAppearance(named: .darkAqua)  // SynAmp is dark in light mode too
        window.backgroundColor = NSColor(srgbRed: 0x21 / 255, green: 0x26 / 255, blue: 0x37 / 255, alpha: 1)  // --bg
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = webView
        window.center()

        let folder = Self.folder
        webView.loadFileURL(folder.pages.appendingPathComponent(page), allowingReadAccessTo: folder.readable)
    }

    func show() {
        EditMenu.ensure()
        NSApp.setActivationPolicy(.regular)  // in the Dock and Command-Tab while a window is open
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    func close() {
        window.close()
    }

    /// Tell the page something (it arrives in `SynAmp.on(type, …)`).
    func send(_ message: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.SynAmpPanel && window.SynAmpPanel.receive(\(json))", completionHandler: nil)
    }

    // MARK: the page

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "resize", let height = body["height"] as? Double {
            fit(height: CGFloat(height))
            return
        }
        onMessage?(body)
    }

    /// The window is as tall as its page, up to what fits on the screen (then the page scrolls).
    private func fit(height: CGFloat) {
        let room = (window.screen ?? NSScreen.main)?.visibleFrame.height ?? 800
        let title = window.frame.height - window.contentLayoutRect.height
        let wanted = min(max(height, 200), room - title - 24)
        let top = window.frame.maxY
        var frame = window.frameRect(forContentRect: NSRect(x: 0, y: 0, width: width, height: wanted))
        frame.origin.x = window.frame.origin.x
        frame.origin.y = top - frame.height
        // Opened near the bottom of the screen, a taller page would hang off it: move up.
        if let visible = (window.screen ?? NSScreen.main)?.visibleFrame, frame.minY < visible.minY { frame.origin.y = visible.minY }
        window.setFrame(frame, display: true, animate: false)
    }

    /// Links in a page (there are none today) open in the browser, never inside the panel.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.navigationType == .linkActivated, let url = action.request.url, url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: window

    func windowWillClose(_ notification: Notification) {
        onClose?()
        Presence.afterClose()
    }

    private final class WeakHandler: NSObject, WKScriptMessageHandler {
        weak var target: PanelWindow?
        init(_ target: PanelWindow) { self.target = target }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            MainActor.assumeIsolated { target?.userContentController(controller, didReceive: message) }
        }
    }
}

/// Back to a menu-bar icon only once the last of the app's windows has closed.
@MainActor
enum Presence {
    static func afterClose() {
        // The closing window still counts as visible at this moment: look again in a tick.
        DispatchQueue.main.async {
            // Only the app's real windows count: titled ones. The menu-bar icon has a
            // window of its own (untitled, always "visible"), and alerts are panels.
            let visible = NSApp.windows.filter { $0.styleMask.contains(.titled) && !($0 is NSPanel) }.map(\.isVisible)
            if !WindowPresence.shouldShowInDock(visible: visible) { NSApp.setActivationPolicy(.accessory) }
        }
    }
}

/// Copy, paste, select all and undo in the setup window's fields. They are menu
/// commands, and a menu-bar app has no menu bar of its own unless it makes one.
@MainActor
enum EditMenu {
    static func ensure() {
        let main = NSApp.mainMenu ?? NSMenu()
        if main.items.contains(where: { $0.submenu?.title == "Edit" }) { return }
        if main.items.isEmpty {
            let app = NSMenuItem()
            app.submenu = NSMenu(title: "SynAmp")
            app.submenu?.addItem(withTitle: "Quit SynAmp", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
            main.addItem(app)
        }
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let item = NSMenuItem()
        item.submenu = edit
        main.addItem(item)
        NSApp.mainMenu = main
    }
}
