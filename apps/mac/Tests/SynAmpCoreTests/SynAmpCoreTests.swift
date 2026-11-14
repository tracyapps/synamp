import XCTest
@testable import SynAmpCore

final class SettingsTests: XCTestCase {
    func testFirstRunHasNoMusicFolder() throws {
        let dir = try temporaryFolder()
        let settings = AppSettings.load(from: dir.appendingPathComponent("settings.json"))
        XCTAssertFalse(settings.isSetUp)
        XCTAssertEqual(settings.port, 8380)
        XCTAssertTrue(settings.startAtLogin)
    }

    func testSavedSettingsComeBack() throws {
        let file = try temporaryFolder().appendingPathComponent("settings.json")
        try AppSettings(musicFolder: "/Volumes/music/library", port: 8390).save(to: file)
        let back = AppSettings.load(from: file)
        XCTAssertEqual(back.musicFolder, "/Volumes/music/library")
        XCTAssertEqual(back.port, 8390)
        XCTAssertTrue(back.isSetUp)
    }

    func testDamagedSettingsAreSetAsideNotDeleted() throws {
        let dir = try temporaryFolder()
        let file = dir.appendingPathComponent("settings.json")
        try Data("{not json".utf8).write(to: file)
        XCTAssertFalse(AppSettings.load(from: file).isSetUp)
        let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
        XCTAssertTrue(names.contains { $0.hasPrefix("settings.unreadable-") }, "\(names)")
    }
}

final class PortTests: XCTestCase {
    func testPicksThePreferredPortWhenFree() {
        XCTAssertEqual(Ports.pick(preferred: 8380, isFree: { _ in true }), 8380)
    }

    func testSkipsBusyAndAvoidedPorts() {
        XCTAssertEqual(Ports.pick(preferred: 8380, avoiding: [8382], isFree: { $0 != 8380 && $0 != 8381 }), 8383)
        XCTAssertNil(Ports.pick(preferred: 8380, tries: 3, isFree: { _ in false }))
    }

    func testARealBusyPortIsSeenAsBusy() throws {
        let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        defer { Darwin.close(fd) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr.s_addr = inet_addr("0.0.0.0")
        _ = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        Darwin.listen(fd, 1)
        var bound = sockaddr_in()
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &bound) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.getsockname(fd, $0, &length) } }
        let port = Int(UInt16(bigEndian: bound.sin_port))
        XCTAssertFalse(Ports.isFree(port))
    }

    func testTokensAreLongRandomAndKept() throws {
        let a = AccessToken.make(), b = AccessToken.make()
        XCTAssertEqual(a.count, 64)
        XCTAssertNotEqual(a, b)
        let store = MemoryTokenStore()
        let first = try store.tokenCreatingIfNeeded()
        XCTAssertEqual(try store.tokenCreatingIfNeeded(), first, "made once, then kept")
    }
}

final class LaunchPlanTests: XCTestCase {
    func plan(incoming: String? = nil) throws -> LaunchPlan {
        let root = try temporaryFolder()
        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        let layout = RuntimeLayout.bundled(resources: URL(fileURLWithPath: "/Applications/SynAmp.app/Contents/Resources"))
        return LaunchPlan(paths: paths, layout: layout,
                          settings: AppSettings(musicFolder: "/Volumes/music/library", incomingFolder: incoming),
                          port: 8380, navidromePort: 4533, token: "secret-token")
    }

    func testPiecesStartInOrder() throws {
        XCTAssertEqual(try plan().services().map(\.name), ["navidrome", "brain", "librarian", "listening"])
    }

    func testEveryPieceSeesTheSameMusicFolder() throws {
        let services = try plan().services()
        let byName = Dictionary(uniqueKeysWithValues: services.map { ($0.name, $0.environment) })
        XCTAssertEqual(byName["navidrome"]?["ND_MUSICFOLDER"], "/Volumes/music/library")
        XCTAssertEqual(byName["brain"]?["LIBRARY_PATH"], "/Volumes/music/library")
        XCTAssertEqual(byName["brain"]?["CORE_MUSIC_PATH"], "/Volumes/music/library", "so plays from phone apps match songs")
        XCTAssertEqual(byName["librarian"]?["LIBRARIAN_MUSIC_PATH"], "/Volumes/music/library")
        XCTAssertEqual(byName["listening"]?["LIBRARY_PATH"], "/Volumes/music/library")
    }

