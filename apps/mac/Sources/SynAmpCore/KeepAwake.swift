import Foundation
#if canImport(IOKit)
import IOKit.pwr_mgt
#endif

/// Keeps the Mac from going to sleep while SynAmp is busy (playing, streaming
/// to a phone, or listening to the library), and lets it sleep otherwise.
/// The display can still turn off; only the computer stays awake.
public final class KeepAwake: @unchecked Sendable {
    /// Make (true) or drop (false) the "don't sleep" request. Returns false if macOS refused.
    public typealias Assertion = (_ on: Bool, _ reason: String) -> Bool

    private let assertion: Assertion
    private let lock = NSLock()
    private var held = false

    public init(assertion: @escaping Assertion = KeepAwake.ioKitAssertion()) {
        self.assertion = assertion
    }

    /// Is the Mac being kept awake right now?
    public var isHolding: Bool { lock.withLock { held } }

    /// Busy and allowed: hold the Mac awake. Otherwise let it sleep.
    public func update(busy: Bool, allowed: Bool, reasons: [String] = []) {
        let want = busy && allowed
        lock.withLock {
            guard want != held else { return }
            let reason = reasons.isEmpty ? "SynAmp is working" : "SynAmp is " + reasons.joined(separator: " and ")
            if assertion(want, reason) || !want { held = want }
        }
    }

    /// The real one: an IOKit "prevent idle system sleep" assertion.
    public static func ioKitAssertion() -> Assertion {
        #if canImport(IOKit)
        var id = IOPMAssertionID(0)
        let lock = NSLock()
        return { on, reason in
            lock.withLock {
                if on {
                    guard id == 0 else { return true }
                    let result = IOPMAssertionCreateWithName(kIOPMAssertPreventUserIdleSystemSleep as CFString,
                                                             IOPMAssertionLevel(kIOPMAssertionLevelOn), reason as CFString, &id)
                    return result == kIOReturnSuccess
                }
                if id != 0 { IOPMAssertionRelease(id); id = 0 }
                return true
            }
        }
        #else
        return { _, _ in false }
        #endif
    }
}

/// Asks SynAmp's server every minute whether it's busy, and tells KeepAwake.
public final class ActivityWatcher: @unchecked Sendable {
    public struct Activity: Decodable, Equatable, Sendable {
        public var busy: Bool
        public var reasons: [String]
        public init(busy: Bool, reasons: [String]) {
            self.busy = busy
            self.reasons = reasons
        }
    }

    public typealias Fetch = @Sendable () async -> Activity?

    private let fetch: Fetch
    private let keepAwake: KeepAwake
    private let allowed: @Sendable () -> Bool
    private var task: Task<Void, Never>?

    public init(fetch: @escaping Fetch, keepAwake: KeepAwake, allowed: @escaping @Sendable () -> Bool) {
        self.fetch = fetch
        self.keepAwake = keepAwake
        self.allowed = allowed
    }

    /// Ask once and act on the answer. No answer (server busy or restarting): change nothing.
    public func check() async {
        guard let activity = await fetch() else { return }
        keepAwake.update(busy: activity.busy, allowed: allowed(), reasons: activity.reasons.map(Self.words))
    }

    public func start(every seconds: TimeInterval = 60) {
        stop(release: false)
        task = Task { [weak self] in
            while !Task.isCancelled {
                await self?.check()
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            }
        }
    }

    /// Stop asking, and (normally) let the Mac sleep again.
    public func stop(release: Bool = true) {
        task?.cancel()
        task = nil
        if release { keepAwake.update(busy: false, allowed: false) }
    }

    static func words(_ reason: String) -> String {
        switch reason {
        case "playing": return "playing music"
        case "phone": return "playing to a phone"
        case "listening": return "listening to your library"
        default: return reason
        }
    }

    /// The real fetch: GET /api/v1/system/activity with the access token.
    public static func http(base: URL, token: String) -> Fetch {
        { 
            var request = URLRequest(url: base.appendingPathComponent("api/v1/system/activity"))
            request.timeoutInterval = 5
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            guard let (data, response) = try? await URLSession.shared.data(for: request),
                  (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            return try? JSONDecoder().decode(Activity.self, from: data)
        }
    }
}
