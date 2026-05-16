import { describe, expect, it } from "vitest";
import plist from "../../src-tauri/Info.plist?raw";

describe("macOS notification configuration", () => {
  it("requests alert-style notifications in the app bundle", () => {
    expect(plist).toContain("<key>NSUserNotificationAlertStyle</key>");
    expect(plist).toContain("<string>alert</string>");
  });
});