    func testPiecesFindEachOther() throws {
        let p = try plan()
        let byName = Dictionary(uniqueKeysWithValues: try p.services().map { ($0.name, $0) })
        XCTAssertEqual(byName["navidrome"]?.environment["ND_ADDRESS"], "127.0.0.1", "Navidrome only for this Mac")
        XCTAssertEqual(byName["brain"]?.environment["CORE_URL"], "http://127.0.0.1:4533")
        XCTAssertEqual(byName["brain"]?.environment["BRAIN_HOST"], "0.0.0.0", "phones at home can play")
        XCTAssertEqual(byName["brain"]?.environment["WEB_ROOT"], "/Applications/SynAmp.app/Contents/Resources/runtime/web")
        XCTAssertEqual(byName["librarian"]?.environment["SYNAMP_BRAIN_URL"], "http://127.0.0.1:8380")
        XCTAssertEqual(byName["listening"]?.environment["SYNAMP_BRAIN_URL"], "http://127.0.0.1:8380")
        // Listening writes where the brain reads; the librarian's journal is the one listening follows.
        XCTAssertEqual(byName["listening"]?.environment["SYNAMP_EXPORT_PATH"], byName["brain"]?.environment["LIBRARY_SIGNALS_PATH"])
        XCTAssertEqual(byName["listening"]?.environment["RENAME_JOURNAL_PATH"], byName["librarian"]?.environment["RENAME_JOURNAL_PATH"])
        for name in ["brain", "librarian", "listening"] {
            let env = byName[name]!.environment
            XCTAssertEqual(env["PLAYLIST_API_TOKEN"] ?? env["SYNAMP_BRAIN_TOKEN"], "secret-token", name)
        }
        XCTAssertNil(byName["navidrome"]?.environment["PLAYLIST_API_TOKEN"], "only the pieces that need the token get it")
        XCTAssertEqual(byName["brain"]?.health?.absoluteString, "http://127.0.0.1:8380/health")
        XCTAssertEqual(byName["librarian"]?.stopGrace, 120, "time to finish a batch of file changes")
    }

    func testIncomingIsOptional() throws {
        let without = Dictionary(uniqueKeysWithValues: try plan().services().map { ($0.name, $0.environment) })
        XCTAssertNil(without["brain"]?["INCOMING_PATH"])
        XCTAssertNil(without["librarian"]?["LIBRARIAN_INCOMING_PATH"])
        let with = Dictionary(uniqueKeysWithValues: try plan(incoming: "/Volumes/music/incoming").services().map { ($0.name, $0.environment) })
        XCTAssertEqual(with["brain"]?["INCOMING_PATH"], "/Volumes/music/incoming")
        XCTAssertEqual(with["librarian"]?["LIBRARIAN_INCOMING_PATH"], "/Volumes/music/incoming")
    }

    func testNoMusicFolderNoStart() throws {
        var p = try plan()
        p.settings.musicFolder = nil
        XCTAssertThrowsError(try p.services()) { XCTAssertEqual($0 as? LaunchError, .noMusicFolder) }
    }
}

final class SupervisorTests: XCTestCase {
    /// A pretend piece: a shell script.
    func spec(_ name: String, script: String, grace: TimeInterval = 2, health: URL? = nil) -> ServiceSpec {
        ServiceSpec(name: name, label: name, executable: URL(fileURLWithPath: "/bin/sh"), arguments: ["-c", script],
                    environment: ["PATH": "/usr/bin:/bin"], workingDirectory: URL(fileURLWithPath: NSTemporaryDirectory()),
                    stopGrace: grace, health: health)
    }

    func testStartsInOrderAndStopsNewestFirst() async throws {
        let logs = try temporaryFolder()
        let order = logs.appendingPathComponent("order.txt")
        // Each is "ready" once it has written its start line, so the order is the supervisor's.
        let specs = ["a", "b", "c"].map { name in
            spec(name, script: "echo start-\(name) >> '\(order.path)'; trap 'echo stop-\(name) >> \"\(order.path)\"; exit 0' TERM; while true; do sleep 0.1; done",
                 health: URL(string: "test://\(name)"))
        }
        let supervisor = Supervisor(specs: specs, logURL: { logs.appendingPathComponent("\($0.name).log") },
                                    healthCheck: { url in
                                        ((try? String(contentsOf: order, encoding: .utf8)) ?? "").contains("start-\(url.host ?? "")")
                                    })
        try await supervisor.start()
        XCTAssertEqual(supervisor.state(of: "c"), .running)
        try await Task.sleep(nanoseconds: 300_000_000)
        await supervisor.stop()
        let lines = try String(contentsOf: order, encoding: .utf8).split(separator: "\n").map(String.init)
        XCTAssertEqual(lines, ["start-a", "start-b", "start-c", "stop-c", "stop-b", "stop-a"])
        XCTAssertEqual(supervisor.state(of: "a"), .stopped)
    }

    func testAPieceThatIgnoresStopIsStoppedAfterItsGrace() async throws {
        let logs = try temporaryFolder()
        let stubborn = spec("stubborn", script: "trap '' TERM; while true; do sleep 0.1; done", grace: 0.5)
        let supervisor = Supervisor(specs: [stubborn], logURL: { logs.appendingPathComponent("\($0.name).log") })
        try await supervisor.start()
        let began = Date()
        await supervisor.stop()
        XCTAssertLessThan(Date().timeIntervalSince(began), 5)
        XCTAssertEqual(supervisor.state(of: "stubborn"), .stopped)
    }

