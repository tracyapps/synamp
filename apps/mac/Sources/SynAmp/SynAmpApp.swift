import AppKit
import CoreImage.CIFilterBuiltins
import Network
import SwiftUI
import SynAmpCore
import UserNotifications

/// SynAmp for Mac: a menu-bar app that starts SynAmp's pieces and opens it.
/// (First version: the menu and the first run. The app's own window, start at
/// login, sleep and updates come next — see docs/synamp/plans/MAC-APP.md.)
@main
struct SynAmpApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        MenuBarExtra {
            MenuContent(model: model)
        } label: {
            // The menu-bar icon; its words are what VoiceOver reads.
            Label(model.menuLabel, systemImage: model.menuSymbol)
        }

    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var signalSources: [DispatchSourceSignal] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // `kill` or a logout's stop request: quit properly, so every piece stops too.
        for sig in [SIGTERM, SIGINT, SIGHUP] {
            // An empty handler, not "ignore": an ignored signal would be passed on to
            // every program SynAmp starts, and they'd then ignore Quit's stop request too.
            signal(sig) { _ in }
            let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
            source.setEventHandler {
                AppModel.shared.engine.note("asked to quit (signal \(sig))")
                NSApp.terminate(nil)
            }
            source.resume()
            signalSources.append(source)
        }
        Task { await AppModel.shared.launch() }
    }

    /// A synamp:// link (SynAmp's web page: "Connect the Mac app").
    func application(_ application: NSApplication, open urls: [URL]) {
        guard let url = urls.first else { return }
        Task { @MainActor in AppModel.shared.openLink(url) }
    }

    /// Clicking SynAmp in the Dock (or opening it again) brings the window back.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        // With a window already open (setup, say), just bring it forward.
        if flag { return true }
        Task { @MainActor in AppModel.shared.open() }
        return true
    }

    /// Quit stops every piece first (the librarian may need a moment to finish).
    /// Set once every piece has stopped, so the second request goes through.
    private var piecesStopped = false

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if piecesStopped { return .terminateNow }
        let engine = AppModel.shared.engine
        engine.note("quitting: stopping every piece")
        // Stop on a thread of its own (the librarian may need a while to finish a
        // batch), then quit for real. Waiting here instead would freeze the menu.
        Thread.detachNewThread { [weak self] in
            let done = DispatchSemaphore(value: 0)
            Task.detached {
                await engine.stop()
                done.signal()
            }
            done.wait()
            engine.note("quitting: all stopped")
            DispatchQueue.main.async {
                self?.piecesStopped = true
                NSApp.terminate(nil)
            }
        }
        return .terminateCancel
    }
}

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    let engine: Engine
    @Published var status: Engine.Status
    @Published var pieces: [String: Supervisor.State] = [:]
    @Published var loginItem: LoginItem.State = LoginItem.state
    @Published var settings: AppSettings
    /// Where things stand with a SynAmp that runs somewhere else (nil: it runs on this Mac).
    @Published var link: LinkState?
    /// What SynAmp is doing right now (playing, listening, the music, Listen anywhere); nil: not known.
    @Published var system: SystemStatus?
    private var setupPanel: PanelWindow?
    private var phonePanel: PanelWindow?
    private var mainWindow: MainWindowController?
    let updates = Updates()
    private let awayNotice = AwayNotice()
    /// SynAmp was opened (or just connected) but wasn't reachable yet: show the
    /// window as soon as it is. Cleared once the window has been shown.
    private var openWhenReady = false
    private let network = NWPathMonitor()

    private init() {
        let layout: RuntimeLayout
        if let repo = ProcessInfo.processInfo.environment["SYNAMP_DEV_REPO"], !repo.isEmpty {
            layout = .development(repo: URL(fileURLWithPath: repo))
        } else {
            layout = .bundled(resources: Bundle.main.resourceURL ?? URL(fileURLWithPath: "/"))
        }
        // While developing, SYNAMP_DEV_SUPPORT keeps the trial's data apart from a real install.
        let paths: AppPaths
        if let dev = ProcessInfo.processInfo.environment["SYNAMP_DEV_SUPPORT"], !dev.isEmpty {
            let root = URL(fileURLWithPath: dev, isDirectory: true)
            paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        } else {
            paths = .standard()
        }
        let dev = ProcessInfo.processInfo.environment["SYNAMP_DEV_SUPPORT"] != nil
        let tokens: TokenStore = dev
            ? FileTokenStore(file: paths.support.appendingPathComponent("dev-token")) : KeychainTokenStore()
        // The token for a SynAmp on a NAS or another computer is a different secret from this Mac's own.
        let connectionTokens: TokenStore = dev
            ? FileTokenStore(file: paths.support.appendingPathComponent("dev-connection-token"))
            : KeychainTokenStore(account: "connection-token")
        engine = Engine(paths: paths, layout: layout, tokens: tokens, connectionTokens: connectionTokens)
        status = engine.status
        settings = engine.settings
        engine.onStatus = { status in Task { @MainActor in AppModel.shared.statusChanged(status) } }
        engine.onSystemStatus = { system in Task { @MainActor in AppModel.shared.system = system } }
        engine.onPiece = { name, state in Task { @MainActor in AppModel.shared.pieces[name] = state } }
    }

    /// The menu-bar icon: a hint only. The menu's first lines say everything in words.
    var menuSymbol: String {
        switch status {
        case .running:
            if system?.player?.state == "playing" || system?.phone == true { return "waveform.circle.fill" }
            return "waveform"
        case .problem: return "exclamationmark.triangle"
        default: return "waveform.slash"
        }
    }

    /// What VoiceOver says for the menu-bar icon: SynAmp and where things stand.
    var menuLabel: String { "SynAmp: \(statusLine)" }

    /// What SynAmp is doing, as lines for the menu (empty when it can't be asked).
    var systemLines: [String] {
        guard case .running = status, let system else { return [] }
        return StatusWords.lines(system)
    }

    /// "Open on your phone": QR codes for the addresses a phone uses.
    func showPhoneLinks() {
        let links = engine.phoneLinks()
        let state: [String: Any] = ["links": links.map { link in
            ["id": link.id, "title": link.title, "detail": link.detail, "address": link.address,
             "qr": QRCode.dataURL(for: link.url.absoluteString) ?? ""]
        }]
        phonePanel?.close()
        let panel = PanelWindow(title: "Open SynAmp on your phone", page: "phone.html", width: links.count > 1 ? 660 : 400, state: state)
        panel.onMessage = { message in
            guard message["action"] as? String == "copyLink", let id = message["id"] as? String,
                  let link = links.first(where: { $0.id == id }) else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(link.url.absoluteString, forType: .string)
        }
        panel.onClose = { [weak self, weak panel] in if self?.phonePanel === panel { self?.phonePanel = nil } }
        phonePanel = panel
        panel.show()
    }

    /// Open SynAmp's window on one screen (Listen anywhere, Settings).
    func open(screen: String) {
        let fresh = mainWindow == nil
        if fresh, let url = engine.openURL(screen: screen), let token = engine.accessToken {
            openWhenReady = false
            mainWindow = MainWindowController(note: { [engine] in engine.note($0) })
            mainWindow?.show(url, token: token)
            return
        }
        open()
        mainWindow?.go(to: screen)
    }

    /// The first line of the menu. The icon never carries the meaning alone:
    /// these words say the same thing, and VoiceOver reads them.
    var statusLine: String {
        switch status {
        case .needsSetup: return "Choose your music folder to start"
        case .starting: return settings.connection == nil ? "Starting…" : "Looking for SynAmp…"
        case .running:
            switch link {
            case .home: return "Connected to SynAmp at home"
            case .remote: return "Away from home: connected remotely"
            default: return "Running"
            }
        case .stopping: return "Stopping…"
        case .stopped: return "Stopped"
        case .away(let link):
            switch link {
            case .awayAsking: return "Away from home: not connected"
            case .awayOffline: return "Away from home: staying offline"
            case .unreachable(let hasRemote):
                return hasRemote ? "SynAmp isn't answering, at home or remotely" : "SynAmp at home isn't answering"
            default: return "Not connected"
            }
        case .problem(let why): return why
        }
    }

    // MARK: SynAmp somewhere else, and being away from home

    /// Every status change comes through here (from the engine, on the main actor).
    func statusChanged(_ next: Engine.Status) {
        let before = status
        status = next
        link = engine.link
        guard settings.connection != nil, before != next else { return }
        switch next {
        case .running:
            awayNotice.clear()
            // Home to remote, or back: an open window follows to the new address.
            if openWhenReady { open() }
            else if let token = engine.accessToken, let open = engine.openURL() { mainWindow?.retarget(open, token: token) }
        case .away(.awayAsking):
            offerRemote()
        default:
            awayNotice.clear()
        }
    }

    /// "You're away from home. Connect remotely?" Asked once each time away:
    /// in the window when it's open, otherwise as a notification. The menu
    /// has the same choice the whole time.
    private func offerRemote() {
        if let window = mainWindow?.window, mainWindow?.isShowing == true {
            let alert = NSAlert()
            alert.messageText = "You're away from home"
            alert.informativeText = "SynAmp at home isn't answering on this network. Connect to it remotely to keep playing your music? Away from Wi-Fi, this uses mobile data."
            alert.addButton(withTitle: "Connect Remotely")
            alert.addButton(withTitle: "Not Now")
            alert.showsSuppressionButton = true
            alert.suppressionButton?.title = "Always connect when I'm away from home"
            alert.beginSheetModal(for: window) { [weak self] response in
                guard let self else { return }
                let connect = response == .alertFirstButtonReturn
                if connect, alert.suppressionButton?.state == .on { self.setWhenAway(.connect) }
                self.answerAway(connect ? .connect : .notNow)
            }
        } else {
            awayNotice.show()
        }
    }

    func answerAway(_ choice: AwayChoice) {
        awayNotice.clear()
        engine.note("away from home: \(choice == .connect ? "connect remotely" : "not now")")
        Task { await engine.chooseAway(choice) }
    }

    func setWhenAway(_ value: WhenAway) {
        try? engine.update { $0.connection?.whenAway = value }
        settings = engine.settings
    }

    func checkConnection() {
        Task { await engine.checkConnectionNow() }
    }

    /// Connect this Mac to a SynAmp that runs somewhere else. Returns what went
    /// wrong, in words, or nil when it's connected.
    func finishConnection(home: String, token typed: String, remote: String, whenAway: WhenAway, listenFolder: URL?, startAtLogin: Bool) async -> String? {
        if let listenFolder {
            var isFolder: ObjCBool = false
            guard FileManager.default.fileExists(atPath: listenFolder.path, isDirectory: &isFolder), isFolder.boolValue else {
                return "The music folder for listening can't be found. If it's on your NAS, connect the share in Finder and choose it again."
            }
            guard ListenFolder.isShared(listenFolder) else {
                return "That doesn't look like the music folder your SynAmp uses: there's no “.synamp” folder beside it. Choose the same folder SynAmp on your NAS was given (often called “library”)."
            }
        }
        guard let homeURL = Connection.address(home) else {
            return "That address doesn't look right. It's something like Syd.local:8080."
        }
        let token = typed.isEmpty ? (engine.connectionToken ?? "") : typed
        guard !token.isEmpty else { return "Type the access token: the same one SynAmp's web page asks for." }
        let result = await ConnectionCheck.run(address: homeURL, token: token)
        guard case .ok(let known) = result else { return result.words }
        // Listen anywhere already set up: use its address unless another was typed.
        var away = remote.trimmingCharacters(in: .whitespacesAndNewlines)
        if away.isEmpty, let known { away = known }
        var remoteURL: URL?
        if !away.isEmpty {
            guard let url = Connection.address(away) else {
                return "The away-from-home address doesn't look right. It's something like syd.tail1234.ts.net:8080."
            }
            remoteURL = url
        }
        await engine.stop()
        do {
            try engine.saveConnection(Connection(home: homeURL.absoluteString, remote: remoteURL?.absoluteString, whenAway: whenAway,
                                                 listenFolder: listenFolder?.path, shareURL: listenFolder.flatMap { ListenFolder.shareURL(for: $0) }), token: token)
            try engine.update { $0.startAtLogin = startAtLogin }
        } catch {
            return "Couldn't save your choices: \(error.localizedDescription)"
        }
        closeFirstRun()
        settings = engine.settings
        loginItem = LoginItem.apply(startAtLogin)
        if remoteURL != nil { awayNotice.prepare() }
        await engine.start()
        if case .running = engine.status { open() } else { openWhenReady = true }
        return nil
    }

    /// Start at login / keep awake, from the menu.
    func setStartAtLogin(_ on: Bool) {
        try? engine.update { $0.startAtLogin = on }
        settings = engine.settings
        loginItem = LoginItem.apply(on)
        engine.note("start at login: \(loginItem)")
    }

    func setKeepAwake(_ on: Bool) {
        try? engine.update { $0.preventSleep = on }
        settings = engine.settings
    }

    func launch() async {
        // Keep the login item matching the setting (it can be changed in System Settings too).
        if engine.settings.isSetUp { loginItem = LoginItem.apply(engine.settings.startAtLogin) }
        awayNotice.onAnswer = { [weak self] choice in self?.answerAway(choice) }
        // Joining or leaving a network: look straight away, not at the next regular check.
        network.pathUpdateHandler = { [engine] _ in Task { await engine.checkConnectionNow() } }
        network.start(queue: .global(qos: .utility))
        if case .needsSetup = engine.status {
            showFirstRun()
            return
        }
        if engine.settings.connection?.remoteURL != nil { awayNotice.prepare() }
        await engine.start()
        if case .running = engine.status { open() } else if engine.settings.connection != nil { openWhenReady = true }
    }

    /// The setup window: the first run, "Connection settings…", or a
    /// "Connect the Mac app" link from SynAmp's web page (`filled`).
    func showFirstRun(filled: ConnectLink? = nil) {
        let connection = settings.connection
        var state: [String: Any] = [
            "isSetUp": settings.isSetUp,
            "place": filled != nil || connection != nil ? "elsewhere" : "thisMac",
            "musicFolder": settings.musicFolder ?? "",
            "home": filled?.home ?? connection?.home ?? "",
            "remote": filled?.remote ?? connection?.remote ?? "",
            "whenAway": (connection?.whenAway ?? .ask).rawValue,
            "listenHere": connection?.listenFolder != nil,
            "listenFolder": connection?.listenFolder ?? "",
            "hasSavedToken": connection != nil && !(engine.connectionToken ?? "").isEmpty,
            "startAtLogin": settings.startAtLogin,
        ]
        if let filled {
            state["token"] = filled.token
            state["filled"] = true
        }
        setupPanel?.close()
        let panel = PanelWindow(title: settings.isSetUp ? "Where SynAmp runs" : "Welcome to SynAmp", page: "setup.html", width: 660, state: state)
        panel.onMessage = { [weak self, weak panel] message in self?.setupMessage(message, from: panel) }
        panel.onClose = { [weak self, weak panel] in if self?.setupPanel === panel { self?.setupPanel = nil } }
        setupPanel = panel
        panel.show()
    }

    private func setupMessage(_ message: [String: Any], from panel: PanelWindow?) {
        func text(_ key: String) -> String { message[key] as? String ?? "" }
        let startAtLogin = message["startAtLogin"] as? Bool ?? true
        switch message["action"] as? String {
        case "chooseFolder":
            guard let picked = chooseMusicFolder() else { return }
            panel?.send(["type": "folder", "for": text("for"), "path": picked.path])
        case "startThisMac":
            guard !text("musicFolder").isEmpty else { return }
            Task {
                await finishSetup(musicFolder: URL(fileURLWithPath: text("musicFolder")), startAtLogin: startAtLogin)
                if case .problem(let why) = status { panel?.send(["type": "problem", "text": why]) }
            }
        case "connect":
            let whenAway = WhenAway(rawValue: text("whenAway")) ?? .ask
            let listen = text("listenFolder")
            Task {
                if let wrong = await finishConnection(home: text("home"), token: text("token"), remote: text("remote"), whenAway: whenAway,
                                                      listenFolder: listen.isEmpty ? nil : URL(fileURLWithPath: listen), startAtLogin: startAtLogin) {
                    panel?.send(["type": "problem", "text": wrong])
                }
            }
        default:
            break
        }
    }

    func closeFirstRun() {
        setupPanel?.close()
    }

    /// A "Connect the Mac app" link was opened (from SynAmp's web page).
    func openLink(_ url: URL) {
        guard let link = ConnectLink(url) else {
            engine.note("a link SynAmp doesn't understand was opened")
            return
        }
        engine.note("connect link opened for \(link.home)")
        showFirstRun(filled: link)
    }

    /// Show SynAmp in its own window.
    func open() {
        guard let url = engine.openURL(), let token = engine.accessToken else { return }
        openWhenReady = false
        if mainWindow == nil { mainWindow = MainWindowController(note: { [engine] in engine.note($0) }) }
        mainWindow?.show(url, token: token)
    }

    /// The same SynAmp in the default browser (it asks for nothing: the token goes along).
    func openInBrowser() {
        guard let url = engine.openURL() else { return }
        NSWorkspace.shared.open(url)
    }

    func chooseMusicFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.title = "Choose your music folder"
        panel.message = "SynAmp reads this folder. It changes nothing in it until you approve a change."
        panel.prompt = "Use this folder"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        return panel.runModal() == .OK ? panel.url : nil
    }

    func finishSetup(musicFolder: URL, startAtLogin: Bool) async {
        await engine.stop()  // changing from a SynAmp somewhere else: stop watching it first
        do {
            try engine.update {
                $0.musicFolder = musicFolder.path
                $0.startAtLogin = startAtLogin
                $0.connection = nil
            }
        } catch {
            status = .problem("Couldn't save your choices: \(error.localizedDescription)")
            return
        }
        settings = engine.settings
        loginItem = LoginItem.apply(startAtLogin)
        await engine.start()
        if case .running = engine.status {
            closeFirstRun()
            open()
            await engine.startListening()  // a new library: start listening to it straight away
        }
        // Otherwise the setup window stays and shows what went wrong.
    }

    /// "Change music folder…": choose, hear what will happen, then switch.
    func changeMusicFolder() {
        guard let picked = chooseMusicFolder(), picked.path != settings.musicFolder else { return }
        Task {
            let question = MusicFolderQuestion(folderName: picked.lastPathComponent, check: await engine.checkMove(to: picked))
            let alert = NSAlert()
            alert.messageText = question.title
            alert.informativeText = question.explanation
            alert.addButton(withTitle: "Use This Folder")
            alert.addButton(withTitle: "Cancel")
            NSApp.activate(ignoringOtherApps: true)
            guard alert.runModal() == .alertFirstButtonReturn else { return }
            do {
                try await engine.changeMusicFolder(to: picked, carryOver: question.carryOver)
            } catch {
                let failed = NSAlert()
                failed.messageText = "The music folder wasn't changed"
                failed.informativeText = String(describing: error)
                failed.runModal()
            }
            settings = engine.settings
            if case .running = engine.status {
                open()
                await engine.startListening()  // look through the folder straight away
            }
        }
    }

    func restart() async {
        await engine.stop()
        await engine.start()
        // The port may have changed: point the window at the new address.
        if case .running = engine.status, let url = engine.openURL(), let token = engine.accessToken { mainWindow?.reload(url, token: token) }
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Text(model.statusLine)
        ForEach(model.systemLines, id: \.self) { Text($0) }
        if case .running = model.status {
            Divider()
            Button("Open SynAmp") { model.open() }
                .keyboardShortcut("o")
            Button("Open in browser") { model.openInBrowser() }
            Button("Open on your phone…") { model.showPhoneLinks() }
            if model.system?.anywhere.ready == false {
                Button("Set up Listen anywhere…") { model.open(screen: "anywhere") }
            }
        }
        if case .needsSetup = model.status {
            Button("Choose music folder…") { model.showFirstRun() }
        }
        if case .problem = model.status {
            Button("Try again") { Task { await model.restart() } }
        }
        if case .away(let link) = model.status {
            switch link {
            case .awayAsking:
                Button("Connect remotely") { model.answerAway(.connect) }
                Button("Stay offline for now") { model.answerAway(.notNow) }
            case .awayOffline:
                Button("Connect remotely") { model.answerAway(.connect) }
            default:
                EmptyView()
            }
            Button("Check again") { model.checkConnection() }
        }
        if let connection = model.settings.connection {
            Divider()
            Picker("When I'm away from home", selection: Binding(get: { connection.whenAway }, set: { model.setWhenAway($0) })) {
                ForEach(WhenAway.allCases, id: \.self) { Text($0.label).tag($0) }
            }
            Button("Connection settings…") { model.showFirstRun() }
        }
        Divider()
        Toggle("Start at login", isOn: Binding(get: { model.settings.startAtLogin }, set: { model.setStartAtLogin($0) }))
        if case .needsApproval = model.loginItem {
            Button("Allow in System Settings…") {
                NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension")!)
            }
        }
        if model.settings.connection?.listensHere == true {
            Toggle("Keep this Mac awake while it listens to your library", isOn: Binding(get: { model.settings.preventSleep }, set: { model.setKeepAwake($0) }))
            if case .failed = model.pieces["listening"] {
                Text("Listening on this Mac has stopped. “Show logs” has the details")
            }
        }
        if model.settings.connection == nil {
            Toggle("Keep this Mac awake while SynAmp works", isOn: Binding(get: { model.settings.preventSleep }, set: { model.setKeepAwake($0) }))
            if let folder = model.settings.musicFolder, !folder.isEmpty {
                Text("Music folder: \(URL(fileURLWithPath: folder).lastPathComponent)")
                Button("Change music folder…") { model.changeMusicFolder() }
            }
            if model.settings.isSetUp {
                Button("Use a SynAmp on a NAS or another computer…") { model.showFirstRun() }
            }
        }
        Divider()
        if model.updates.available {
            Button("Check for updates…") { model.updates.checkNow() }
        }
        Button("Show logs") {
            NSWorkspace.shared.open(model.engine.paths.logs)
        }
        Button("Quit SynAmp") { NSApp.terminate(nil) }
            .keyboardShortcut("q")
    }
}

