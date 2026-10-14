import Foundation
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

/// Finding network ports nothing else on this Mac is using.
public enum Ports {
    /// Can something listen on this port right now? (Tries it for a moment.)
    public static func isFree(_ port: Int, host: String = "0.0.0.0") -> Bool {
        guard (1...65535).contains(port) else { return false }
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(port).bigEndian)
        address.sin_addr.s_addr = inet_addr(host)
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }

    /// The preferred port if it's free, else the next free one after it (up to
    /// `tries`), never one in `avoiding`.
    public static func pick(preferred: Int, avoiding: Set<Int> = [], tries: Int = 50,
                            isFree: (Int) -> Bool = { Ports.isFree($0) }) -> Int? {
        for port in preferred..<(preferred + tries) where !avoiding.contains(port) && isFree(port) {
            return port
        }
        return nil
    }
}

/// The access token: a long random secret the web app, phones and the pieces
/// share. Made once; kept by `TokenStore` (the Keychain in the app).
public enum AccessToken {
    public static func make() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        for index in bytes.indices { bytes[index] = UInt8.random(in: 0...255) }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}

public protocol TokenStore: Sendable {
    func read() -> String?
    func write(_ token: String) throws
}

extension TokenStore {
    /// The saved token, or a new one saved now.
    public func tokenCreatingIfNeeded() throws -> String {
        if let token = read(), !token.isEmpty { return token }
        let token = AccessToken.make()
        try write(token)
        return token
    }
}
