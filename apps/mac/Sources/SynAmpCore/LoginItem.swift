import Foundation
#if canImport(ServiceManagement)
import ServiceManagement
#endif

/// "Start SynAmp when this Mac starts": the app as a login item (System
/// Settings → General → Login Items shows it, and can turn it off too).
public enum LoginItem {
    public enum State: Equatable, Sendable {
        case on
        case off
        /// macOS wants the person to allow it in System Settings → Login Items.
        case needsApproval
        /// Not possible from here (an unsigned build, or not in Applications).
        case unavailable(String)
    }

    public static var state: State {
        #if canImport(ServiceManagement)
        switch SMAppService.mainApp.status {
        case .enabled: return .on
        case .requiresApproval: return .needsApproval
        case .notRegistered: return .off
        case .notFound: return .unavailable("SynAmp isn't in the Applications folder")
        @unknown default: return .off
        }
        #else
        return .unavailable("not supported here")
        #endif
    }

    /// Match the person's choice. Returns what's true afterwards.
    @discardableResult
    public static func apply(_ on: Bool) -> State {
        #if canImport(ServiceManagement)
        do {
            if on, state != .on { try SMAppService.mainApp.register() }
            if !on, state == .on || state == .needsApproval { try SMAppService.mainApp.unregister() }
        } catch {
            return .unavailable(error.localizedDescription)
        }
        #endif
        return state
    }
}
