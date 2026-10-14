import Foundation

/// SynAmp as a whole: settings in, pieces running, one status out. The app's
/// window and menu only talk to this.
public final class Engine: @unchecked Sendable {
    public enum Status: Equatable, Sendable {
        /// No music folder yet: show the first run.
        case needsSetup
        case starting
        case running(URL)
        case stopping
        case stopped
        /// Something's wrong, in words for the person.
        case problem(String)
    }

    public let paths: AppPaths
    public let layout: RuntimeLayout
    private let tokens: TokenStore
    private let isFree: (Int) -> Bool
    private let lock = NSLock()
    private var supervisor: Supervisor?
    private var _status: Status
    private var _settings: AppSettings
    private var _plan: LaunchPlan?

    /// Told about every status change (on a background queue).
    public var onStatus: (@Sendable (Status) -> Void)?
    /// Told when a single piece changes (for the menu's details).
    public var onPiece: (@Sendable (String, Supervisor.State) -> Void)?

    public init(paths: AppPaths, layout: RuntimeLayout, tokens: TokenStore,
                isFree: @escaping (Int) -> Bool = { Ports.isFree($0) }) {
        self.paths = paths
        self.layout = layout
        self.tokens = tokens
        self.isFree = isFree
        _settings = AppSettings.load(from: paths.settingsFile)
        _status = _settings.isSetUp ? .stopped : .needsSetup
    }

    public var status: Status { lock.withLock { _status } }
    public var settings: AppSettings { lock.withLock { _settings } }
    public var plan: LaunchPlan? { lock.withLock { _plan } }

    private func set(_ status: Status) {
        lock.withLock { _status = status }
        note("status: \(status)")
        onStatus?(status)
    }

    /// One line in ~/Library/Logs/SynAmp/app.log (what the app itself did), so
    /// "Show logs" and Send feedback can tell what happened.
    public func note(_ line: String) {
        let url = paths.log(for: "app")
        let text = "\(ISO8601DateFormatter().string(from: Date())) \(line)\n"
        try? FileManager.default.createDirectory(at: paths.logs, withIntermediateDirectories: true)
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(Data(text.utf8))
            try? handle.close()
        } else {
            try? Data(text.utf8).write(to: url)
        }
    }

    /// Save new settings (from the first run or Settings).
    public func update(_ change: (inout AppSettings) -> Void) throws {
        var next = settings
        change(&next)
        try paths.create()
        try next.save(to: paths.settingsFile)
        lock.withLock { _settings = next }
        if case .needsSetup = status, next.isSetUp { set(.stopped) }
    }

    /// Everything the pieces need, worked out now: ports, token, folders.
    public func prepare() throws -> LaunchPlan {
        let settings = self.settings
        guard settings.isSetUp else { throw LaunchError.noMusicFolder }
        let missing = layout.missing()
        guard missing.isEmpty else { throw LaunchError.missingPieces(missing) }
        try paths.create()
        guard let port = Ports.pick(preferred: settings.port, isFree: isFree),
              let navidromePort = Ports.pick(preferred: 4533, avoiding: [port], isFree: isFree) else {
            throw LaunchError.noFreePort
        }
        let token = try tokens.tokenCreatingIfNeeded()
        let plan = LaunchPlan(paths: paths, layout: layout, settings: settings, port: port,
                              navidromePort: navidromePort, token: token)
        lock.withLock { _plan = plan }
        return plan
    }

    /// Start SynAmp. Status says how it went; nothing is thrown at the window.
    public func start() async {
        switch status {
        case .starting, .running: return
        default: break
        }
        guard settings.isSetUp else { set(.needsSetup); return }
        set(.starting)
        do {
            let plan = try prepare()
            let supervisor = Supervisor(specs: try plan.services(), logURL: { [paths] in paths.log(for: $0.name) })
            supervisor.onChange = { [weak self] name, state in
                self?.note("\(name): \(state)")
                self?.onPiece?(name, state)
            }
            lock.withLock { self.supervisor = supervisor }
            try await supervisor.start()
            set(.running(plan.localURL))
        } catch {
            set(.problem(String(describing: error)))
        }
    }

    /// Stop every piece (Quit, or before changing the music folder).
    public func stop() async {
        guard let supervisor = lock.withLock({ self.supervisor }) else { return }
        set(.stopping)
        await supervisor.stop()
        lock.withLock { self.supervisor = nil }
        set(.stopped)
    }

    /// The address to open SynAmp at, with the token handed over once in the
    /// fragment (never sent to the network; the web app keeps it for the tab).
    public func openURL() -> URL? {
        guard let plan else { return nil }
        return URL(string: "\(plan.localURL.absoluteString)/#/library?access=\(plan.token)")
    }
}
