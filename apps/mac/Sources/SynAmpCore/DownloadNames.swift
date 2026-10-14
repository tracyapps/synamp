import Foundation

/// Where a download from SynAmp's window is saved.
public enum DownloadNames {
    /// "report.txt", or "report 2.txt" if that's taken: never overwrite a file.
    public static func free(for name: String, in folder: URL,
                            exists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }) -> URL {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        // Only a file name: no folders, and nothing hidden.
        var clean = (trimmed.isEmpty ? "SynAmp download" : trimmed)
            .replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        while clean.hasPrefix(".") { clean.removeFirst() }
        if clean.isEmpty { clean = "SynAmp download" }
        let base = (clean as NSString).deletingPathExtension, ext = (clean as NSString).pathExtension
        var candidate = folder.appendingPathComponent(clean)
        var n = 2
        while exists(candidate.path) {
            candidate = folder.appendingPathComponent(ext.isEmpty ? "\(base) \(n)" : "\(base) \(n).\(ext)")
            n += 1
        }
        return candidate
    }
}
