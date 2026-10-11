import AppKit
import WebKit
import Carbon

// The web view owns playback. Menu and hotkeys call the same controls as the page.
final class Companion: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate, NSWindowDelegate {
    var item: NSStatusItem!
    var window: NSWindow!
    var web: WKWebView!
    var popups: [NSWindow] = []
    var hotkeys: [EventHotKeyRef] = []
    var handler: EventHandlerRef?
    var commandItems: [String: NSMenuItem] = [:]
    var hotkeyNotice: NSMenuItem!
    var activeOrigin: URL?
    let commands: [(String, String, UInt32)] = [
        ("toggle", "Play / Pause", UInt32(kVK_Space)),
        ("next", "Skip", UInt32(kVK_RightArrow)),
        ("love", "Love", UInt32(kVK_ANSI_L)),
        ("not-for-this", "Not for this → next song", UInt32(kVK_ANSI_N)),
        ("remove", "Remove from playlist → next song", UInt32(kVK_ANSI_R)),
        ("more-like-this", "More like this next", UInt32(kVK_ANSI_M)),
        ("visuals", "Show visuals", UInt32(kVK_ANSI_V))
    ]
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        let mainMenu = NSMenu()
        let editRoot = NSMenuItem(title: "Edit", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Edit")
        for (title, selector, key) in [("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(NSMenuItem(title: title, action: Selector(selector), keyEquivalent: key))
        }
        editRoot.submenu = editMenu; mainMenu.addItem(editRoot); NSApp.mainMenu = mainMenu
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "♫ SynAmp"
        let menu = NSMenu()
        let song = NSMenuItem(title: "Open SynAmp and choose a song", action: nil, keyEquivalent: "")
        song.tag = 100; menu.addItem(song)
        let feedback = NSMenuItem(title: "", action: nil, keyEquivalent: ""); feedback.tag = 101; menu.addItem(feedback)
        menu.addItem(.separator())
        for (command, title, _) in commands {
            let entry = NSMenuItem(title: title, action: #selector(menuCommand(_:)), keyEquivalent: "")
            entry.target = self; entry.representedObject = command; menu.addItem(entry); commandItems[command] = entry
        }
        menu.addItem(.separator())
        add("Open SynAmp", #selector(show), to: menu)
        add("Change SynAmp address…", #selector(configure), to: menu)
        hotkeyNotice = NSMenuItem(title: "Global shortcuts: ⌃⌥⌘ + Space / → / L / N / R / M / V", action: nil, keyEquivalent: "")
        menu.addItem(hotkeyNotice)
        add("Global shortcuts enabled", #selector(toggleHotkeys(_:)), to: menu).state = .on
        menu.addItem(.separator())
        add("Quit SynAmp Companion", #selector(quit), to: menu)
        item.menu = menu
        let configuration = WKWebViewConfiguration()
        configuration.preferences.isElementFullscreenEnabled = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "synampPlayer")
        web = WKWebView(frame: .zero, configuration: configuration)
        web.uiDelegate = self; web.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "SynAmp"; window.contentView = web; window.center(); window.delegate = self
        registerHotkeys()
        show()
        if let value = ProcessInfo.processInfo.environment["SYNAMP_URL"] ?? UserDefaults.standard.string(forKey: "SynAmpURL"), let url = URL(string: value) { load(url) }
        else { configure() }
    }
    @discardableResult func add(_ title: String, _ selector: Selector, to menu: NSMenu) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        entry.target = self; menu.addItem(entry); return entry
    }
    @objc func show() { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }
    @objc func quit() { NSApp.terminate(nil) }
    @objc func configure() {
        let alert = NSAlert(); alert.messageText = "Your SynAmp address"
        alert.informativeText = "Enter the address you use to open SynAmp. Play music in this window to use menu controls and global shortcuts. Closing the window keeps music playing."
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 400, height: 26))
        input.stringValue = UserDefaults.standard.string(forKey: "SynAmpURL") ?? "http://localhost:5173"
        alert.accessoryView = input; alert.addButton(withTitle: "Connect"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        guard let url = URL(string: input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme ?? ""), url.host != nil, url.user == nil, url.password == nil else {
            let error = NSAlert(); error.messageText = "Enter a complete http:// or https:// SynAmp address."; error.runModal(); return
        }
        UserDefaults.standard.set(url.absoluteString, forKey: "SynAmpURL"); load(url)
    }
    func load(_ url: URL) { activeOrigin = url; web.load(URLRequest(url: url)) }
    @objc func menuCommand(_ sender: NSMenuItem) { if let command = sender.representedObject as? String { send(command) } }
    func send(_ command: String) {
        // Commands come only from the fixed local allowlist; no token crosses the native bridge.
        guard commands.contains(where: { $0.0 == command }) else { return }
        if command == "visuals" { show() }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('synamp:player-command', {detail: '\(command)'}))") { _, error in
            if error != nil { self.item.menu?.item(withTag: 100)?.title = "Open SynAmp to reconnect" }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any],
              let origin = activeOrigin, let url = message.frameInfo.request.url,
              url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port else { return }
        let title = body["title"] as? String ?? "Nothing playing"
        let artist = body["artist"] as? String ?? ""
        item.menu?.item(withTag: 100)?.title = String((artist.isEmpty ? title : "\(title) · \(artist)").prefix(140))
        item.menu?.item(withTag: 101)?.title = String((body["status"] as? String ?? "").prefix(160))
        let busy = body["busy"] as? Bool ?? false
        for (name, entry) in commandItems {
            entry.isEnabled = !(body["empty"] as? Bool ?? false) && !busy
            if name == "love" { entry.title = (body["loved"] as? Bool ?? false) ? "♥ Loved" : "♡ Love"; entry.isEnabled = entry.isEnabled && !(body["loved"] as? Bool ?? false) }
            if name == "remove" { entry.isEnabled = entry.isEnabled && body["playlist"] is String }
        }
        item.menu?.autoenablesItems = false
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.absoluteString == "about:blank" { decisionHandler(.allow); return }
        if let origin = activeOrigin, url.scheme == origin.scheme, url.host == origin.host, url.port == origin.port { decisionHandler(.allow) }
        else { if ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        item.menu?.item(withTag: 100)?.title = "Couldn’t connect — open SynAmp or change its address"
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let child = WKWebView(frame: .zero, configuration: configuration); child.uiDelegate = self; child.navigationDelegate = self
        let popup = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        popup.title = "SynAmp · Visuals"; popup.contentView = child; popup.delegate = self; popup.isReleasedWhenClosed = false; popup.center(); popup.makeKeyAndOrderFront(nil); popups.append(popup)
        return child
    }
    func webViewDidClose(_ webView: WKWebView) { popups.first(where: { $0.contentView === webView })?.close() }
    func windowShouldClose(_ sender: NSWindow) -> Bool { if sender === window { sender.orderOut(nil); return false }; return true }
    func windowWillClose(_ notification: Notification) { if let closed = notification.object as? NSWindow { popups.removeAll(where: { $0 === closed }) } }
    @objc func toggleHotkeys(_ sender: NSMenuItem) {
        if sender.state == .on { unregisterHotkeys(); sender.state = .off; hotkeyNotice.title = "Global shortcuts off" }
        else { registerHotkeys(); sender.state = .on }
    }
    func registerHotkeys() {
        if handler == nil {
            var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
            InstallEventHandler(GetApplicationEventTarget(), { _, event, context -> OSStatus in
                guard let event = event, let context = context else { return OSStatus(eventNotHandledErr) }
                var id = EventHotKeyID()
                GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
                let owner = Unmanaged<Companion>.fromOpaque(context).takeUnretainedValue()
                let index = Int(id.id) - 1
                if owner.commands.indices.contains(index) { owner.send(owner.commands[index].0) }
                return noErr
            }, 1, &type, Unmanaged.passUnretained(self).toOpaque(), &handler)
        }
        var failed = false
        for (index, command) in commands.enumerated() {
            var ref: EventHotKeyRef?
            let id = EventHotKeyID(signature: 0x53594E41, id: UInt32(index + 1))
            let result = RegisterEventHotKey(command.2, UInt32(controlKey | optionKey | cmdKey), id, GetApplicationEventTarget(), 0, &ref)
            if result == noErr, let ref = ref { hotkeys.append(ref) } else { failed = true }
        }
        hotkeyNotice.title = failed ? "Some shortcuts are in use by another app; use this menu" : "Global: ⌃⌥⌘ + Space / → / L / N / R / M / V"
    }
    func unregisterHotkeys() { hotkeys.forEach { UnregisterEventHotKey($0) }; hotkeys.removeAll() }
    func applicationWillTerminate(_ notification: Notification) { unregisterHotkeys(); if let handler = handler { RemoveEventHandler(handler) } }
}
let app = NSApplication.shared
let delegate = Companion()
app.delegate = delegate
app.run()
