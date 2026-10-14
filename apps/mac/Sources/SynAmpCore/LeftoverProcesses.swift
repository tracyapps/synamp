import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// SynAmp's programs left running after the app itself was stopped abruptly
/// (force quit, a crash, `kill`). They'd hold the port and keep writing to
/// SynAmp's files, so the next start stops them first.
///
/// The app writes down each program's process ID and path while it runs.
/// On the next start, a recorded process is stopped only if it's still alive
/// AND still the same program (macOS reuses process IDs).
public struct LeftoverProcesses {
    public struct Entry: Codable, Equatable, Sendable {
        public var pid: Int32
        public var path: String
        public init(pid: Int32, path: String) {
            self.pid = pid
            self.path = path
        }
    }

    public let file: URL
    /// The program a process ID belongs to now (nil: no such process).
    private let pathOf: (Int32) -> String?
    private let signal: (Int32, Int32) -> Void

    public init(file: URL, pathOf: @escaping (Int32) -> String? = LeftoverProcesses.programPath,
                signal: @escaping (Int32, Int32) -> Void = { pid, sig in _ = kill(pid, sig) }) {
        self.file = file
        self.pathOf = pathOf
        self.signal = signal
    }

    public func record(_ entries: [String: Entry]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(entries) else { return }
        try? data.write(to: file, options: [.atomic])
    }

    public func clear() {
        try? FileManager.default.removeItem(at: file)
    }

    /// Stop what's left from last time. Returns the names stopped.
    @discardableResult
    public func stopLeftovers(wait: TimeInterval = 5) -> [String] {
        guard let data = try? Data(contentsOf: file),
              let entries = try? JSONDecoder().decode([String: Entry].self, from: data) else { return [] }
        let alive = entries.filter { _, entry in
            entry.pid > 1 && !entry.path.isEmpty && pathOf(entry.pid) == entry.path
        }
        for entry in alive.values { signal(entry.pid, SIGTERM) }
        let deadline = Date().addingTimeInterval(wait)
        while Date() < deadline, alive.values.contains(where: { pathOf($0.pid) == $0.path }) {
            Thread.sleep(forTimeInterval: 0.1)
        }
        for entry in alive.values where pathOf(entry.pid) == entry.path { signal(entry.pid, SIGKILL) }
        clear()
        return alive.keys.sorted()
    }

    /// The program file a process is running (macOS: proc_pidpath).
    public static func programPath(_ pid: Int32) -> String? {
        #if canImport(Darwin)
        var buffer = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
        guard length > 0 else { return nil }
        return String(cString: buffer)
        #else
        return nil
        #endif
    }
}
