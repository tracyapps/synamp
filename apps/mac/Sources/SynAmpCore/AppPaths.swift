import Foundation

/// Where SynAmp keeps its own things on this Mac. Never the music: that's
/// wherever the person chose, in `AppSettings.musicFolder`.
public struct AppPaths: Sendable, Equatable {
    /// `~/Library/Application Support/SynAmp`
    public let support: URL
    /// `~/Library/Logs/SynAmp`
    public let logs: URL

    public init(support: URL, logs: URL) {
        self.support = support
        self.logs = logs
    }

    /// The real places, under the person's home folder.
    public static func standard(home: URL = FileManager.default.homeDirectoryForCurrentUser) -> AppPaths {
        AppPaths(
            support: home.appendingPathComponent("Library/Application Support/SynAmp", isDirectory: true),
            logs: home.appendingPathComponent("Library/Logs/SynAmp", isDirectory: true)
        )
    }

    public var settingsFile: URL { support.appendingPathComponent("settings.json") }
    /// Which programs SynAmp has running (to stop leftovers after a crash).
    public var runningFile: URL { support.appendingPathComponent("running.json") }
    public var brain: URL { support.appendingPathComponent("brain", isDirectory: true) }
    public var librarian: URL { support.appendingPathComponent("librarian", isDirectory: true) }
    public var navidrome: URL { support.appendingPathComponent("navidrome", isDirectory: true) }
    public var listening: URL { support.appendingPathComponent("listening", isDirectory: true) }
    public var models: URL { support.appendingPathComponent("models", isDirectory: true) }
    /// Every rename the librarian makes, so listening follows moved files.
    public var renameJournal: URL { support.appendingPathComponent("renames.jsonl") }
    /// Old song details, kept so Undo can put them back.
    public var tagBackups: URL { support.appendingPathComponent("tag-backups", isDirectory: true) }
    /// What listening has learned about each song, read by the brain.
    public var librarySignals: URL { listening.appendingPathComponent("library-signals.json") }

    public func log(for piece: String) -> URL { logs.appendingPathComponent("\(piece).log") }

    /// Make every folder SynAmp writes to (readable only by this user).
    public func create(fileManager: FileManager = .default) throws {
        for folder in [support, logs, brain, librarian, navidrome, listening, models, tagBackups] {
            try fileManager.createDirectory(at: folder, withIntermediateDirectories: true,
                                            attributes: [.posixPermissions: 0o700])
        }
    }
}
