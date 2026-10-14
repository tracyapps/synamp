import Foundation

/// Starts SynAmp's pieces in order, starts a piece again if it stops on its
/// own (waiting a little longer each time), and stops them all on Quit.
public final class Supervisor: @unchecked Sendable {
    public enum State: Equatable, Sendable {
        case stopped
        case starting
        case running
        /// It stopped on its own; trying again in `seconds`.
        case restarting(attempt: Int, seconds: TimeInterval)
        /// Gave up (it kept stopping) or couldn't start at all.
        case failed(String)
    }

    /// How long to wait before starting a piece again: 1, 2, 4 … up to `maximum`.
    public struct Backoff: Sendable {
        public var first: TimeInterval
        public var maximum: TimeInterval
        /// After this many quick restarts in a row, stop trying and say so.
        public var giveUpAfter: Int
        /// Running this long counts as healthy again (the count starts over).
        public var stableAfter: TimeInterval
        public init(first: TimeInterval = 1, maximum: TimeInterval = 60, giveUpAfter: Int = 8, stableAfter: TimeInterval = 300) {
            self.first = first
            self.maximum = maximum
            self.giveUpAfter = giveUpAfter
            self.stableAfter = stableAfter
        }
        public func delay(attempt: Int) -> TimeInterval {
            min(maximum, first * pow(2, Double(max(0, attempt - 1))))
        }
    }

    public typealias HealthCheck = @Sendable (URL) async -> Bool

    private struct Running {
        var process: Process
        var startedAt: Date
        var attempts: Int
        var log: FileHandle?
    }

    public let specs: [ServiceSpec]
    private let logURL: (ServiceSpec) -> URL
    private let backoff: Backoff
    private let healthWait: TimeInterval
    private let healthCheck: HealthCheck
    private let queue = DispatchQueue(label: "org.synamp.supervisor")
    private var running: [String: Running] = [:]
    private var states: [String: State] = [:]
    private var stopping = false
    private var restartTimers: [String: DispatchWorkItem] = [:]

    /// Told about every change, on a background queue.
    public var onChange: (@Sendable (String, State) -> Void)?

    public init(specs: [ServiceSpec], logURL: @escaping (ServiceSpec) -> URL, backoff: Backoff = Backoff(),
                healthWait: TimeInterval = 60, healthCheck: @escaping HealthCheck = Supervisor.httpHealthCheck) {
        self.specs = specs
        self.logURL = logURL
        self.backoff = backoff
        self.healthWait = healthWait
        self.healthCheck = healthCheck
        for spec in specs { states[spec.name] = .stopped }
    }

    public func state(of name: String) -> State { queue.sync { states[name] ?? .stopped } }
    public var allStates: [String: State] { queue.sync { states } }

    /// Start every piece in order, each one ready before the next. Throws (and
    /// stops what did start) if one can't be started or never answers.
    public func start() async throws {
        queue.sync { stopping = false }
        for spec in specs {
            do {
                try launch(spec, attempts: 0)
                if let health = spec.health {
                    guard await waitUntilHealthy(health, name: spec.name) else {
                        throw SupervisorError.notReady(spec.label)
                    }
                }
                set(spec.name, .running)
            } catch {
                set(spec.name, .failed(String(describing: error)))
                await stop()
                throw error
            }
        }
    }

