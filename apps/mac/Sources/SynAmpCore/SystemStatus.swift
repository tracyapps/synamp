import Foundation

/// What SynAmp is doing right now: the answer of GET /api/v1/system/status
/// (apps/brain/src/system/status.ts). The menu shows it in words.
public struct SystemStatus: Decodable, Equatable, Sendable {
    public struct Player: Decodable, Equatable, Sendable {
        /// "playing" or "paused".
        public var state: String
        public var title: String
        public var artist: String?
        public init(state: String, title: String, artist: String? = nil) {
            self.state = state
            self.title = title
            self.artist = artist
        }
    }

    public struct Listening: Decodable, Equatable, Sendable {
        public var active: Bool
        public var done: Int
        public var total: Int
        public var eta_seconds: Double?
        public init(active: Bool, done: Int, total: Int, eta_seconds: Double? = nil) {
            self.active = active
            self.done = done
            self.total = total
            self.eta_seconds = eta_seconds
        }
    }

    public struct Music: Decodable, Equatable, Sendable {
        public var ok: Bool
        public var away: Bool
        public var problem: String?
        public init(ok: Bool, away: Bool = false, problem: String? = nil) {
            self.ok = ok
            self.away = away
            self.problem = problem
        }
    }

    public struct Anywhere: Decodable, Equatable, Sendable {
        public var ready: Bool
        public var name: String?
        public init(ready: Bool, name: String? = nil) {
            self.ready = ready
            self.name = name
        }
    }

    public var player: Player?
    public var phone: Bool
    public var listening: Listening?
    public var music: Music?
    public var anywhere: Anywhere

    public init(player: Player? = nil, phone: Bool = false, listening: Listening? = nil, music: Music? = nil,
                anywhere: Anywhere = Anywhere(ready: false)) {
        self.player = player
        self.phone = phone
        self.listening = listening
        self.music = music
        self.anywhere = anywhere
    }
}

/// The status as lines for the menu. Words carry everything, so it reads the
/// same to VoiceOver and never depends on an icon or a colour.
public enum StatusWords {
    public static func number(_ value: Int) -> String {
        value.formatted(.number.grouping(.automatic))
    }

    public static func timeLeft(_ seconds: Double) -> String {
        if seconds < 90 { return "about a minute" }
        let minutes = Int((seconds / 60).rounded())
        if minutes < 60 { return "about \(minutes) min" }
        let hours = minutes / 60, rest = minutes % 60
        if hours < 48 { return rest == 0 ? "about \(hours) h" : "about \(hours) h \(rest) min" }
        return "about \(Int((Double(hours) / 24).rounded())) days"
    }

    public static func player(_ player: SystemStatus.Player) -> String {
        let song = player.artist.map { "\(player.title), by \($0)" } ?? player.title
        return "\(player.state == "paused" ? "Paused" : "Playing"): \(song)"
    }

    /// The song for the menu bar itself, beside the icon (only when the person
    /// asked for it). Just the title, cut short: the menu bar has little room,
    /// and the menu's first lines have the artist. Nil: nothing playing or paused.
    public static func menuBarSong(_ status: SystemStatus?, limit: Int = 28) -> String? {
        guard let title = status?.player?.title.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }
        guard title.count > limit, limit > 1 else { return title }
        return title.prefix(limit - 1).trimmingCharacters(in: .whitespaces) + "…"
    }

    public static func listening(_ listening: SystemStatus.Listening) -> String? {
        guard listening.total > 0 else { return nil }
        if listening.done >= listening.total {
            return "Your whole library is listened to: \(number(listening.total)) songs"
        }
        let progress = "\(number(listening.done)) of \(number(listening.total)) songs"
        if listening.active {
            let left = listening.eta_seconds.map { ", \(timeLeft($0)) left" } ?? ""
            return "Listening to your library: \(progress)\(left)"
        }
        return "Listened to \(progress) so far. Not listening right now"
    }

    public static func music(_ music: SystemStatus.Music) -> String {
        if music.ok { return "Music: connected" }
        return music.away ? "Music: out of reach from this network, waiting" : "Music: not connected"
    }

    public static func anywhere(_ anywhere: SystemStatus.Anywhere) -> String {
        guard anywhere.ready else { return "Listen anywhere: not set up" }
        return anywhere.name.map { "Listen anywhere: on (\($0))" } ?? "Listen anywhere: on"
    }

    /// Every line there is something to say, in a fixed order.
    public static func lines(_ status: SystemStatus) -> [String] {
        var lines: [String] = []
        if let now = status.player { lines.append(Self.player(now)) }
        if status.phone { lines.append("Playing to a phone app") }
        if let reach = status.music { lines.append(Self.music(reach)) }
        if let progress = status.listening, let words = Self.listening(progress) { lines.append(words) }
        lines.append(Self.anywhere(status.anywhere))
        return lines
    }
}

/// Asks SynAmp what it's doing every few seconds, for the menu. No answer
/// (stopped, away from home) clears what was shown, so the menu never keeps
/// saying "Playing" about a SynAmp it can't reach.
public final class StatusWatcher: @unchecked Sendable {
    public typealias Fetch = @Sendable () async -> SystemStatus?

    private let fetch: Fetch
    private let lock = NSLock()
    private var _latest: SystemStatus?
    private var task: Task<Void, Never>?
    public var onChange: (@Sendable (SystemStatus?) -> Void)?

    public init(fetch: @escaping Fetch) {
        self.fetch = fetch
    }

    public var latest: SystemStatus? { lock.withLock { _latest } }

    public func check() async {
        let next = await fetch()
        let changed: Bool = lock.withLock {
            let changed = _latest != next
            _latest = next
            return changed
        }
        if changed { onChange?(next) }
    }

    public func start(every seconds: TimeInterval = 10) {
        stop()
        let task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.check()
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            }
        }
        lock.withLock { self.task = task }
    }

    public func stop() {
        let task = lock.withLock { () -> Task<Void, Never>? in
            let task = self.task
            self.task = nil
            return task
        }
        task?.cancel()
        let had: Bool = lock.withLock {
            let had = _latest != nil
            _latest = nil
            return had
        }
        if had { onChange?(nil) }
    }

    /// The real fetch. `target` says where SynAmp is right now and with which
    /// token (nil: nowhere reachable), so it follows home, remote and restarts.
    public static func http(target: @escaping @Sendable () -> (URL, String)?) -> Fetch {
        {
            guard let (base, token) = target() else { return nil }
            var request = URLRequest(url: base.appendingPathComponent("api/v1/system/status"))
            request.timeoutInterval = 5
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return try? JSONDecoder().decode(SystemStatus.self, from: data)
        }
    }
}
