import Foundation

/// What to do when SynAmp at home isn't answering and a remote address is set.
public enum WhenAway: String, Codable, Sendable, CaseIterable {
    /// Offer "Connect remotely" and wait for an answer (like joining a Wi-Fi network).
    case ask
    /// Connect remotely without asking.
    case connect
    /// Don't connect; wait until home answers again.
    case offline

    public var label: String {
        switch self {
        case .ask: return "Ask me"
        case .connect: return "Connect automatically"
        case .offline: return "Stay offline"
        }
    }
}

/// A SynAmp that runs somewhere else: on a NAS, or on another computer.
/// This Mac then starts nothing itself; it shows that SynAmp in its window,
/// at the home address when that answers, or at the remote one when away.
public struct Connection: Codable, Sendable, Equatable {
    /// The address on the home network, e.g. http://Syd.local:8080.
    public var home: String
    /// The address that works away from home (Listen anywhere), if there is one.
    public var remote: String?
    public var whenAway: WhenAway
    /// The music folder as this Mac sees it (e.g. /Volumes/music/library), when
    /// this Mac does the listening for that SynAmp. A NAS is usually too slow to
    /// listen to songs itself. Nil: this Mac doesn't listen.
    public var listenFolder: String?
    /// The share that folder is on (smb://Syd.local/music), so listening can
    /// reconnect it by itself at home. Nil: a folder on this Mac or a plain drive.
    public var shareURL: String?

    public init(home: String, remote: String? = nil, whenAway: WhenAway = .ask, listenFolder: String? = nil, shareURL: String? = nil) {
        self.home = home
        self.remote = remote
        self.whenAway = whenAway
        self.listenFolder = listenFolder
        self.shareURL = shareURL
    }

    private enum CodingKeys: String, CodingKey { case home, remote, whenAway, listenFolder, shareURL }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        home = try values.decode(String.self, forKey: .home)
        remote = try values.decodeIfPresent(String.self, forKey: .remote)
        whenAway = (try? values.decodeIfPresent(WhenAway.self, forKey: .whenAway)) ?? .ask
        listenFolder = try values.decodeIfPresent(String.self, forKey: .listenFolder)
        shareURL = try values.decodeIfPresent(String.self, forKey: .shareURL)
    }

    /// Does this Mac listen to the library for that SynAmp?
    public var listensHere: Bool { !(listenFolder ?? "").isEmpty }

    public var homeURL: URL? { Connection.address(home) }
    public var remoteURL: URL? { remote.flatMap { Connection.address($0) } }

    /// What someone typed, as an address: "Syd.local:8080" becomes
    /// http://Syd.local:8080. Anything after the port is dropped. Nil when it
    /// isn't an address.
    public static func address(_ typed: String) -> URL? {
        var text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !text.contains(" ") else { return nil }
        if !text.contains("://") { text = "http://" + text }
        guard var parts = URLComponents(string: text), let scheme = parts.scheme?.lowercased(),
              scheme == "http" || scheme == "https", let host = parts.host, !host.isEmpty else { return nil }
        parts.scheme = scheme
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        parts.user = nil
        parts.password = nil
        return parts.url
    }
}

/// Where this Mac stands with a SynAmp that runs somewhere else.
public enum LinkState: Equatable, Sendable {
    /// Home answers: use it.
    case home(URL)
    /// Away, and connected through the remote address.
    case remote(URL)
    /// Away; the remote address answers; waiting for the person to say yes or not now.
    case awayAsking(URL)
    /// Away; the remote address answers, but the choice is to stay offline.
    case awayOffline(URL)
    /// Nothing answers (or there's no remote address to try).
    case unreachable(hasRemote: Bool)

    /// The address SynAmp can be used at right now, if any.
    public var url: URL? {
        switch self {
        case .home(let url), .remote(let url): return url
        default: return nil
        }
    }
}

/// The person's answer to "Connect remotely?", for this time away only.
public enum AwayChoice: Sendable, Equatable {
    case connect
    case notNow
}

