import Foundation

/// What listening found when asked "is this new folder the same music as the
/// old one, in a new place?" (the answer of `synamp-analyze reroot --check`).
public struct MoveCheck: Decodable, Equatable, Sendable {
    /// Songs SynAmp knows in the old folder.
    public var known: Int
    /// How many of them it looked for in the new folder (an even spread).
    public var checked: Int
    /// How many of those are at the same place there.
    public var found: Int

    public init(known: Int, checked: Int, found: Int) {
        self.known = known
        self.checked = checked
        self.found = found
    }

    public enum Kind: Equatable, Sendable {
        /// Nothing is known yet: any folder is a fresh start.
        case first
        /// The same music in a new place: carry over what's been learned.
        case sameMusic
        /// Different music: listen from the start; keep what's known about the old.
        case differentMusic
    }

    /// "The same music" when at least four in five of the songs looked for are there.
    public var kind: Kind {
        if known == 0 || checked == 0 { return .first }
        return found * 5 >= checked * 4 ? .sameMusic : .differentMusic
    }
}

/// The question put to the person before the music folder changes. `check` is
/// nil when listening couldn't be asked.
public struct MusicFolderQuestion: Equatable, Sendable {
    public var title: String
    public var explanation: String
    /// Carry over what's been learned (only when it's the same music).
    public var carryOver: Bool

    public init(folderName: String, check: MoveCheck?) {
        let unchanged = "Nothing in the folder is changed until you approve a change."
        guard let check else {
            title = "Use “\(folderName)” as your music folder?"
            explanation = "SynAmp couldn't check whether this is the same music as before. It will look through the folder and recognise songs it already knows by their sound, which takes longer than usual. SynAmp restarts to do this. \(unchanged)"
            carryOver = false
            return
        }
        switch check.kind {
        case .first:
            title = "Use “\(folderName)” as your music folder?"
            explanation = "SynAmp restarts and starts listening to this folder. \(unchanged)"
            carryOver = false
        case .sameMusic:
            title = "Same music, new place"
            explanation = "SynAmp looked for \(StatusWords.number(check.checked)) of the songs it knows and found \(StatusWords.number(check.found)) of them in “\(folderName)”. It will carry over everything it has learned, so nothing is listened to again and your playlists stay as they are. SynAmp restarts to do this. \(unchanged)"
            carryOver = true
        case .differentMusic:
            title = "This looks like different music"
            explanation = "SynAmp looked for \(StatusWords.number(check.checked)) of the songs it knows and found only \(StatusWords.number(check.found)) of them in “\(folderName)”. It will listen to this folder from the start, which takes a while. What it learned about the old folder is kept, in case you switch back. \(unchanged)"
            carryOver = false
        }
    }
}

public enum MusicFolderError: Error, Equatable, CustomStringConvertible {
    case couldNotCarryOver

    public var description: String {
        switch self {
        case .couldNotCarryOver:
            return "SynAmp couldn't carry over what it has learned, so the music folder was not changed. “Show logs” has the details."
        }
    }
}

/// Runs one of listening's own commands to the end and hands back what it
/// printed (nil: it couldn't run, or said it failed). Injected so tests don't
/// need Python.
public typealias ListeningTool = @Sendable (_ arguments: [String], _ musicFolder: String) async -> Data?

public enum ListeningTools {
    /// The real thing: SynAmp's Python with the same settings listening runs with.
    public static func real(paths: AppPaths, layout: RuntimeLayout, note: @escaping @Sendable (String) -> Void) -> ListeningTool {
        { arguments, musicFolder in
            guard FileManager.default.isExecutableFile(atPath: layout.python.path) else { return nil }
            return await withCheckedContinuation { (done: CheckedContinuation<Data?, Never>) in
                let process = Process()
                process.executableURL = layout.python
                process.arguments = ["-m", "synamp_analyzer.cli"] + arguments
                process.environment = [
                    "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                    "HOME": FileManager.default.homeDirectoryForCurrentUser.path,
                    "LANG": "en_US.UTF-8",
                    "LIBRARY_PATH": musicFolder,
                    "ANALYZER_CACHE": paths.listening.path,
                    "ANALYZER_DB_PATH": paths.listening.appendingPathComponent("analyzer.sqlite3").path,
                    "PYTHONUNBUFFERED": "1",
                ]
                try? FileManager.default.createDirectory(at: paths.listening, withIntermediateDirectories: true)
                process.currentDirectoryURL = paths.listening
                let out = Pipe(), err = Pipe()
                process.standardOutput = out
                process.standardError = err
                process.terminationHandler = { finished in
                    let printed = out.fileHandleForReading.readDataToEndOfFile()
                    let complaints = String(decoding: err.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                    if finished.terminationStatus != 0 {
                        note("listening tool \(arguments.first ?? ""): failed (\(finished.terminationStatus)) \(complaints.suffix(400))")
                        done.resume(returning: nil)
                    } else {
                        done.resume(returning: printed)
                    }
                }
                do { try process.run() } catch {
                    note("listening tool \(arguments.first ?? ""): couldn't start (\(error.localizedDescription))")
                    done.resume(returning: nil)
                }
            }
        }
    }
}
