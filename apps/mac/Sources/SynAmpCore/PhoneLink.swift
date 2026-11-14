import Foundation

/// An address to open SynAmp at from a phone or another computer, shown as a
/// QR code so nobody has to type it. The access token rides along after the #
/// (never sent over the network; the web app keeps it for the tab and takes it
/// out of the address), so the phone is let in without typing that either.
public struct PhoneLink: Equatable, Sendable, Identifiable {
    public enum Place: String, Sendable { case home, away }
    public var place: Place
    /// The address without the token: safe to show and read aloud.
    public var address: String
    /// The full link the QR code holds.
    public var url: URL
    public var id: String { place.rawValue }

    public var title: String { place == .home ? "At home" : "Away from home" }
    public var detail: String {
        place == .home
            ? "For a phone on the same Wi-Fi as SynAmp."
            : "For anywhere else, through Listen anywhere."
    }

    public init?(place: Place, base: URL, token: String) {
        guard !token.isEmpty, let url = URL(string: "\(base.absoluteString)/#/library?access=\(token)") else { return nil }
        self.place = place
        self.address = base.absoluteString
        self.url = url
    }
}

public enum PhoneLinks {
    /// This Mac's name on the home network ("tapps-MacBook.local"), when it has
    /// one a phone can use. "localhost" and bare addresses are no use to a phone.
    public static func localName(_ hostName: String = ProcessInfo.processInfo.hostName) -> String? {
        let name = hostName.trimmingCharacters(in: .whitespaces)
        guard name.lowercased().hasSuffix(".local"), name.count > ".local".count else { return nil }
        return name
    }

    /// SynAmp on this Mac: phones reach it at this Mac's name and SynAmp's port.
    public static func forThisMac(port: Int, token: String, hostName: String = ProcessInfo.processInfo.hostName) -> [PhoneLink] {
        guard let name = localName(hostName), let base = URL(string: "http://\(name):\(port)") else { return [] }
        return [PhoneLink(place: .home, base: base, token: token)].compactMap { $0 }
    }

    /// SynAmp somewhere else: the same two addresses this Mac uses.
    public static func forConnection(_ connection: Connection, token: String) -> [PhoneLink] {
        var links: [PhoneLink] = []
        if let home = connection.homeURL, let link = PhoneLink(place: .home, base: home, token: token) { links.append(link) }
        if let remote = connection.remoteURL, let link = PhoneLink(place: .away, base: remote, token: token) { links.append(link) }
        return links
    }
}
