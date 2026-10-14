import AppKit
import SwiftUI
import SynAmpCore

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
            Label("SynAmp", systemImage: model.menuSymbol)
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
    private var firstRunWindow: NSWindow?
    private var mainWindow: MainWindowController?
    let updates = Updates()

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
        let tokens: TokenStore = ProcessInfo.processInfo.environment["SYNAMP_DEV_SUPPORT"] == nil
            ? KeychainTokenStore() : FileTokenStore(file: paths.support.appendingPathComponent("dev-token"))
        engine = Engine(paths: paths, layout: layout, tokens: tokens)
        status = engine.status
        settings = engine.settings
        engine.onStatus = { status in Task { @MainActor in AppModel.shared.status = status } }
        engine.onPiece = { name, state in Task { @MainActor in AppModel.shared.pieces[name] = state } }
    }

    var menuSymbol: String {
        switch status {
        case .running: return "waveform"
        case .problem: return "exclamationmark.triangle"
        default: return "waveform.slash"
        }
    }

    var statusLine: String {
        switch status {
        case .needsSetup: return "Choose your music folder to start"
        case .starting: return "Starting…"
        case .running: return "Running"
        case .stopping: return "Stopping…"
        case .stopped: return "Stopped"
        case .problem(let why): return why
        }
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
        if case .needsSetup = engine.status {
            showFirstRun()
            return
        }
        await engine.start()
        if case .running = engine.status { open() }
    }

    /// The first-run window (AppKit-made, so it opens only when needed).
    func showFirstRun() {
        if firstRunWindow == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: FirstRunView(model: self)))
            window.title = "Welcome to SynAmp"
            window.styleMask = [.titled, .closable]
            window.isReleasedWhenClosed = false
            window.center()
            firstRunWindow = window
        }
        NSApp.activate(ignoringOtherApps: true)
        firstRunWindow?.makeKeyAndOrderFront(nil)
    }

    func closeFirstRun() {
        firstRunWindow?.close()
    }

    /// Show SynAmp in its own window.
    func open() {
        guard let url = engine.openURL(), let token = engine.plan?.token else { return }
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
        do {
            try engine.update {
                $0.musicFolder = musicFolder.path
                $0.startAtLogin = startAtLogin
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

    func restart() async {
        await engine.stop()
        await engine.start()
        // The port may have changed: point the window at the new address.
        if case .running = engine.status, let url = engine.openURL(), let token = engine.plan?.token { mainWindow?.reload(url, token: token) }
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Text(model.statusLine)
        if case .running = model.status {
            Button("Open SynAmp") { model.open() }
                .keyboardShortcut("o")
            Button("Open in browser") { model.openInBrowser() }
        }
        if case .needsSetup = model.status {
            Button("Choose music folder…") { model.showFirstRun() }
        }
        if case .problem = model.status {
            Button("Try again") { Task { await model.restart() } }
        }
        Divider()
        Toggle("Start at login", isOn: Binding(get: { model.settings.startAtLogin }, set: { model.setStartAtLogin($0) }))
        if case .needsApproval = model.loginItem {
            Button("Allow in System Settings…") {
                NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.LoginItems-Settings.extension")!)
            }
        }
        Toggle("Keep this Mac awake while SynAmp works", isOn: Binding(get: { model.settings.preventSleep }, set: { model.setKeepAwake($0) }))
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
    @ObservedObject var model: AppModel
    @State private var folder: URL?
    @State private var startAtLogin = true
    @State private var working = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Welcome to SynAmp")
                .font(.largeTitle)
                .accessibilityAddTraits(.isHeader)
            Text("SynAmp listens to the music you own and makes playlists from it, on this Mac and your phone.")
                .fixedSize(horizontal: false, vertical: true)

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

            Toggle("Start SynAmp when this Mac starts", isOn: $startAtLogin)

            HStack {
                Spacer()
                Button(working ? "Starting…" : "Start SynAmp") {
                    guard let folder else { return }
                    working = true
                    Task {
                        await model.finishSetup(musicFolder: folder, startAtLogin: startAtLogin)
                        working = false
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(folder == nil || working)
            }
        }
        .padding(24)
        .frame(width: 520)
    }
}
