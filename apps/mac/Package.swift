// swift-tools-version:5.10
// SynAmp for Mac: the native shell that starts and looks after SynAmp's pieces.
// See docs/synamp/plans/MAC-APP.md. Build: scripts/build-app.sh (or `swift build`).
import PackageDescription

let package = Package(
    name: "SynAmpMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "SynAmp", targets: ["SynAmp"]),
    ],
    dependencies: [
        // Updates (MIT): the standard Mac updater — what's new, skip, remind later.
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.10.0"),
    ],
    targets: [
        // Everything that can be tested without a window: paths, settings,
        // what each piece is started with, ports, and the supervisor.
        .target(name: "SynAmpCore"),
        .executableTarget(name: "SynAmp", dependencies: ["SynAmpCore", .product(name: "Sparkle", package: "Sparkle")]),
        .testTarget(name: "SynAmpCoreTests", dependencies: ["SynAmpCore"]),
    ]
)
