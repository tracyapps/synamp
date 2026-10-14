import AppKit
import SynAmpCore
import WebKit

/// SynAmp's own window: the web app in a WebKit view.
///
/// Closing the window only hides it, so music keeps playing (to this Mac's
/// speakers, phones and the party screen); Quit in the menu stops SynAmp.
/// While the window is open SynAmp shows in the Dock and the app switcher, like
/// any app; when it's hidden it goes back to being a menu-bar icon.
@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private let webView: WKWebView
    /// The address SynAmp is served from: only its pages open inside the window.
    private var origin: URL?
    /// One line for SynAmp's own log (app.log): what the window loaded, or why it couldn't.
    private let note: (String) -> Void

    init(note: @escaping (String) -> Void = { _ in }) {
        self.note = note
        let configuration = WKWebViewConfiguration()
        // Music starts when you press play; nothing else needs a second click.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.isElementFullscreenEnabled = true  // fullscreen visuals
        configuration.websiteDataStore = .default()                   // remembers per-device choices
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true                           // ⌘+ / ⌘− zoom, for low vision
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.setAccessibilityLabel("SynAmp")

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.title = "SynAmp"
        window.minSize = NSSize(width: 480, height: 480)
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("SynAmpMainWindow")  // comes back where you left it
        if window.frame.origin == .zero { window.center() }
        super.init(window: window)
        window.delegate = self
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not used") }

    /// Show SynAmp at this address (the first time, or after a restart). The
    /// access token goes straight into the page's storage before its scripts
    /// run, so the window never asks for it.
    func show(_ url: URL, token: String) {
        let newOrigin = URL(string: "\(url.scheme ?? "http")://\(url.host ?? "127.0.0.1"):\(url.port ?? 80)")
        if origin != newOrigin || webView.url == nil {
            origin = newOrigin
            let controller = webView.configuration.userContentController
            controller.removeAllUserScripts()
            if let quoted = String(data: (try? JSONEncoder().encode(token)) ?? Data(), encoding: .utf8) {
                controller.addUserScript(WKUserScript(
                    source: "try { sessionStorage.setItem('synamp-playlist-token', \(quoted)) } catch (e) {}",
                    injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
            webView.load(URLRequest(url: url))
        }
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    /// The page asks to reload (after SynAmp restarted on another port, say).
    func reload(_ url: URL, token: String) {
        origin = nil
        show(url, token: token)
    }

    // MARK: window

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)                 // hide, keep playing
        NSApp.setActivationPolicy(.accessory)
        return false
    }

    // MARK: loading

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A moment later (the app has drawn its first screen): what's showing, and
        // did the access token arrive? (Without it, the page shows its token form.)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak webView, note] in
            webView?.evaluateJavaScript("[document.title, document.querySelector('.token-form') ? 'asking for the token' : 'with access'].join(' — ')") { result, _ in
                note("window: showing \(result as? String ?? "SynAmp")")
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        note("window: couldn't load SynAmp (\(error.localizedDescription))")
    }

    // MARK: links

    private func isSynAmp(_ url: URL?) -> Bool {
        guard let url, let origin else { return false }
        return url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
        } else if url?.scheme == "blob" || url?.scheme == "data" || url?.scheme == "about" || isSynAmp(url) {
            decisionHandler(.allow)
        } else if let url, navigationAction.targetFrame?.isMainFrame != false {
            // MusicBrainz, Last.fm sign-in, mailto: for Send feedback… open in the right app.
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)  // embedded frames (radio artwork and the like)
        }
    }

    /// target=_blank and window.open: SynAmp's own pages in this window, anything else outside.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isSynAmp(url) { webView.load(URLRequest(url: url)) } else { NSWorkspace.shared.open(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    // MARK: files in (Add music, Import playlists)

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        if let window { panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) } }
        else { completionHandler(panel.runModal() == .OK ? panel.urls : nil) }
    }

    // MARK: files out (Save as a file, missing-tracks CSV)

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping @MainActor (URL?) -> Void) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser
        completionHandler(DownloadNames.free(for: suggestedFilename, in: downloads))
    }
}
