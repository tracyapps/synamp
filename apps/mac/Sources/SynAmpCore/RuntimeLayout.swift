import Foundation

/// Where each of SynAmp's programs is. In the finished app they're all inside
/// `SynAmp.app/Contents/Resources/runtime`; while developing they come from a
/// checkout of the repository and tools already on the Mac.
public struct RuntimeLayout: Sendable, Equatable {
    public var node: URL
    /// `apps/brain` (holds `src/index.ts` and `src/librarian/main.ts`).
    public var brain: URL
    /// The built web app (`apps/web/dist`).
    public var web: URL
    public var navidrome: URL
    /// A Python with the analyzer and ONNX Runtime installed.
    public var python: URL
    /// Folder holding ffmpeg and ffprobe (nil: lighter streams are off).
    public var ffmpegFolder: URL?
    /// Which code this is (the brain shows it in Settings → About this install).
    public var buildInfo: URL?

    public init(node: URL, brain: URL, web: URL, navidrome: URL, python: URL, ffmpegFolder: URL?, buildInfo: URL?) {
        self.node = node
        self.brain = brain
        self.web = web
        self.navidrome = navidrome
        self.python = python
        self.ffmpegFolder = ffmpegFolder
        self.buildInfo = buildInfo
    }

    /// Inside the finished app.
    public static func bundled(resources: URL) -> RuntimeLayout {
        let runtime = resources.appendingPathComponent("runtime", isDirectory: true)
        return RuntimeLayout(
            node: runtime.appendingPathComponent("node/bin/node"),
            brain: runtime.appendingPathComponent("brain", isDirectory: true),
            web: runtime.appendingPathComponent("web", isDirectory: true),
            navidrome: runtime.appendingPathComponent("navidrome/navidrome"),
            python: runtime.appendingPathComponent("python/bin/python3"),
            ffmpegFolder: runtime.appendingPathComponent("ffmpeg", isDirectory: true),
            buildInfo: runtime.appendingPathComponent("build.json")
        )
    }

    /// From a checkout of the repository (SYNAMP_DEV_REPO), for trying the app
    /// before it's packaged. Node and ffmpeg come from the Mac (Homebrew or the
    /// official installers); Navidrome from `apps/mac/build/runtime/navidrome`
    /// (scripts/fetch-navidrome.sh); Python is the analyzer's own environment
    /// (`uv sync --extra listen`).
    public static func development(repo: URL,
                                   toolFolders: [URL] = ["/opt/homebrew/bin", "/usr/local/bin"].map { URL(fileURLWithPath: $0) },
                                   fileManager: FileManager = .default) -> RuntimeLayout {
        func find(_ name: String) -> URL? {
            toolFolders.first { fileManager.isExecutableFile(atPath: $0.appendingPathComponent(name).path) }
        }
        let fallback = toolFolders.first ?? URL(fileURLWithPath: "/usr/local/bin")
        return RuntimeLayout(
            node: (find("node") ?? fallback).appendingPathComponent("node"),
            brain: repo.appendingPathComponent("apps/brain", isDirectory: true),
            web: repo.appendingPathComponent("apps/web/dist", isDirectory: true),
            navidrome: repo.appendingPathComponent("apps/mac/build/runtime/navidrome/navidrome"),
            python: repo.appendingPathComponent("services/analyzer/.venv/bin/python3"),
            ffmpegFolder: find("ffmpeg"),
            buildInfo: nil
        )
    }

    /// The pieces that aren't there, in plain words (empty when all are).
    public func missing(fileManager: FileManager = .default) -> [String] {
        var problems: [String] = []
        let check: [(String, URL, Bool)] = [
            ("Node (runs the SynAmp server)", node, true),
            ("SynAmp's server code", brain.appendingPathComponent("src/index.ts"), false),
            ("the SynAmp app's pages", web.appendingPathComponent("index.html"), false),
            ("Navidrome (lets phone apps play your music)", navidrome, true),
            ("Python with SynAmp's listening", python, true),
        ]
        for (name, url, executable) in check {
            let ok = executable ? fileManager.isExecutableFile(atPath: url.path) : fileManager.fileExists(atPath: url.path)
            if !ok { problems.append("\(name) is missing at \(url.path)") }
        }
        return problems
    }
}
