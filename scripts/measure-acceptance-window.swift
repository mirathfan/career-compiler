// Read-only independent CoreGraphics measurement, filtered to the owned process.
import CoreGraphics
import Foundation
guard CommandLine.arguments.count == 2, let pid = Int(CommandLine.arguments[1]) else {
    fatalError("Pass the verified isolated acceptance PID")
}
let windows = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
let matches = windows.filter {
    ($0[kCGWindowOwnerPID as String] as? Int) == pid &&
    ($0[kCGWindowName as String] as? String) == "CareerCompiler — SYNTHETIC NATIVE ACCEPTANCE"
}.map { window in
    ["pid": pid, "title": window[kCGWindowName as String] ?? "",
     "bounds": window[kCGWindowBounds as String] ?? [:],
     "onScreen": window[kCGWindowIsOnscreen as String] ?? false,
     "windowId": window[kCGWindowNumber as String] ?? 0] as [String: Any]
}
let data = try JSONSerialization.data(withJSONObject: matches, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
if matches.isEmpty { exit(1) }