/// The "You're away from home" notification, for when SynAmp's window isn't
/// open. Shown once each time away; the menu has the same two choices.
@MainActor
final class AwayNotice: NSObject, UNUserNotificationCenterDelegate {
    private static let id = "org.synamp.away"
    private static let category = "org.synamp.away.choice"
    var onAnswer: ((AwayChoice) -> Void)?
    private var prepared = false

    /// Notifications need a real app (not a bare program run from a checkout).
    private var usable: Bool { Bundle.main.bundleIdentifier != nil }

    /// Ask for permission to show it. Only called once a remote address is set,
    /// so someone who never uses "connect remotely" is never asked.
    func prepare() {
        guard usable, !prepared else { return }
        prepared = true
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [
            UNNotificationAction(identifier: "connect", title: "Connect Remotely", options: []),
            UNNotificationAction(identifier: "not-now", title: "Not Now", options: []),
        ], intentIdentifiers: [])])
        center.requestAuthorization(options: [.alert]) { _, _ in }
    }

    func show() {
        guard usable, prepared else { return }
        let content = UNMutableNotificationContent()
        content.title = "You're away from home"
        content.body = "SynAmp at home isn't answering on this network. Connect to it remotely?"
        content.categoryIdentifier = Self.category
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.id, content: content, trigger: nil))
    }

    func clear() {
        guard usable, prepared else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.id])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let action = response.actionIdentifier
        Task { @MainActor in
            switch action {
            case "connect", UNNotificationDefaultActionIdentifier: self.onAnswer?(.connect)
            case "not-now": self.onAnswer?(.notNow)
            default: break  // dismissed: the menu still offers both
            }
        }
        completionHandler()
    }

    /// Show it even when SynAmp is the app in front (its window may be closed).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list])
    }
}

enum QRCode {
    /// A QR code as a picture a web page can show (sharp black squares; the page scales it without blurring).
    static func dataURL(for text: String) -> String? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let rep = NSBitmapImageRep(ciImage: scaled)
        guard let png = rep.representation(using: .png, properties: [:]) else { return nil }
        return "data:image/png;base64," + png.base64EncodedString()
    }
}
