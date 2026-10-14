import Foundation

/// The few choices the person makes in the app. Saved as JSON beside SynAmp's
/// data; everything else is worked out from these.
public struct AppSettings: Codable, Sendable, Equatable {
    /// The folder of music SynAmp reads (and, only after approval, tidies).
    public var musicFolder: String?
    /// Where new music waits to be filed. Optional: no folder, no importing.
    public var incomingFolder: String?
    /// The address phones and browsers use: http://<this Mac>:<port>.
    public var port: Int
    /// Start SynAmp when this Mac starts.
    public var startAtLogin: Bool
    /// Keep the Mac awake while SynAmp is listening to the library or playing.
    public var preventSleep: Bool

    public static let defaultPort = 8380

    public init(musicFolder: String? = nil, incomingFolder: String? = nil, port: Int = AppSettings.defaultPort,
                startAtLogin: Bool = true, preventSleep: Bool = true) {
        self.musicFolder = musicFolder
        self.incomingFolder = incomingFolder
        self.port = port
        self.startAtLogin = startAtLogin
        self.preventSleep = preventSleep
    }

    /// Has the first run finished (a music folder chosen)?
    public var isSetUp: Bool { !(musicFolder ?? "").isEmpty }

    /// Read the saved settings. A missing file is a first run; a damaged one is
    /// set aside (never deleted) and the defaults are used.
    public static func load(from file: URL, fileManager: FileManager = .default) -> AppSettings {
        guard let data = try? Data(contentsOf: file) else { return AppSettings() }
        if let settings = try? JSONDecoder().decode(AppSettings.self, from: data) { return settings }
        let aside = file.deletingLastPathComponent()
            .appendingPathComponent("settings.unreadable-\(Int(Date().timeIntervalSince1970)).json")
        try? fileManager.moveItem(at: file, to: aside)
        return AppSettings()
    }

    /// Save all at once (a crash mid-save never leaves half a file).
    public func save(to file: URL) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: file, options: [.atomic])
    }
}
