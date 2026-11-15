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

    /// Clicking SynAmp in the Dock (or opening it again) brings the window back.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
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
    private var firstRunWindow: NSWindow?
    private var phoneWindow: NSWindow?
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
        let view = PhoneLinksView(links: engine.phoneLinks())
        if phoneWindow == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: view))
            window.title = "Open SynAmp on your phone"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.center()
            phoneWindow = window
        } else {
            phoneWindow?.contentViewController = NSHostingController(rootView: view)
        }
        NSApp.activate(ignoringOtherApps: true)
        phoneWindow?.makeKeyAndOrderFront(nil)
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

    /// The first-run window (AppKit-made, so it opens only when needed).
    func showFirstRun() {
        if firstRunWindow == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: FirstRunView(model: self)))
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.center()
            firstRunWindow = window
        } else if firstRunWindow?.isVisible != true {
            // Opened again later (Connection settings): start from what's saved now.
            firstRunWindow?.contentViewController = NSHostingController(rootView: FirstRunView(model: self))
        }
        firstRunWindow?.title = settings.isSetUp ? "Where SynAmp runs" : "Welcome to SynAmp"
        NSApp.activate(ignoringOtherApps: true)
        firstRunWindow?.makeKeyAndOrderFront(nil)
    }

    func closeFirstRun() {
        firstRunWindow?.close()
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
        closeFirstRun()
        settings = engine.settings
        loginItem = LoginItem.apply(startAtLogin)
        await engine.start()
        if case .running = engine.status {
            open()
            await engine.startListening()  // a new library: start listening to it straight away
        }
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

struct FirstRunView: View {
    enum Place: Hashable { case thisMac, elsewhere }

    @ObservedObject var model: AppModel
    @State private var place: Place
    @State private var folder: URL?
    @State private var home: String
    @State private var token = ""
    @State private var remote: String
    @State private var whenAway: WhenAway
    @State private var listenHere: Bool
    @State private var listenFolder: URL?
    @State private var startAtLogin: Bool
    @State private var working = false
    @State private var problem = ""
    @AccessibilityFocusState private var problemFocused: Bool

    init(model: AppModel) {
        self.model = model
        let settings = model.settings
        _place = State(initialValue: settings.connection == nil ? .thisMac : .elsewhere)
        _folder = State(initialValue: settings.musicFolder.flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0) })
        _home = State(initialValue: settings.connection?.home ?? "")
        _remote = State(initialValue: settings.connection?.remote ?? "")
        _whenAway = State(initialValue: settings.connection?.whenAway ?? .ask)
        _listenHere = State(initialValue: settings.connection?.listensHere ?? false)
        _listenFolder = State(initialValue: settings.connection?.listenFolder.flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0) })
        _startAtLogin = State(initialValue: settings.startAtLogin)
    }

    private var hasSavedToken: Bool { model.settings.connection != nil && !(model.engine.connectionToken ?? "").isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(model.settings.isSetUp ? "Where SynAmp runs" : "Welcome to SynAmp")
                .font(.largeTitle)
                .accessibilityAddTraits(.isHeader)
            Text("SynAmp listens to the music you own and makes playlists from it, on this Mac and your phone.")
                .fixedSize(horizontal: false, vertical: true)

            Picker("Where does SynAmp run?", selection: $place) {
                Text("On this Mac").tag(Place.thisMac)
                Text("It's already running on my NAS or another computer").tag(Place.elsewhere)
            }
            .pickerStyle(.radioGroup)

            if place == .thisMac { thisMac } else { elsewhere }

            Toggle("Start SynAmp when this Mac starts", isOn: $startAtLogin)

            if !problem.isEmpty {
                Label(problem, systemImage: "exclamationmark.triangle")
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($problemFocused)
            }

            HStack {
                Spacer()
                Button(buttonTitle) { finish() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(working || (place == .thisMac ? folder == nil
                                          : home.isEmpty || (token.isEmpty && !hasSavedToken) || (listenHere && listenFolder == nil)))
            }
        }
        .padding(24)
        .frame(width: 560)
    }

    private var buttonTitle: String {
        if place == .thisMac { return working ? "Starting…" : "Start SynAmp" }
        return working ? "Checking…" : "Connect"
    }

    private func finish() {
        working = true
        problem = ""
        Task {
            if place == .thisMac, let folder {
                await model.finishSetup(musicFolder: folder, startAtLogin: startAtLogin)
            } else if place == .elsewhere {
                if let wrong = await model.finishConnection(home: home, token: token, remote: remote, whenAway: whenAway,
                                                            listenFolder: listenHere ? listenFolder : nil, startAtLogin: startAtLogin) {
                    problem = wrong
                    problemFocused = true  // VoiceOver goes to what went wrong
                }
            }
            working = false
        }
    }

    private var thisMac: some View {
        Group {
            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Where's your music?").font(.headline).accessibilityAddTraits(.isHeader)
                    HStack {
                        Text(folder?.path ?? "No folder chosen yet")
                            .foregroundStyle(folder == nil ? .secondary : .primary)
                            .lineLimit(2)
                            .truncationMode(.middle)
                        Spacer()
                        Button(folder == nil ? "Choose…" : "Change…") {
                            if let picked = model.chooseMusicFolder() { folder = picked }
                        }
                    }
                    if folder?.path.hasPrefix("/Volumes/") == true {
                        Text("This folder is on another drive or a NAS. Keep it connected so SynAmp can play and listen.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                }
                .padding(4)
            }

            Text("Listening to your library takes a while the first time. A newer computer finishes sooner, and you can play music the whole time. This Mac and your music need to stay on for SynAmp's smart features.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var elsewhere: some View {
        Group {
            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Connect to your SynAmp").font(.headline).accessibilityAddTraits(.isHeader)
                    Text("Do this once while this Mac is on your home network.")
                        .font(.callout).foregroundStyle(.secondary)
                    Form {
                        TextField("Address at home:", text: $home, prompt: Text("Syd.local:8080"))
                        SecureField("Access token:", text: $token, prompt: Text(hasSavedToken ? "Saved. Type a new one to change it" : "The one SynAmp's web page asks for"))
                        TextField("Address away from home:", text: $remote, prompt: Text("Optional, e.g. syd.tail1234.ts.net:8080"))
                        Picker("When I'm away from home:", selection: $whenAway) {
                            ForEach(WhenAway.allCases, id: \.self) { Text($0.label).tag($0) }
                        }
                    }
                    Text("The away-from-home address comes from Listen anywhere in SynAmp. If you've set that up already, leave it empty and SynAmp fills it in.")
                        .font(.callout).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(4)
            }

            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    Toggle("Use this Mac to listen to the library", isOn: $listenHere)
                    Text("SynAmp learns your songs by listening to them, and a NAS is usually too slow for that. This Mac can do it whenever it's on your home network. Away from home it waits.")
                        .font(.callout).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if listenHere {
                        HStack {
                            Text(listenFolder?.path ?? "No folder chosen yet")
                                .foregroundStyle(listenFolder == nil ? .secondary : .primary)
                                .lineLimit(2)
                                .truncationMode(.middle)
                            Spacer()
                            Button(listenFolder == nil ? "Choose music folder…" : "Change…") {
                                if let picked = model.chooseMusicFolder() { listenFolder = picked }
                            }
                        }
                        Text("Choose the same music folder your SynAmp uses, as this Mac sees it: for example the “library” folder on your NAS share.")
                            .font(.callout).foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(4)
            }

            Text("This Mac shows and plays the SynAmp that's already running. Away from home it can connect remotely, and it asks first unless you choose otherwise.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
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

/// QR codes for opening SynAmp on a phone, with the address in words beside
/// each one and a Copy button for anyone who can't scan.
struct PhoneLinksView: View {
    let links: [PhoneLink]
    @State private var copied: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Open SynAmp on your phone")
                .font(.title)
                .accessibilityAddTraits(.isHeader)
            if links.isEmpty {
                Text("SynAmp isn't running yet, or this Mac has no name on your network that a phone can use. Start SynAmp and try again.")
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Point your phone's camera at a code and tap the link. It opens SynAmp already signed in.")
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .top, spacing: 24) {
                    ForEach(links) { link in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(link.title).font(.headline).accessibilityAddTraits(.isHeader)
                            if let image = QRCode.image(for: link.url.absoluteString) {
                                Image(nsImage: image)
                                    .interpolation(.none)
                                    .resizable()
                                    .frame(width: 200, height: 200)
                                    .padding(10)
                                    .background(Color.white)  // codes scan best dark on white, in light or dark mode
                                    .accessibilityLabel("QR code for \(link.address)")
                            }
                            Text(link.detail).font(.callout).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(link.address).font(.callout.monospaced()).textSelection(.enabled)
                            HStack {
                                Button("Copy link") {
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString(link.url.absoluteString, forType: .string)
                                    copied = link.id
                                }
                                if copied == link.id { Text("Copied").font(.callout).foregroundStyle(.secondary) }
                            }
                        }
                        .frame(width: 220, alignment: .leading)
                    }
                }
                Label("Anyone who scans a code can use your SynAmp. Show it only to people you'd hand your music to.", systemImage: "lock")
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(24)
        .frame(minWidth: 320, maxWidth: 560, alignment: .leading)
    }
}

enum QRCode {
    /// A QR code as sharp black squares (the view scales it without blurring).
    static func image(for text: String) -> NSImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let rep = NSCIImageRep(ciImage: scaled)
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        return image
    }
}
