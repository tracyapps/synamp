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
