import Foundation
import Security

/// The access token, kept in the person's login Keychain (not in a file).
public struct KeychainTokenStore: TokenStore {
    public let service: String
    public let account: String

    public init(service: String = "org.synamp.app", account: String = "access-token") {
        self.service = service
        self.account = account
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    public func read() -> String? {
        var result: AnyObject?
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func write(_ token: String) throws {
        let data = Data(token.utf8)
        let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { return }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.status(status) }
    }

    public func delete() {
        SecItemDelete(query as CFDictionary)
    }
}

public enum KeychainError: Error, Equatable {
    case status(OSStatus)
}

/// For tests and previews: a token kept in memory.
public final class MemoryTokenStore: TokenStore, @unchecked Sendable {
    private var token: String?
    private let lock = NSLock()
    public init(_ token: String? = nil) { self.token = token }
    public func read() -> String? { lock.withLock { token } }
    public func write(_ token: String) throws { lock.withLock { self.token = token } }
}
