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
    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { await AppModel.shared.launch() }
    }

    /// Quit stops every piece first (the librarian may need a moment to finish).
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        Task {
            await AppModel.shared.engine.stop()
            await MainActor.run { NSApp.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }
}

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    let engine: Engine
    @Published var status: Engine.Status
    @Published var pieces: [String: Supervisor.State] = [:]
    private var firstRunWindow: NSWindow?

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
            ? KeychainTokenStore() : KeychainTokenStore(account: "access-token-dev")
        engine = Engine(paths: paths, layout: layout, tokens: tokens)
        status = engine.status
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

    func launch() async {
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

    /// Open SynAmp in the browser (the app's own window comes next).
    func open() {
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
        await engine.start()
        if case .running = engine.status { open() }
    }

    func restart() async {
        await engine.stop()
        await engine.start()
    }
}

struct MenuContent: View {
    @ObservedObject var model: AppModel

    var body: some View {
        Text(model.statusLine)
        if case .running = model.status {
            Button("Open SynAmp") { model.open() }
                .keyboardShortcut("o")
        }
        if case .needsSetup = model.status {
            Button("Choose music folder…") { model.showFirstRun() }
        }
        if case .problem = model.status {
            Button("Try again") { Task { await model.restart() } }
        }
        Divider()
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
