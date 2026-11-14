import Foundation
import Sparkle

/// Updates for the Mac app, with Sparkle: it checks SynAmp's update feed once a
/// day, shows what's new, and lets you install, skip that version or be
/// reminded later. Each update is checked against SynAmp's signing key before
/// anything is installed.
///
/// A build without the update key (development, or a test build from GitHub)
/// doesn't check at all, and the menu doesn't offer it.
@MainActor
final class Updates {
    private let controller: SPUStandardUpdaterController?

    init(bundle: Bundle = .main) {
        let key = bundle.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? ""
        let feed = bundle.object(forInfoDictionaryKey: "SUFeedURL") as? String ?? ""
        // A real key is 32 bytes (base64). Anything else would only make Sparkle
        // show an error at every start, so don't start it.
        let validKey = Data(base64Encoded: key)?.count == 32
        controller = !validKey || feed.isEmpty
            ? nil
            : SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
    }

    var available: Bool { controller != nil }

    func checkNow() {
        controller?.checkForUpdates(nil)
    }
}
