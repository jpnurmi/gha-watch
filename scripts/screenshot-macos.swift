import AppKit
import Foundation

@MainActor
enum ScreenshotRenderer {
  private static let width = 740
  private static let height = 480

  static func write(to path: String, iconPath: String) throws {
    guard
      let popup = NSImage(contentsOfFile: path),
      let icon = NSImage(contentsOfFile: iconPath),
      let image = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
      ),
      let context = NSGraphicsContext(bitmapImageRep: image)
    else {
      throw CocoaError(.fileReadCorruptFile)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    draw(popup: popup, icon: icon)
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()

    guard let data = image.representation(using: .png, properties: [:]) else {
      throw CocoaError(.fileWriteUnknown)
    }
    try data.write(to: URL(fileURLWithPath: path))
  }

  private static func draw(popup: NSImage, icon: NSImage) {
    NSGradient(
      colors: [
        NSColor(srgbRed: 0.08, green: 0.1, blue: 0.15, alpha: 1),
        NSColor(srgbRed: 0.2, green: 0.22, blue: 0.28, alpha: 1),
      ])?.draw(in: topRect(x: 0, y: 0, width: width, height: height), angle: -35)

    NSColor(srgbRed: 0.05, green: 0.05, blue: 0.055, alpha: 0.96).setFill()
    topRect(x: 0, y: 0, width: width, height: 38).fill()
    drawText("", x: 16, y: 8, size: 18)
    drawText("Finder", x: 46, y: 10, weight: .semibold)
    for (title, x) in [("File", 108), ("Edit", 148), ("View", 188), ("Go", 234), ("Window", 272), ("Help", 338)] {
      drawText(title, x: x, y: 10)
    }
    drawText("Sun 17 May  12:00", x: 584, y: 10)

    NSColor.white.withAlphaComponent(0.14).setFill()
    NSBezierPath(roundedRect: topRect(x: 472, y: 4, width: 32, height: 30), xRadius: 6, yRadius: 6).fill()
    icon.draw(in: topRect(x: 479, y: 10, width: 18, height: 18))

    let bounds = topRect(x: 258, y: 50, width: 460, height: 400)
    let shadow = NSShadow()
    shadow.shadowBlurRadius = 18
    shadow.shadowOffset = NSSize(width: 0, height: -5)
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.5)
    shadow.set()
    NSColor(srgbRed: 22.0 / 255, green: 27.0 / 255, blue: 34.0 / 255, alpha: 1).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: 12, yRadius: 12).fill()
    NSShadow().set()
    popup.draw(in: bounds)
  }

  private static func drawText(
    _ value: String,
    x: Int,
    y: Int,
    size: CGFloat = 13,
    weight: NSFont.Weight = .regular
  ) {
    let attributes: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: size, weight: weight),
      .foregroundColor: NSColor.white,
    ]
    let string = value as NSString
    let measured = string.size(withAttributes: attributes)
    string.draw(at: NSPoint(x: CGFloat(x), y: CGFloat(height - y) - measured.height), withAttributes: attributes)
  }

  private static func topRect(x: Int, y: Int, width: Int, height: Int) -> NSRect {
    NSRect(x: CGFloat(x), y: CGFloat(Self.height - y - height), width: CGFloat(width), height: CGFloat(height))
  }
}

guard CommandLine.arguments.count == 3 else {
  fatalError("usage: screenshot-macos.swift SCREENSHOT.png ICON.png")
}
try ScreenshotRenderer.write(to: CommandLine.arguments[1], iconPath: CommandLine.arguments[2])
