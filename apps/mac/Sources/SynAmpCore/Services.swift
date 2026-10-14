import Foundation

/// One of SynAmp's programs, and exactly how to start it.
public struct ServiceSpec: Sendable, Equatable {
    /// Short name: navidrome, brain, librarian, listening (also the log file's name).
    public var name: String
    /// What the menu calls it.
    public var label: String
    public var executable: URL
    public var arguments: [String]
    public var environment: [String: String]
    public var workingDirectory: URL
    /// How long Quit waits for it to finish on its own before stopping it.
    public var stopGrace: TimeInterval
    /// An address that answers 200 when it's ready (nil: ready once started).
    public var health: URL?

    public init(name: String, label: String, executable: URL, arguments: [String], environment: [String: String],
                workingDirectory: URL, stopGrace: TimeInterval, health: URL?) {
        self.name = name
        self.label = label
        self.executable = executable
        self.arguments = arguments
        self.environment = environment
        self.workingDirectory = workingDirectory
        self.stopGrace = stopGrace
        self.health = health
    }
}

/// Everything needed to start the pieces once the ports and token are known.
public struct LaunchPlan: Sendable {
    public var paths: AppPaths
    public var layout: RuntimeLayout
    public var settings: AppSettings
    /// The port everything is reached on (brain + web app + phone apps).
    public var port: Int
    /// Navidrome's own port, on this Mac only.
    public var navidromePort: Int
    public var token: String

    public init(paths: AppPaths, layout: RuntimeLayout, settings: AppSettings, port: Int, navidromePort: Int, token: String) {
        self.paths = paths
        self.layout = layout
        self.settings = settings
        self.port = port
        self.navidromePort = navidromePort
        self.token = token
    }

    public var localURL: URL { URL(string: "http://127.0.0.1:\(port)")! }

    /// The pieces, in the order they start (and the reverse of how they stop).
    /// Each gets only what it needs; the music folder is the same path for all,
    /// so paths match between Navidrome, the brain and listening.
    public func services() throws -> [ServiceSpec] {
        guard let music = settings.musicFolder, !music.isEmpty else { throw LaunchError.noMusicFolder }
        let brainURL = localURL.absoluteString
        // A small, predictable PATH: the bundled ffmpeg first, then the system's basics.
        var path = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]
        if let ffmpeg = layout.ffmpegFolder { path.insert(ffmpeg.path, at: 0) }
        let base: [String: String] = [
            "PATH": path.joined(separator: ":"),
            "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
            "LANG": "en_US.UTF-8",
        ]
        let ffmpeg = layout.ffmpegFolder.map { ["FFMPEG_PATH": $0.appendingPathComponent("ffmpeg").path,
                                                 "FFPROBE_PATH": $0.appendingPathComponent("ffprobe").path] } ?? [:]
        let incoming = settings.incomingFolder.flatMap { $0.isEmpty ? nil : $0 }

        let navidrome = ServiceSpec(
            name: "navidrome", label: "Navidrome",
            executable: layout.navidrome, arguments: [],
            environment: base.merging([
                "ND_MUSICFOLDER": music,
                "ND_DATAFOLDER": paths.navidrome.path,
                "ND_ADDRESS": "127.0.0.1",
                "ND_PORT": String(navidromePort),
                "ND_SCANSCHEDULE": "1h",
                "ND_LOGLEVEL": "info",
                "ND_SESSIONTIMEOUT": "24h",
                "ND_SUBSONIC_DEFAULTREPORTREALPATH": "true",
                "ND_DEFAULTDOWNSAMPLINGFORMAT": "opus",
                "ND_TRANSCODINGCACHESIZE": "1GiB",
                // No usage reports to Navidrome's developers from inside SynAmp.
                "ND_ENABLEINSIGHTSCOLLECTOR": "false",
            ].merging(layout.ffmpegFolder.map { ["ND_FFMPEGPATH": $0.appendingPathComponent("ffmpeg").path] } ?? [:]) { $1 }) { $1 },
            workingDirectory: paths.navidrome, stopGrace: 10,
            health: URL(string: "http://127.0.0.1:\(navidromePort)/ping")
        )

