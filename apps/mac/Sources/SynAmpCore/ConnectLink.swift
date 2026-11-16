import Foundation

/// A link that fills in the Mac app's connection form:
///   synamp://connect?home=http://Syd.local:8080&token=…&away=syd.tail1234.ts.net
/// SynAmp's web page makes it ("Connect the Mac app"), so nobody has to copy an
/// address or a token by hand. It only fills the form in: the person still
/// reads the address and presses Connect.
public struct ConnectLink: Equatable, Sendable {
    public static let scheme = "synamp"

    public var home: String
    public var token: String
    /// The away-from-home address, when the web page knows one.
    public var remote: String?

    public init(home: String, token: String, remote: String? = nil) {
        self.home = home
        self.token = token
        self.remote = remote
    }

    /// Nil unless it's a connect link with an address SynAmp could be at and a token.
    public init?(_ url: URL) {
        guard url.scheme?.lowercased() == Self.scheme, url.host?.lowercased() == "connect",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        func value(_ name: String) -> String? {
            items.first { $0.name == name }?.value?.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let home = value("home"), let address = Connection.address(home),
              let token = value("token"), !token.isEmpty, token.count <= 512 else { return nil }
        self.home = address.absoluteString
        self.token = token
        if let away = value("away"), !away.isEmpty {
            // The web page knows the name only ("syd.tail1234.ts.net"): SynAmp answers on the same port there.
            var text = away
            if !away.contains(":"), let port = address.port { text = "\(away):\(port)" }
            self.remote = Connection.address(text)?.absoluteString
        }
    }
}

/// Is any of the app's own windows open? While one is, SynAmp behaves like an
/// ordinary app (in the Dock and in Command-Tab), so a window that slipped
/// behind others can be found again. With none open it goes back to being a
/// menu-bar icon only.
public enum WindowPresence {
    /// `visible`: whether each of the app's windows that can take the keyboard is on screen.
    public static func shouldShowInDock(visible: [Bool]) -> Bool { visible.contains(true) }
}
