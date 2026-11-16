import Foundation

/// The mini player's buttons. The sound belongs to the player in SynAmp's
/// window (the web app); a button here asks that player to do it, the same
/// way its own buttons and keyboard shortcuts do (apps/web/src/player-commands.ts).
public enum PlayerCommands {
    /// The only things the mini player may ask for.
    public static let allowed: Set<String> = ["toggle", "next", "previous", "love"]

    /// The line of script that passes a command to the player; nil for anything else.
    public static func script(for command: String) -> String? {
        guard allowed.contains(command) else { return nil }
        return "window.dispatchEvent(new CustomEvent('synamp:player-command', { detail: '\(command)' }))"
    }

    /// What the mini player shows, from what SynAmp's player last said about
    /// itself. Nil: nothing to control (nothing chosen yet, or the queue ended).
    public static func view(from message: [String: Any]) -> [String: Any]? {
        guard message["empty"] as? Bool != true, message["available"] as? Bool == true,
              let title = message["title"] as? String, !title.isEmpty else { return nil }
        var view: [String: Any] = [
            "title": title,
            "paused": message["paused"] as? Bool ?? true,
            "loved": message["loved"] as? Bool ?? false,
            "busy": message["busy"] as? Bool ?? false,
        ]
        if let artist = message["artist"] as? String, !artist.isEmpty { view["artist"] = artist }
        if let playlist = message["playlist"] as? String, !playlist.isEmpty { view["playlist"] = playlist }
        return view
    }
}