        var brainEnv = base.merging(ffmpeg) { $1 }
        brainEnv.merge([
            "NODE_ENV": "production",
            // On the local network, so phones at home can play; the token guards it.
            "BRAIN_HOST": "0.0.0.0",
            "BRAIN_PORT": String(port),
            "LIBRARY_PATH": music,
            "CORE_URL": "http://127.0.0.1:\(navidromePort)",
            "CORE_MUSIC_PATH": music,
            "PLAYLIST_DATA_PATH": paths.brain.appendingPathComponent("playlists.json").path,
            "PLAYLIST_API_TOKEN": token,
            "LIBRARY_SIGNALS_PATH": paths.librarySignals.path,
            "WEB_ROOT": layout.web.path,
            // The app updates itself (Sparkle); the NAS-style check stays off.
            "UPDATE_CHECKS": "off",
            "SOURCE_PATH": "",
        ]) { $1 }
        if let incoming { brainEnv["INCOMING_PATH"] = incoming }
        if let info = layout.buildInfo { brainEnv["BUILD_INFO_PATH"] = info.path }
        let brain = ServiceSpec(
            name: "brain", label: "SynAmp server",
            executable: layout.node, arguments: ["--experimental-strip-types", "src/index.ts"],
            environment: brainEnv, workingDirectory: layout.brain, stopGrace: 10,
            health: localURL.appendingPathComponent("health")
        )

        var librarianEnv = base.merging([
            "NODE_ENV": "production",
            "LIBRARIAN_MUSIC_PATH": music,
            "LIBRARIAN_STATE_DIR": paths.librarian.path,
            "RENAME_JOURNAL_PATH": paths.renameJournal.path,
            "LIBRARIAN_TAG_BACKUPS": paths.tagBackups.path,
            "SYNAMP_BRAIN_URL": brainURL,
            "SYNAMP_BRAIN_TOKEN": token,
        ]) { $1 }
        if let incoming { librarianEnv["LIBRARIAN_INCOMING_PATH"] = incoming }
        let librarian = ServiceSpec(
            name: "librarian", label: "Library care",
            executable: layout.node, arguments: ["--experimental-strip-types", "src/librarian/main.ts"],
            environment: librarianEnv, workingDirectory: layout.brain,
            // It finishes a batch of file changes it has started.
            stopGrace: 120, health: nil
        )

        let listening = ServiceSpec(
            name: "listening", label: "Listening",
            executable: layout.python, arguments: ["-m", "synamp_analyzer.cli", "worker"],
            environment: base.merging([
                "LIBRARY_PATH": music,
                "ANALYZER_CACHE": paths.listening.path,
                "ANALYZER_DB_PATH": paths.listening.appendingPathComponent("analyzer.sqlite3").path,
                "RENAME_JOURNAL_PATH": paths.renameJournal.path,
                "SYNAMP_EXPORT_PATH": paths.librarySignals.path,
                "SYNAMP_MODEL_DIR": paths.models.path,
                "SYNAMP_BRAIN_URL": brainURL,
                "SYNAMP_BRAIN_TOKEN": token,
                "PYTHONUNBUFFERED": "1",
            ].merging(ffmpeg) { $1 }) { $1 },
            workingDirectory: paths.listening, stopGrace: 20, health: nil
        )
        return [navidrome, brain, librarian, listening]
    }
}

public enum LaunchError: Error, Equatable, CustomStringConvertible {
    case noMusicFolder
    case missingPieces([String])
    case noFreePort

    public var description: String {
        switch self {
        case .noMusicFolder: return "Choose your music folder first."
        case .missingPieces(let list): return "Part of SynAmp is missing: " + list.joined(separator: "; ")
        case .noFreePort: return "SynAmp couldn't find a free network port on this Mac."
        }
    }
}
