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
    /// Show the song that's playing beside SynAmp's icon in the menu bar.
    /// Off unless asked for: the menu bar is short of room on many Macs, and
    /// the menu itself always says what's playing.
    public var songInMenuBar: Bool
    /// Set when SynAmp runs somewhere else (a NAS, another computer) and this
    /// Mac only shows it. Nil: SynAmp runs on this Mac, from `musicFolder`.
    public var connection: Connection?

    public static let defaultPort = 8380

    public init(musicFolder: String? = nil, incomingFolder: String? = nil, port: Int = AppSettings.defaultPort,
                startAtLogin: Bool = true, preventSleep: Bool = true, songInMenuBar: Bool = false,
                connection: Connection? = nil) {
        self.musicFolder = musicFolder
        self.incomingFolder = incomingFolder
        self.port = port
        self.startAtLogin = startAtLogin
        self.preventSleep = preventSleep
        self.songInMenuBar = songInMenuBar
        self.connection = connection
    }

    private enum CodingKeys: String, CodingKey {
        case musicFolder, incomingFolder, port, startAtLogin, preventSleep, songInMenuBar, connection
    }

    /// Settings saved by an earlier version have no `songInMenuBar`: that reads as off.
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        musicFolder = try values.decodeIfPresent(String.self, forKey: .musicFolder)
        incomingFolder = try values.decodeIfPresent(String.self, forKey: .incomingFolder)
        port = try values.decode(Int.self, forKey: .port)
        startAtLogin = try values.decode(Bool.self, forKey: .startAtLogin)
        preventSleep = try values.decode(Bool.self, forKey: .preventSleep)
        songInMenuBar = try values.decodeIfPresent(Bool.self, forKey: .songInMenuBar) ?? false
        connection = try values.decodeIfPresent(Connection.self, forKey: .connection)
    }

    /// Has the first run finished (a music folder chosen, or a SynAmp to connect to)?
    public var isSetUp: Bool { !(musicFolder ?? "").isEmpty || connection != nil }

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