public enum LinkDecider {
    /// Home always wins. Away, the answer given this time counts before the setting.
    public static func decide(_ connection: Connection, homeAnswers: Bool, remoteAnswers: Bool, choice: AwayChoice?) -> LinkState {
        if homeAnswers, let home = connection.homeURL { return .home(home) }
        guard let remote = connection.remoteURL else { return .unreachable(hasRemote: false) }
        guard remoteAnswers else { return .unreachable(hasRemote: true) }
        switch choice {
        case .connect: return .remote(remote)
        case .notNow: return .awayOffline(remote)
        case nil:
            switch connection.whenAway {
            case .connect: return .remote(remote)
            case .offline: return .awayOffline(remote)
            case .ask: return .awayAsking(remote)
            }
        }
    }
}

/// Keeps asking, silently, whether SynAmp answers at home (and, when it doesn't,
/// at the remote address), and says when that changes. It never shows anything
/// itself: the menu and the window decide what the person sees.
public final class ConnectionMonitor: @unchecked Sendable {
    /// Does a SynAmp answer at this address? Silent; a few seconds at most.
    public typealias Probe = @Sendable (URL) async -> Bool

    /// One missed answer at home (SynAmp restarting, a Wi-Fi hiccup) isn't "away".
    public static let missesBeforeAway = 2

    private let connection: @Sendable () -> Connection?
    private let probe: Probe
    private let lock = NSLock()
    private var _link: LinkState?
    private var choice: AwayChoice?
    private var homeMisses = 0
    private var task: Task<Void, Never>?
    /// The latest look, so the next one waits its turn.
    private var lastCheck: Task<LinkState?, Never>?

    /// Told when the link changes (on a background queue).
    public var onChange: (@Sendable (LinkState) -> Void)?

    public init(connection: @escaping @Sendable () -> Connection?, probe: @escaping Probe = ConnectionMonitor.http()) {
        self.connection = connection
        self.probe = probe
    }

    public var link: LinkState? { lock.withLock { _link } }

    /// Look once. Returns where things stand (nil: no usable home address).
    ///
    /// Looks take turns. The regular check, a network change and a changed
    /// setting can all ask at the same moment; without turns, one could return
    /// "nothing changed" before the other had told anyone what it found.
    @discardableResult
    public func check() async -> LinkState? {
        let turn: Task<LinkState?, Never> = lock.withLock {
            let before = lastCheck
            let turn = Task { [weak self] () -> LinkState? in
                _ = await before?.value
                return await self?.checkOnce()
            }
            lastCheck = turn
            return turn
        }
        return await turn.value
    }

    private func checkOnce() async -> LinkState? {
        guard let connection = connection(), let home = connection.homeURL else { return nil }
        let homeAnswers = await probe(home)
        let (previous, holdOn): (LinkState?, Bool) = lock.withLock {
            if homeAnswers {
                homeMisses = 0
                choice = nil  // back home: next time away, ask again
                return (_link, false)
            }
            homeMisses += 1
            if case .home = _link, homeMisses < Self.missesBeforeAway { return (_link, true) }
            return (_link, false)
        }
        if holdOn { return previous }
        var remoteAnswers = false
        if !homeAnswers, let remote = connection.remoteURL { remoteAnswers = await probe(remote) }
        let next = LinkDecider.decide(connection, homeAnswers: homeAnswers, remoteAnswers: remoteAnswers,
                                      choice: lock.withLock { choice })
        let changed: Bool = lock.withLock {
            let changed = _link != next
            _link = next
            return changed
        }
        if changed { onChange?(next) }
        return next
    }

    /// The answer to "Connect remotely?" (or the menu's buttons), for this time away.
    public func choose(_ choice: AwayChoice) async {
        lock.withLock { self.choice = choice }
        await check()
    }

    /// Keep looking. The first look is the caller's (`check()`), so this waits first.
    public func start(every seconds: TimeInterval = 20) {
        stop()
        let task = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                if Task.isCancelled { return }
                await self?.check()
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
    }

    /// The real look: SynAmp's own "are you there" address, with a short wait.
    public static func http(timeout: TimeInterval = 3) -> Probe {
        { url in
            var request = URLRequest(url: url.appendingPathComponent("health"))
            request.timeoutInterval = timeout
            request.cachePolicy = .reloadIgnoringLocalCacheData
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            return ConnectionCheck.isSynAmp(data)
        }
    }
}

/// Checking an address and access token when the person sets the connection up.
public enum ConnectionCheck {
    public enum Result: Equatable, Sendable {
        /// It's SynAmp and the token works. `remote` is the away-from-home
        /// address SynAmp already knows from Listen anywhere, if any.
        case ok(remote: String?)
        case noAnswer
        case notSynAmp
        case wrongToken
        case problem(Int)

