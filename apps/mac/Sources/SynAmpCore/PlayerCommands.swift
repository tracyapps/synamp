import Foundation

/// The mini player's buttons. The sound belongs to the player in SynAmp's
/// window (the web app); a button here asks that player to do it, the same
/// way its own buttons and keyboard shortcuts do (apps/web/src/player-commands.ts).
public enum PlayerCommands {
    /// The only things the mini player may ask for.
    public static let allowed: Set<String> = [
        "toggle", "next", "previous", "love", "remove",
        "more-like-this", "not-for-this", "wrong-energy", "wrong-vibe",
        "remove-wrong-energy", "remove-wrong-vibe", "undo-remove",
    ]

    /// One line of a menu behind a split button's arrow: the words, and the command it sends.
    public struct Choice: Equatable, Sendable {
        public let title: String
        public let command: String
        public init(_ title: String, _ command: String) {
            self.title = title
            self.command = command
        }
    }

    /// The menu behind the arrow beside Skip ("skip"), Love ("love") or Remove
    /// ("remove"): the same choices, in the same words, as the player bar
    /// (apps/web/src/SongControls.tsx). Only a playlist can learn from a
    /// reason, so a song played from the Library has no menus.
    public static func menu(_ name: String, view: [String: Any]?) -> [Choice] {
        guard let view, view["playlist"] is String else { return [] }
        switch name {
        case "skip":
            return [Choice("Skip: not for this playlist", "not-for-this"), Choice("Skip: wrong energy", "wrong-energy"), Choice("Skip: wrong vibe", "wrong-vibe")]
        case "love":
            return [Choice("More like this next", "more-like-this")]
        case "remove":
            var choices = [Choice("Remove: wrong energy", "remove-wrong-energy"), Choice("Remove: wrong vibe", "remove-wrong-vibe")]
            if let removed = view["undo"] as? String { choices.append(Choice("Put back “\(removed)”", "undo-remove")) }
            return choices
        default:
            return []
        }
    }

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
        // The last song removed from a playlist, which can still be put back.
        if let undo = message["undo"] as? [String: Any], let removed = undo["title"] as? String, !removed.isEmpty { view["undo"] = removed }
        return view
    }
}