    func testAPieceThatStopsOnItsOwnIsStartedAgain() async throws {
        let logs = try temporaryFolder()
        let count = logs.appendingPathComponent("count.txt")
        let flaky = spec("flaky", script: "echo x >> '\(count.path)'; sleep 0.2; exit 1")
        let supervisor = Supervisor(specs: [flaky], logURL: { logs.appendingPathComponent("\($0.name).log") },
                                    backoff: .init(first: 0.1, maximum: 0.2, giveUpAfter: 3, stableAfter: 60))
        let seen = StateRecorder()
        supervisor.onChange = { name, state in seen.add(state) }
        try await supervisor.start()
        try await Task.sleep(nanoseconds: 3_000_000_000)
        let starts = try String(contentsOf: count, encoding: .utf8).split(separator: "\n").count
        XCTAssertEqual(starts, 4, "first start plus three tries")
        XCTAssertTrue(seen.all.contains(.restarting(attempt: 1, seconds: 0.1)))
        guard case .failed(let why) = supervisor.state(of: "flaky") else { return XCTFail("should give up") }
        XCTAssertTrue(why.contains("kept stopping"), why)
        await supervisor.stop()
    }

    func testAProgramThatIsntThereSaysSo() async throws {
        let logs = try temporaryFolder()
        var missing = spec("ghost", script: "")
        missing.executable = URL(fileURLWithPath: "/nonexistent/ghost")
        let supervisor = Supervisor(specs: [missing], logURL: { logs.appendingPathComponent("\($0.name).log") })
        do {
            try await supervisor.start()
            XCTFail("should not start")
        } catch let error as SupervisorError {
            guard case .couldNotStart(let piece, _) = error else { return XCTFail("\(error)") }
            XCTAssertEqual(piece, "ghost")
        }
    }

    func testWaitsForHealthBeforeStartingTheNext() async throws {
        let logs = try temporaryFolder()
        let order = logs.appendingPathComponent("order.txt")
        let checks = Counter()
        let first = spec("first", script: "echo first >> '\(order.path)'; while true; do sleep 0.1; done",
                         health: URL(string: "http://127.0.0.1:1/health"))
        let second = spec("second", script: "echo second >> '\(order.path)'; while true; do sleep 0.1; done")
        let supervisor = Supervisor(specs: [first, second], logURL: { logs.appendingPathComponent("\($0.name).log") },
                                    healthCheck: { _ in checks.next() >= 3 })
        try await supervisor.start()
        XCTAssertGreaterThanOrEqual(checks.value, 3, "asked until it answered")
        try await Task.sleep(nanoseconds: 300_000_000)  // let the second one write its line
        await supervisor.stop()
        XCTAssertEqual(try String(contentsOf: order, encoding: .utf8), "first\nsecond\n")
    }

    func testANeverReadyPieceStopsTheStart() async throws {
        let logs = try temporaryFolder()
        let silent = spec("silent", script: "while true; do sleep 0.1; done", health: URL(string: "http://127.0.0.1:1/health"))
        let supervisor = Supervisor(specs: [silent], logURL: { logs.appendingPathComponent("\($0.name).log") },
                                    healthWait: 0.5, healthCheck: { _ in false })
        do {
            try await supervisor.start()
            XCTFail("should not count as started")
        } catch let error as SupervisorError {
            XCTAssertEqual(error, .notReady("silent"))
        }
        XCTAssertEqual(supervisor.state(of: "silent"), .stopped, "what did start was stopped again")
    }

    func testBackoffGrowsAndStops() {
        let backoff = Supervisor.Backoff(first: 1, maximum: 60)
        XCTAssertEqual((1...8).map { backoff.delay(attempt: $0) }, [1, 2, 4, 8, 16, 32, 60, 60])
    }
}

final class EngineTests: XCTestCase {
    func testNeedsSetupUntilAMusicFolderIsChosen() throws {
        let root = try temporaryFolder()
        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        let engine = Engine(paths: paths, layout: .development(repo: root), tokens: MemoryTokenStore(), isFree: { _ in true })
        XCTAssertEqual(engine.status, .needsSetup)
        try engine.update { $0.musicFolder = root.path }
        XCTAssertEqual(engine.status, .stopped)
        XCTAssertEqual(AppSettings.load(from: paths.settingsFile).musicFolder, root.path, "saved")
    }

    func testMissingPiecesAreNamedPlainly() async throws {
        let root = try temporaryFolder()
        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        let engine = Engine(paths: paths, layout: .development(repo: root.appendingPathComponent("no-repo")),
                            tokens: MemoryTokenStore(), isFree: { _ in true })
        try engine.update { $0.musicFolder = root.path }
        await engine.start()
        guard case .problem(let why) = engine.status else { return XCTFail("\(engine.status)") }
        XCTAssertTrue(why.contains("Part of SynAmp is missing"), why)
        XCTAssertTrue(why.contains("SynAmp's server code"), why)
    }