        /// In words for the person (nil when it worked).
        public var words: String? {
            switch self {
            case .ok: return nil
            case .noAnswer:
                // The first time, macOS asks whether SynAmp may look on the local network,
                // and this check fails while that question is on screen.
                return "Nothing answered at that address. If your Mac just asked whether SynAmp may find devices on your local network, choose Allow and press Connect again. Otherwise check the address, and that this Mac is on your home network."
            case .notSynAmp: return "Something answered at that address, but it isn't SynAmp. Check the address and the number after the colon."
            case .wrongToken: return "SynAmp answered, but it didn't accept that access token. Check it and try again."
            case .problem(let code): return "SynAmp answered with a problem (\(code)). Try again in a minute."
            }
        }
    }

    /// Ask for one address: the answer's bytes and its HTTP status, or nil for no answer.
    public typealias Fetch = @Sendable (URLRequest) async -> (Data, Int)?

    public static let http: Fetch = { request in
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let status = (response as? HTTPURLResponse)?.statusCode else { return nil }
        return (data, status)
    }

    static func isSynAmp(_ data: Data) -> Bool {
        let answer = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return answer?["service"] as? String == "synamp-brain"
    }

    public static func run(address: URL, token: String, fetch: Fetch = ConnectionCheck.http) async -> Result {
        var health = URLRequest(url: address.appendingPathComponent("health"))
        health.timeoutInterval = 5
        guard let (data, status) = await fetch(health) else { return .noAnswer }
        guard status == 200, isSynAmp(data) else { return .notSynAmp }

        var setup = URLRequest(url: address.appendingPathComponent("api/v1/setup"))
        setup.timeoutInterval = 10
        setup.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        guard let (body, code) = await fetch(setup) else { return .noAnswer }
        if code == 401 || code == 403 { return .wrongToken }
        guard code == 200 else { return .problem(code) }
        let answer = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        guard let name = answer?["tailscale_name"] as? String, !name.isEmpty else { return .ok(remote: nil) }
        // Listen anywhere keeps only the name; SynAmp answers on the same port there.
        var parts = URLComponents()
        parts.scheme = "http"
        parts.host = name
        parts.port = address.port
        return .ok(remote: parts.url?.absoluteString)
    }
}

/// Checks on the folder this Mac listens to for a SynAmp that runs somewhere else.
public enum ListenFolder {
    /// The folder SynAmp and listening leave each other notes in: ".synamp",
    /// beside the music folder (what listening learned, and files that moved).
    public static func notes(beside folder: URL) -> URL {
        folder.deletingLastPathComponent().appendingPathComponent(".synamp", isDirectory: true)
    }

    /// Is this the same music folder the SynAmp on the NAS uses? It is when the
    /// notes folder is there. Otherwise listening would work on the wrong copy,
    /// and SynAmp would never see what it learned.
    public static func isShared(_ folder: URL, fileManager: FileManager = .default) -> Bool {
        var isFolder: ObjCBool = false
        return fileManager.fileExists(atPath: notes(beside: folder).path, isDirectory: &isFolder) && isFolder.boolValue
    }

    /// The share a folder is on, as an address listening can reconnect
    /// (smb://Syd.local/music). Nil for a folder on this Mac or a plain drive.
    public static func shareURL(for folder: URL) -> String? {
        guard let remount = try? folder.resourceValues(forKeys: [.volumeURLForRemountingKey]).volumeURLForRemounting else { return nil }
        return tidy(remount.absoluteString)
    }

    /// macOS may give the server by its Bonjour service name
    /// (Syd._smb._tcp.local), which nothing can connect to directly, and adds
    /// the account name. Listening needs the plain server name.
    static func tidy(_ address: String) -> String? {
        guard var parts = URLComponents(string: address), let host = parts.host, !host.isEmpty,
              ["smb", "afp", "nfs", "cifs"].contains(parts.scheme?.lowercased() ?? "") else { return nil }
        for service in ["._smb._tcp.local", "._afpovertcp._tcp.local", "._nfs._tcp.local"] where host.lowercased().hasSuffix(service) {
            parts.host = String(host.dropLast(service.count)) + ".local"
        }
        parts.password = nil
        var text = parts.string ?? address
        while text.hasSuffix("/") { text.removeLast() }
        return text
    }
}