    /// Stop everything, newest first: ask nicely, wait its grace time, then insist.
    public func stop() async {
        let toStop: [(ServiceSpec, Process)] = queue.sync {
            stopping = true
            restartTimers.values.forEach { $0.cancel() }
            restartTimers.removeAll()
            return specs.reversed().compactMap { spec in running[spec.name].map { (spec, $0.process) } }
        }
        for (spec, process) in toStop {
            if process.isRunning { process.terminate() }  // SIGTERM
            let deadline = Date().addingTimeInterval(spec.stopGrace)
            while process.isRunning && Date() < deadline { try? await Task.sleep(nanoseconds: 100_000_000) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
            queue.sync {
                try? running[spec.name]?.log?.close()
                running[spec.name] = nil
            }
            set(spec.name, .stopped)
        }
    }

    // MARK: - inside

    private func launch(_ spec: ServiceSpec, attempts: Int) throws {
        let process = Process()
        process.executableURL = spec.executable
        process.arguments = spec.arguments
        process.environment = spec.environment
        process.currentDirectoryURL = spec.workingDirectory
        let log = try openLog(for: spec)
        process.standardOutput = log
        process.standardError = log
        process.standardInput = FileHandle.nullDevice
        process.terminationHandler = { [weak self] ended in self?.ended(spec, process: ended) }
        set(spec.name, .starting)
        do {
            try process.run()
        } catch {
            try? log.close()
            throw SupervisorError.couldNotStart(spec.label, error.localizedDescription)
        }
        queue.sync { running[spec.name] = Running(process: process, startedAt: Date(), attempts: attempts, log: log) }
    }

    private func ended(_ spec: ServiceSpec, process: Process) {
        let decision: (attempt: Int, delay: TimeInterval)? = queue.sync {
            guard !stopping, let current = running[spec.name], current.process === process else { return nil }
            try? current.log?.close()
            running[spec.name] = nil
            let ranLong = Date().timeIntervalSince(current.startedAt) >= backoff.stableAfter
            let attempt = ranLong ? 1 : current.attempts + 1
            if attempt > backoff.giveUpAfter { return (attempt, -1) }
            return (attempt, backoff.delay(attempt: attempt))
        }
        guard let decision else { return }
        if decision.delay < 0 {
            set(spec.name, .failed("\(spec.label) kept stopping; see its log in ~/Library/Logs/SynAmp"))
            return
        }
        set(spec.name, .restarting(attempt: decision.attempt, seconds: decision.delay))
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.queue.sync(execute: { self.stopping }) else { return }
            do {
                try self.launch(spec, attempts: decision.attempt)
                self.set(spec.name, .running)
            } catch {
                self.set(spec.name, .failed(String(describing: error)))
            }
        }
        queue.sync { restartTimers[spec.name] = work }
        DispatchQueue.global().asyncAfter(deadline: .now() + decision.delay, execute: work)
    }

    private func waitUntilHealthy(_ url: URL, name: String) async -> Bool {
        let deadline = Date().addingTimeInterval(healthWait)
        while Date() < deadline {
            if await healthCheck(url) { return true }
            // Started and already gone: no point waiting out the whole minute.
            let alive = queue.sync { running[name]?.process.isRunning ?? false }
            if !alive && queue.sync(execute: { restartTimers[name] == nil }) { return false }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return false
    }

    private func set(_ name: String, _ state: State) {
        let changed: Bool = queue.sync {
            guard states[name] != state else { return false }
            states[name] = state
            return true
        }
        if changed { onChange?(name, state) }
    }

    /// Append to the piece's log; a log over 5 MB is kept as `.1` and started fresh.
    private func openLog(for spec: ServiceSpec) throws -> FileHandle {
        let url = logURL(spec)
        let fm = FileManager.default
        try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let size = (try? fm.attributesOfItem(atPath: url.path)[.size]) as? NSNumber, size.intValue > 5_000_000 {
            let old = url.appendingPathExtension("1")
            try? fm.removeItem(at: old)
            try? fm.moveItem(at: url, to: old)
        }
        if !fm.fileExists(atPath: url.path) { fm.createFile(atPath: url.path, contents: nil) }
        let handle = try FileHandle(forWritingTo: url)
        handle.seekToEndOfFile()
        handle.write("\n— \(ISO8601DateFormatter().string(from: Date())) starting \(spec.name)\n".data(using: .utf8)!)
        return handle
    }

    /// Ready when the address answers 200.
    public static let httpHealthCheck: HealthCheck = { url in
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        guard let (_, response) = try? await URLSession.shared.data(for: request) else { return false }
        return (response as? HTTPURLResponse)?.statusCode == 200
    }
}

public enum SupervisorError: Error, Equatable, CustomStringConvertible {
    case couldNotStart(String, String)
    case notReady(String)

    public var description: String {
        switch self {
        case .couldNotStart(let piece, let why): return "\(piece) couldn't start: \(why)"
        case .notReady(let piece): return "\(piece) started but didn't answer within a minute"
        }
    }
}
