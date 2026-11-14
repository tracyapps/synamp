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
        /// SynAmp runs somewhere else and can't be used from here right now
        /// (away from home, or it's off). The link says which, and what's on offer.
        case away(LinkState)
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
    private var watcher: ActivityWatcher?
    /// The access token for a SynAmp that runs somewhere else (kept apart from this Mac's own).
    private let connectionTokens: TokenStore
    private let probe: ConnectionMonitor.Probe
    private let connectionCheckEvery: TimeInterval
    private var monitor: ConnectionMonitor?
    /// Keeps the Mac awake while SynAmp is busy (when the setting allows).
    public let keepAwake: KeepAwake

    /// Told about every status change (on a background queue).
    public var onStatus: (@Sendable (Status) -> Void)?
    /// Told when a single piece changes (for the menu's details).
    public var onPiece: (@Sendable (String, Supervisor.State) -> Void)?

    public init(paths: AppPaths, layout: RuntimeLayout, tokens: TokenStore,
                isFree: @escaping (Int) -> Bool = { Ports.isFree($0) }, keepAwake: KeepAwake = KeepAwake(),
                connectionTokens: TokenStore = MemoryTokenStore(), probe: @escaping ConnectionMonitor.Probe = ConnectionMonitor.http(),
                connectionCheckEvery: TimeInterval = 20) {
        self.keepAwake = keepAwake
        self.connectionTokens = connectionTokens
        self.probe = probe
        self.connectionCheckEvery = connectionCheckEvery
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
    /// Where things stand with a SynAmp that runs somewhere else (nil: it runs on this Mac).
    public var link: LinkState? { lock.withLock { self.monitor }?.link }
    /// The token the window hands to the web app: this Mac's own, or the connection's.
    public var accessToken: String? { settings.connection != nil ? connectionTokens.read() : plan?.token }
    public var connectionToken: String? { connectionTokens.read() }

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
        // Turning "keep awake" off lets the Mac sleep straight away.
        if !next.preventSleep { keepAwake.update(busy: false, allowed: false) }
        else if let watcher = lock.withLock({ self.watcher }) { Task { await watcher.check() } }
        // A changed address or "when I'm away" choice counts from now.
        if let monitor = lock.withLock({ self.monitor }) { Task { await monitor.check() } }
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
        case .starting, .running, .away: return
        default: break
        }
        guard settings.isSetUp else { set(.needsSetup); return }
        if settings.connection != nil {
            await startConnected()
            return
        }
        set(.starting)
        let leftovers = LeftoverProcesses(file: paths.runningFile)
        let stopped = leftovers.stopLeftovers()
        if !stopped.isEmpty { note("stopped leftovers from last time: \(stopped.joined(separator: ", "))") }
        do {
            let plan = try prepare()
            let supervisor = Supervisor(specs: try plan.services(), logURL: { [paths] in paths.log(for: $0.name) })
            supervisor.onChange = { [weak self, weak supervisor] name, state in
                self?.note("\(name): \(state)")
                if state == .running, let supervisor { leftovers.record(supervisor.runningProcesses) }
                self?.onPiece?(name, state)
            }
            lock.withLock { self.supervisor = supervisor }
            try await supervisor.start()
            set(.running(plan.localURL))
            let watcher = ActivityWatcher(fetch: ActivityWatcher.http(base: plan.localURL, token: plan.token),
                                          keepAwake: keepAwake, allowed: { [weak self] in self?.settings.preventSleep ?? false })
            lock.withLock { self.watcher = watcher }
            watcher.start()
        } catch {
            set(.problem(String(describing: error)))
        }
    }

    // MARK: SynAmp somewhere else

    /// SynAmp runs on a NAS or another computer: start nothing here, find out
    /// whether it answers (at home, or remotely), and keep watching.
    private func startConnected() async {
        set(.starting)
        let monitor = ConnectionMonitor(connection: { [weak self] in self?.settings.connection }, probe: probe)
        monitor.onChange = { [weak self] link in self?.linkChanged(link) }
        lock.withLock { self.monitor = monitor }
        guard await monitor.check() != nil else {
            lock.withLock { self.monitor = nil }
            set(.problem("The address for SynAmp isn't one this Mac can use. Open Connection settings and check it."))
            return
        }
        monitor.start(every: connectionCheckEvery)
    }

    private func linkChanged(_ link: LinkState) {
        note("connection: \(link)")
        if let url = link.url { set(.running(url)) } else { set(.away(link)) }
    }

    /// Save where SynAmp runs (from the first run or Connection settings).
    public func saveConnection(_ connection: Connection, token: String) throws {
        try connectionTokens.write(token)
        try update { $0.connection = connection }
    }

    /// The person's answer to "Connect remotely?", for this time away.
    public func chooseAway(_ choice: AwayChoice) async {
        let monitor = lock.withLock { self.monitor }
        await monitor?.choose(choice)
    }

    /// Look again now (the network changed, the Mac woke, or "Check again").
    public func checkConnectionNow() async {
        let monitor = lock.withLock { self.monitor }
        await monitor?.check()
    }

    /// Start listening to the whole library (after the first run): find the
    /// songs, then listen to them. The same as "Start analysis" in the app.
    public func startListening() async {
        guard let plan else { return }
        for action in ["update", "analyze"] {
            var request = URLRequest(url: plan.localURL.appendingPathComponent("api/v1/analyzer/request"))
            request.httpMethod = "POST"
            request.timeoutInterval = 10
            request.setValue("Bearer \(plan.token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["action": action])
            let code = ((try? await URLSession.shared.data(for: request))?.1 as? HTTPURLResponse)?.statusCode
            note("asked listening to \(action): \(code.map(String.init) ?? "no answer")")
        }
    }

    /// Stop every piece (Quit, or before changing the music folder).
    public func stop() async {
        if let monitor = lock.withLock({ self.monitor }) {
            monitor.stop()
            lock.withLock { self.monitor = nil }
            set(.stopped)
            return
        }
        guard let supervisor = lock.withLock({ self.supervisor }) else {
            note("stop: nothing running")
            return
        }
        set(.stopping)
        lock.withLock { self.watcher }?.stop()
        lock.withLock { self.watcher = nil }
        await supervisor.stop()
        LeftoverProcesses(file: paths.runningFile).clear()
        lock.withLock { self.supervisor = nil }
        set(.stopped)
    }

    /// The address to open SynAmp at, with the token handed over once in the
    /// fragment (never sent to the network; the web app keeps it for the tab).
    public func openURL() -> URL? {
        if settings.connection != nil {
            guard let base = link?.url, let token = connectionTokens.read(), !token.isEmpty else { return nil }
            return URL(string: "\(base.absoluteString)/#/library?access=\(token)")
        }
        guard let plan else { return nil }
        return URL(string: "\(plan.localURL.absoluteString)/#/library?access=\(plan.token)")
    }
}