    func testTheOpenAddressHandsTheTokenOverInTheFragment() throws {
        let root = try temporaryFolder()
        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        // A layout whose programs all "exist": point every executable at /bin/sh and make the files.
        let repo = root.appendingPathComponent("repo")
        try FileManager.default.createDirectory(at: repo.appendingPathComponent("apps/brain/src"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: repo.appendingPathComponent("apps/web/dist"), withIntermediateDirectories: true)
        try Data().write(to: repo.appendingPathComponent("apps/brain/src/index.ts"))
        try Data().write(to: repo.appendingPathComponent("apps/web/dist/index.html"))
        var layout = RuntimeLayout.development(repo: repo)
        layout.node = URL(fileURLWithPath: "/bin/sh"); layout.navidrome = layout.node; layout.python = layout.node
        let engine = Engine(paths: paths, layout: layout, tokens: MemoryTokenStore("abc"), isFree: { _ in true })
        try engine.update { $0.musicFolder = root.path }
        let plan = try engine.prepare()
        XCTAssertEqual(plan.port, 8380)
        XCTAssertEqual(plan.navidromePort, 4533)
        XCTAssertEqual(engine.openURL()?.absoluteString, "http://127.0.0.1:8380/#/library?access=abc")
    }
}

/// Which addresses "answer", for tests: a pretend network.
final class FakeNetwork: @unchecked Sendable {
    private var hosts: Set<String>
    private let lock = NSLock()
    init(_ hosts: Set<String>) { self.hosts = hosts }
    func set(_ hosts: Set<String>) { lock.withLock { self.hosts = hosts } }
    var probe: ConnectionMonitor.Probe { { [self] url in lock.withLock { hosts.contains(url.host ?? "") } } }
}

final class ConnectionTests: XCTestCase {
    let home = "http://Syd.local:8080"
    let remote = "http://syd.tail1234.ts.net:8080"

    func engine(_ connection: Connection, network: FakeNetwork) throws -> Engine {
        let root = try temporaryFolder()
        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        let engine = Engine(paths: paths, layout: .development(repo: root), tokens: MemoryTokenStore(), isFree: { _ in true },
                            connectionTokens: MemoryTokenStore(), probe: network.probe, connectionCheckEvery: 3600,
                            statusFetch: { nil })
        try engine.saveConnection(connection, token: "tok")
        return engine
    }

    func testWhatPeopleTypeBecomesAnAddress() {
        XCTAssertEqual(Connection.address("Syd.local:8080")?.absoluteString, "http://Syd.local:8080")
        XCTAssertEqual(Connection.address("  http://syd.tail1234.ts.net:8080/#/library?x=1 ")?.absoluteString, "http://syd.tail1234.ts.net:8080")
        XCTAssertEqual(Connection.address("https://music.example")?.absoluteString, "https://music.example")
        XCTAssertNil(Connection.address(""))
        XCTAssertNil(Connection.address("my nas"))
        XCTAssertNil(Connection.address("smb://Syd.local/music"), "a file share isn't SynAmp's address")
    }

    func testOlderSettingsStillLoadAndAConnectionComesBack() throws {
        let file = try temporaryFolder().appendingPathComponent("settings.json")
        try Data(#"{"musicFolder":"/Music","port":8380,"startAtLogin":true,"preventSleep":true}"#.utf8).write(to: file)
        XCTAssertNil(AppSettings.load(from: file).connection)
        try AppSettings(connection: Connection(home: home, remote: remote, whenAway: .connect)).save(to: file)
        let back = AppSettings.load(from: file)
        XCTAssertEqual(back.connection, Connection(home: home, remote: remote, whenAway: .connect))
        XCTAssertTrue(back.isSetUp, "a SynAmp to connect to counts as set up, with no music folder on this Mac")
    }

    func testAtHomeItUsesTheHomeAddressAndStartsNothing() async throws {
        let engine = try engine(Connection(home: home, remote: remote), network: FakeNetwork(["Syd.local", "syd.tail1234.ts.net"]))
        XCTAssertEqual(engine.status, .stopped)
        await engine.start()
        XCTAssertEqual(engine.status, .running(URL(string: home)!))
        XCTAssertEqual(engine.link, .home(URL(string: home)!))
        XCTAssertEqual(engine.openURL()?.absoluteString, "http://Syd.local:8080/#/library?access=tok")
        XCTAssertNil(engine.plan, "none of SynAmp's own pieces are started on this Mac")
        await engine.stop()
        XCTAssertEqual(engine.status, .stopped)
    }

    func testAwayItAsksFirstThenConnectsRemotelyAndComesHomeByItself() async throws {
        let network = FakeNetwork(["syd.tail1234.ts.net"])
        let engine = try engine(Connection(home: home, remote: remote), network: network)
        await engine.start()
        XCTAssertEqual(engine.status, .away(.awayAsking(URL(string: remote)!)), "nothing connects until the person says so")
        XCTAssertNil(engine.openURL())
        await engine.chooseAway(.connect)
        XCTAssertEqual(engine.status, .running(URL(string: remote)!))
        XCTAssertEqual(engine.openURL()?.absoluteString, "http://syd.tail1234.ts.net:8080/#/library?access=tok")

        network.set(["Syd.local", "syd.tail1234.ts.net"])
        await engine.checkConnectionNow()
        XCTAssertEqual(engine.status, .running(URL(string: home)!), "home wins as soon as it answers")

        // Away again: the earlier yes was for that time only.
        network.set(["syd.tail1234.ts.net"])
        await engine.checkConnectionNow()
        XCTAssertEqual(engine.status, .running(URL(string: home)!), "one missed answer at home isn't being away")
        await engine.checkConnectionNow()
        XCTAssertEqual(engine.status, .away(.awayAsking(URL(string: remote)!)))
        await engine.chooseAway(.notNow)
        XCTAssertEqual(engine.status, .away(.awayOffline(URL(string: remote)!)))
        await engine.stop()
    }

    func testTheSettingDecidesWithoutAsking() async throws {
        let auto = try engine(Connection(home: home, remote: remote, whenAway: .connect), network: FakeNetwork(["syd.tail1234.ts.net"]))
        await auto.start()
        XCTAssertEqual(auto.status, .running(URL(string: remote)!))
        await auto.stop()

        let offline = try engine(Connection(home: home, remote: remote, whenAway: .offline), network: FakeNetwork(["syd.tail1234.ts.net"]))
        await offline.start()
        XCTAssertEqual(offline.status, .away(.awayOffline(URL(string: remote)!)))
        // The menu's "Connect remotely" still works this once.
        await offline.chooseAway(.connect)
        XCTAssertEqual(offline.status, .running(URL(string: remote)!))
        await offline.stop()
    }

    func testChangingTheSettingWhileAwayCountsStraightAway() async throws {
        let engine = try engine(Connection(home: home, remote: remote), network: FakeNetwork(["syd.tail1234.ts.net"]))
        await engine.start()
        XCTAssertEqual(engine.status, .away(.awayAsking(URL(string: remote)!)))
        try engine.update { $0.connection?.whenAway = .connect }
        await engine.checkConnectionNow()
        XCTAssertEqual(engine.status, .running(URL(string: remote)!))
        await engine.stop()
    }

    func testNothingAnswering() async throws {
        let noRemote = try engine(Connection(home: home), network: FakeNetwork([]))
        await noRemote.start()
        XCTAssertEqual(noRemote.status, .away(.unreachable(hasRemote: false)))
        await noRemote.stop()
        let both = try engine(Connection(home: home, remote: remote), network: FakeNetwork([]))
        await both.start()
        XCTAssertEqual(both.status, .away(.unreachable(hasRemote: true)))
        await both.stop()
    }

    func testThisMacListensForTheNas() async throws {
        let root = try temporaryFolder()
        let share = root.appendingPathComponent("music", isDirectory: true)
        let library = share.appendingPathComponent("library", isDirectory: true)
        try FileManager.default.createDirectory(at: library, withIntermediateDirectories: true)
        XCTAssertFalse(ListenFolder.isShared(library), "no notes folder beside it: not the folder SynAmp uses")
        try FileManager.default.createDirectory(at: share.appendingPathComponent(".synamp"), withIntermediateDirectories: true)
        XCTAssertTrue(ListenFolder.isShared(library))

        XCTAssertEqual(ListenFolder.tidy("smb://tapps@Syd._smb._tcp.local/music/"), "smb://tapps@Syd.local/music")
        XCTAssertEqual(ListenFolder.tidy("smb://tapps:secret@Syd.local/music"), "smb://tapps@Syd.local/music", "a password never goes into settings")
        XCTAssertNil(ListenFolder.tidy("file:///Volumes/Music"), "a plain drive isn't a share to reconnect")

        let connection = Connection(home: home, remote: remote, listenFolder: library.path, shareURL: "smb://Syd.local/music")
        let file = root.appendingPathComponent("settings.json")
        try AppSettings(connection: connection).save(to: file)
        XCTAssertEqual(AppSettings.load(from: file).connection, connection)
        XCTAssertFalse(Connection(home: home).listensHere)

        let paths = AppPaths(support: root.appendingPathComponent("support"), logs: root.appendingPathComponent("logs"))
        let spec = try XCTUnwrap(ServiceSpec.listeningForConnection(connection, token: "tok", paths: paths, layout: .development(repo: root)))
        XCTAssertEqual(spec.environment["LIBRARY_PATH"], library.path)
        XCTAssertEqual(spec.environment["SYNAMP_BRAIN_URL"], home, "it asks SynAmp at home; away it waits")
        XCTAssertEqual(spec.environment["SYNAMP_BRAIN_TOKEN"], "tok")
        XCTAssertEqual(spec.environment["SYNAMP_MUSIC_SHARE_URL"], "smb://Syd.local/music")
        XCTAssertEqual(spec.environment["SYNAMP_EXPORT_PATH"], share.appendingPathComponent(".synamp/library-signals.json").path,
                       "what it learns goes beside the music, where the SynAmp on the NAS reads it")
        XCTAssertEqual(spec.environment["RENAME_JOURNAL_PATH"], share.appendingPathComponent(".synamp/renames.jsonl").path)
        XCTAssertEqual(spec.environment["ANALYZER_DB_PATH"], paths.listening.appendingPathComponent("analyzer.sqlite3").path,
                       "its own working data stays on this Mac, never on the share")
        XCTAssertNil(ServiceSpec.listeningForConnection(Connection(home: home), token: "tok", paths: paths, layout: .development(repo: root)))

        // Listening that can't start (it's missing from this copy) never stops the connection.
        let engine = try engine(connection, network: FakeNetwork(["Syd.local"]))
        let pieces = PieceBox()
        engine.onPiece = { name, state in pieces.set(name, state) }
        await engine.start()
        XCTAssertEqual(engine.status, .running(URL(string: home)!))
        guard case .failed = pieces.state("listening") else { return XCTFail("the menu is told listening isn't running") }
        await engine.stop()
        XCTAssertEqual(engine.status, .stopped)
    }

    func testLinksForAPhone() async throws {
        // SynAmp on this Mac: this Mac's name on the network, and SynAmp's port.
        let own = PhoneLinks.forThisMac(port: 8380, token: "tok", hostName: "tapps-MacBook.local")
        XCTAssertEqual(own.map(\.url.absoluteString), ["http://tapps-MacBook.local:8380/#/library?access=tok"])
        XCTAssertEqual(own.first?.address, "http://tapps-MacBook.local:8380", "what's shown and read aloud has no token in it")
        XCTAssertTrue(PhoneLinks.forThisMac(port: 8380, token: "tok", hostName: "localhost").isEmpty, "a phone can't use localhost")
        XCTAssertTrue(PhoneLinks.forThisMac(port: 8380, token: "", hostName: "tapps-MacBook.local").isEmpty)

        // SynAmp on a NAS: the same two addresses this Mac uses.
        let both = PhoneLinks.forConnection(Connection(home: home, remote: remote), token: "tok")
        XCTAssertEqual(both.map(\.place), [.home, .away])
        XCTAssertEqual(both.map(\.url.absoluteString), ["http://Syd.local:8080/#/library?access=tok", "http://syd.tail1234.ts.net:8080/#/library?access=tok"])
        XCTAssertEqual(PhoneLinks.forConnection(Connection(home: home), token: "tok").count, 1)

        let engine = try engine(Connection(home: home, remote: remote), network: FakeNetwork(["Syd.local"]))
        XCTAssertEqual(engine.phoneLinks().map(\.address), [home, remote])
    }

    func testCheckingAnAddressAndToken() async {
        let address = URL(string: home)!
        func fetch(health: (String, Int)?, setup: (String, Int)?) -> ConnectionCheck.Fetch {
            { request in
                let answer = request.url?.path == "/health" ? health : setup
                if request.url?.path == "/api/v1/setup" {
                    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
                }
                return answer.map { (Data($0.0.utf8), $0.1) }
            }
        }
        let brain = (#"{"status":"ok","service":"synamp-brain"}"#, 200)
        var result = await ConnectionCheck.run(address: address, token: "tok", fetch: fetch(health: nil, setup: nil))
        XCTAssertEqual(result, .noAnswer)
        result = await ConnectionCheck.run(address: address, token: "tok", fetch: fetch(health: ("<html>router</html>", 200), setup: nil))
        XCTAssertEqual(result, .notSynAmp)
        result = await ConnectionCheck.run(address: address, token: "tok", fetch: fetch(health: brain, setup: (#"{"error":"unauthorized"}"#, 401)))
        XCTAssertEqual(result, .wrongToken)
        result = await ConnectionCheck.run(address: address, token: "tok", fetch: fetch(health: brain, setup: (#"{"done":{}}"#, 200)))
        XCTAssertEqual(result, .ok(remote: nil))
        result = await ConnectionCheck.run(address: address, token: "tok",
                                           fetch: fetch(health: brain, setup: (#"{"done":{},"tailscale_name":"syd.tail1234.ts.net"}"#, 200)))
        XCTAssertEqual(result, .ok(remote: "http://syd.tail1234.ts.net:8080"), "Listen anywhere's name, on the same port")
        XCTAssertNil(result.words)
        XCTAssertNotNil(ConnectionCheck.Result.wrongToken.words)
    }
}

final class SystemStatusTests: XCTestCase {
    func testReadsTheServersAnswer() throws {
        let json = #"{"player":{"state":"playing","title":"Monkey Wrench","artist":"Foo Fighters"},"phone":false,"listening":{"active":true,"done":120,"total":460,"eta_seconds":10800},"music":{"ok":true,"away":false},"anywhere":{"ready":true,"name":"syd.tail1234.ts.net"}}"#
        let status = try JSONDecoder().decode(SystemStatus.self, from: Data(json.utf8))
        XCTAssertEqual(StatusWords.lines(status), [
            "Playing: Monkey Wrench, by Foo Fighters",
            "Music: connected",
            "Listening to your library: 120 of 460 songs, about 3 h left",
            "Listen anywhere: on (syd.tail1234.ts.net)",
        ])
        let quiet = try JSONDecoder().decode(SystemStatus.self, from: Data(#"{"player":null,"phone":false,"listening":null,"music":null,"anywhere":{"ready":false}}"#.utf8))
        XCTAssertEqual(StatusWords.lines(quiet), ["Listen anywhere: not set up"], "nothing is guessed")
    }

    func testEveryStateHasItsOwnWords() {
        XCTAssertEqual(StatusWords.player(.init(state: "paused", title: "Untitled")), "Paused: Untitled")
        XCTAssertEqual(StatusWords.music(.init(ok: false, away: true)), "Music: out of reach from this network, waiting")
        XCTAssertEqual(StatusWords.music(.init(ok: false)), "Music: not connected")
        XCTAssertEqual(StatusWords.listening(.init(active: false, done: 120, total: 460)), "Listened to 120 of 460 songs so far. Not listening right now")
        XCTAssertEqual(StatusWords.listening(.init(active: true, done: 120, total: 460)), "Listening to your library: 120 of 460 songs")
        XCTAssertEqual(StatusWords.listening(.init(active: false, done: 460, total: 460)), "Your whole library is listened to: 460 songs")
        XCTAssertNil(StatusWords.listening(.init(active: false, done: 0, total: 0)), "no songs found yet: nothing to say")
        XCTAssertEqual(StatusWords.lines(SystemStatus(phone: true)).first, "Playing to a phone app")
        XCTAssertEqual(StatusWords.timeLeft(60), "about a minute")
        XCTAssertEqual(StatusWords.timeLeft(45 * 60), "about 45 min")
        XCTAssertEqual(StatusWords.timeLeft(3 * 3600 + 20 * 60), "about 3 h 20 min")
        XCTAssertEqual(StatusWords.timeLeft(15 * 86_400), "about 15 days")
    }

    func testNoAnswerClearsWhatWasShown() async {
        let answers = AnswerBox(SystemStatus(phone: true))
        let watcher = StatusWatcher(fetch: { answers.next })
        let seen = AnswerBox(nil)
        let changes = Counter()
        watcher.onChange = { status in seen.set(status); _ = changes.next() }
        await watcher.check()
        XCTAssertEqual(watcher.latest, SystemStatus(phone: true))
        await watcher.check()
        XCTAssertEqual(changes.value, 1, "the same answer again isn't a change")
        answers.set(nil)  // SynAmp stopped, or this Mac left home
        await watcher.check()
        XCTAssertNil(watcher.latest)
        XCTAssertNil(seen.next)
        XCTAssertEqual(changes.value, 2)
    }
}

final class PieceBox: @unchecked Sendable {
    private var states: [String: Supervisor.State] = [:]
    private let lock = NSLock()
    func set(_ name: String, _ state: Supervisor.State) { lock.withLock { states[name] = state } }
    func state(_ name: String) -> Supervisor.State? { lock.withLock { states[name] } }
}

final class AnswerBox: @unchecked Sendable {
    private var value: SystemStatus?
    private let lock = NSLock()
    init(_ value: SystemStatus?) { self.value = value }
    var next: SystemStatus? { lock.withLock { value } }
    func set(_ value: SystemStatus?) { lock.withLock { self.value = value } }
}

final class FileTokenTests: XCTestCase {
    func testKeptInAPrivateFile() throws {
        let file = try temporaryFolder().appendingPathComponent("support/dev-token")
        let store = FileTokenStore(file: file)
        XCTAssertNil(store.read())
        let token = try store.tokenCreatingIfNeeded()
        XCTAssertEqual(store.read(), token)
        let mode = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? NSNumber
        XCTAssertEqual(mode?.intValue, 0o600)
    }
}

final class LeftoverTests: XCTestCase {
    func testStopsOnlyTheSameProgramStillRunning() throws {
        let file = try temporaryFolder().appendingPathComponent("running.json")
        var alive: [Int32: String] = [101: "/app/node", 102: "/usr/bin/other", 103: "/app/navidrome"]
        var signals: [(Int32, Int32)] = []
        let store = LeftoverProcesses(file: file, pathOf: { alive[$0] }, signal: { pid, sig in
            signals.append((pid, sig))
            if sig == SIGTERM && pid != 103 { alive[pid] = nil }  // navidrome ignores the polite request
        })
        store.record(["brain": .init(pid: 101, path: "/app/node"),
                      "listening": .init(pid: 102, path: "/app/python"),  // that ID is now another program
                      "navidrome": .init(pid: 103, path: "/app/navidrome"),
                      "librarian": .init(pid: 104, path: "/app/node")])  // already gone
        XCTAssertEqual(store.stopLeftovers(wait: 0.3), ["brain", "navidrome"])
        XCTAssertFalse(signals.contains { $0.0 == 102 }, "never touches a program that isn't SynAmp's")
        XCTAssertTrue(signals.contains { $0 == (103, SIGKILL) }, "insists after the wait")
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        XCTAssertEqual(store.stopLeftovers(), [], "nothing recorded: nothing to do")
    }

    func testARealLeftoverIsStopped() throws {
        let file = try temporaryFolder().appendingPathComponent("running.json")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sleep")
        process.arguments = ["30"]
        try process.run()
        let store = LeftoverProcesses(file: file)
        store.record(["sleepy": .init(pid: process.processIdentifier, path: LeftoverProcesses.programPath(process.processIdentifier) ?? "")])
        XCTAssertEqual(store.stopLeftovers(), ["sleepy"])
        process.waitUntilExit()
        XCTAssertFalse(process.isRunning)
    }
}

final class KeepAwakeTests: XCTestCase {
    final class FakeAssertion: @unchecked Sendable {
        var calls: [(Bool, String)] = []
        var refuse = false
        func callAsFunction(_ on: Bool, _ reason: String) -> Bool { calls.append((on, reason)); return !refuse || !on }
    }

    func testHoldsOnlyWhileBusyAndAllowed() {
        let fake = FakeAssertion()
        let awake = KeepAwake(assertion: { fake($0, $1) })
        awake.update(busy: true, allowed: true, reasons: ["playing music"])
        XCTAssertTrue(awake.isHolding)
        XCTAssertEqual(fake.calls.last?.1, "SynAmp is playing music")
        awake.update(busy: true, allowed: true)
        XCTAssertEqual(fake.calls.count, 1, "no repeat requests")
        awake.update(busy: false, allowed: true)
        XCTAssertFalse(awake.isHolding)
        awake.update(busy: true, allowed: false)
        XCTAssertFalse(awake.isHolding, "the setting is off")
        XCTAssertEqual(fake.calls.map(\.0), [true, false])
    }

    func testARefusedRequestIsntCountedAsHeld() {
        let fake = FakeAssertion()
        fake.refuse = true
        let awake = KeepAwake(assertion: { fake($0, $1) })
        awake.update(busy: true, allowed: true)
        XCTAssertFalse(awake.isHolding)
    }

    func testTheWatcherFollowsTheServer() async {
        let fake = FakeAssertion()
        let awake = KeepAwake(assertion: { fake($0, $1) })
        let answers = AnswerQueue([.init(busy: true, reasons: ["listening"]), nil, .init(busy: false, reasons: [])])
        let watcher = ActivityWatcher(fetch: { answers.next() }, keepAwake: awake, allowed: { true })
        await watcher.check()
        XCTAssertTrue(awake.isHolding)
        XCTAssertEqual(fake.calls.last?.1, "SynAmp is listening to your library")
        await watcher.check()
        XCTAssertTrue(awake.isHolding, "no answer (restarting): change nothing")
        await watcher.check()
        XCTAssertFalse(awake.isHolding)
        await watcher.check()
        watcher.stop()
        XCTAssertFalse(awake.isHolding)
    }
}

final class AnswerQueue: @unchecked Sendable {
    private var items: [ActivityWatcher.Activity?]
    private let lock = NSLock()
    init(_ items: [ActivityWatcher.Activity?]) { self.items = items }
    func next() -> ActivityWatcher.Activity? { lock.withLock { items.isEmpty ? nil : items.removeFirst() } }
}

final class DownloadNameTests: XCTestCase {
    func testNeverOverwrites() {
        let folder = URL(fileURLWithPath: "/Users/x/Downloads")
        let taken: Set<String> = ["/Users/x/Downloads/report.txt", "/Users/x/Downloads/report 2.txt"]
        XCTAssertEqual(DownloadNames.free(for: "report.txt", in: folder, exists: { taken.contains($0) }).lastPathComponent, "report 3.txt")
        XCTAssertEqual(DownloadNames.free(for: "new.csv", in: folder, exists: { taken.contains($0) }).lastPathComponent, "new.csv")
    }

    func testOnlyAFileName() {
        let folder = URL(fileURLWithPath: "/Users/x/Downloads")
        let none: (String) -> Bool = { _ in false }
        XCTAssertEqual(DownloadNames.free(for: "../../etc/passwd", in: folder, exists: none).deletingLastPathComponent().path, "/Users/x/Downloads")
        XCTAssertEqual(DownloadNames.free(for: ".hidden", in: folder, exists: none).lastPathComponent, "hidden")
        XCTAssertEqual(DownloadNames.free(for: "  ", in: folder, exists: none).lastPathComponent, "SynAmp download")
    }
}

// MARK: - helpers

func temporaryFolder() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("synamp-tests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

final class StateRecorder: @unchecked Sendable {
    private var states: [Supervisor.State] = []
    private let lock = NSLock()
    func add(_ state: Supervisor.State) { lock.withLock { states.append(state) } }
    var all: [Supervisor.State] { lock.withLock { states } }
}

final class Counter: @unchecked Sendable {
    private var count = 0
    private let lock = NSLock()
    func next() -> Int { lock.withLock { count += 1; return count } }
    var value: Int { lock.withLock { count } }
}
