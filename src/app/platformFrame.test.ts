import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const rustSource = readFileSync(new URL("../../src-tauri/src/main.rs", import.meta.url), "utf8");
const cargoToml = readFileSync(new URL("../../src-tauri/Cargo.toml", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("platform frame styling", () => {
  it("detects Linux separately from the default popup frame", () => {
    expect(mainSource).toContain("getUiPlatform(navigator.userAgent)");
    expect(mainSource).toContain("if (/\\bLinux\\b/i.test(userAgent))");
  });

  it("clips the Linux content to rounded bottom corners", () => {
    expect(styles).toMatch(
      /:root\[data-platform="linux"\] \.shell\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0 0 12px 12px;[^}]*box-shadow:\s*none;/s,
    );
  });

  it("rounds the native Linux window frame", () => {
    expect(rustSource).toContain("configure_linux_window_frame");
    expect(rustSource).toContain("gtk::CssProvider::new()");
    expect(rustSource).toContain('add_class("gha-watch-rounded")');
    expect(rustSource).toContain("border-bottom-left-radius: 12px");
    expect(rustSource).toContain("border-bottom-right-radius: 12px");
  });

  it("clips rounded macOS frame corners", () => {
    expect(styles).toMatch(/\.shell\s*\{[^}]*border-radius:\s*12px;/s);
    expect(rustSource).toContain("configure_macos_window_frame");
    expect(rustSource).toContain("view.setWantsLayer(true)");
    expect(rustSource).toContain("layer.setCornerRadius(MACOS_POPUP_CORNER_RADIUS)");
    expect(rustSource).toContain("layer.setMasksToBounds(true)");
  });

  it("keeps user-resized Linux window dimensions", () => {
    expect(mainSource).toContain('if (document.documentElement.dataset.platform === "linux")');
    expect(mainSource).toContain("return;\n  }\n\n  const nextHeight = calculatePopupHeight");
  });

  it("restores persisted Linux window geometry", () => {
    expect(cargoToml).toMatch(
      /\[target\.'cfg\(target_os = "linux"\)'\.dependencies\][\s\S]*tauri-plugin-window-state = "2\.4\.1"/,
    );
    expect(rustSource).toContain('#[cfg(target_os = "linux")]\n    let builder = builder.plugin(');
    expect(rustSource).toContain("tauri_plugin_window_state::StateFlags::POSITION");
    expect(rustSource).toContain("tauri_plugin_window_state::StateFlags::SIZE");
  });

  it("does not move the native Linux window from app content", () => {
    expect(mainSource).not.toContain("bindLinuxWindowDrag");
    expect(mainSource).not.toContain("startDragging()");
    expect(mainSource).not.toContain("isLinuxWindowDragTarget");
  });

  it("requests a Linux titlebar with close, move, and resize controls", () => {
    expect(rustSource).toContain("configure_linux_window_controls");
    expect(rustSource).toContain("gtk_window.set_type_hint(gtk::gdk::WindowTypeHint::Utility)");
    expect(rustSource).toContain("window.run_on_main_thread");
    expect(rustSource).toContain("gtk::gdk::WMFunction::MOVE");
    expect(rustSource).toContain("gtk::gdk::WMFunction::RESIZE");
    expect(rustSource).toContain("gtk::gdk::WMFunction::CLOSE");
  });

  it("keeps Linux titlebar buttons above the titlebar drag event box", () => {
    expect(rustSource).toContain('titlebar.downcast::<gtk::EventBox>()');
    expect(rustSource).toContain("event_box.set_above_child(false)");
  });

  it("uses a close-only client-side Linux titlebar on every display backend", () => {
    expect(rustSource).toContain("gtk::HeaderBar::builder()");
    expect(rustSource).toContain('.decoration_layout("menu:close")');
    expect(rustSource).toContain("gtk_window.set_titlebar(Some(&event_box))");
    expect(rustSource).toContain("configure_linux_header_bar(&header)");
  });

  it("preserves native Linux titlebar interactions", () => {
    expect(rustSource).toContain("configure_linux_titlebar_events");
    expect(rustSource).toContain("gtk::gdk::EventMask::BUTTON_PRESS_MASK");
    expect(rustSource).toContain("window.begin_move_drag");
    expect(rustSource).toContain("gdk_window.show_window_menu");
    expect(rustSource).not.toContain("gha-watch-hover");
  });

  it("starts native resize drags from client-side decoration edges", () => {
    expect(rustSource).toContain("configure_linux_resize_events");
    expect(rustSource).toContain("linux_frame_bounds(window, width, height)");
    expect(rustSource).not.toContain("LINUX_RESIZE_HANDLE");
    expect(rustSource).toContain("window.begin_resize_drag");
    expect(rustSource).toContain("linux_resize_edge_for_event(&window, event)");
  });

  it("sets Linux window-manager controls when the native window is realized", () => {
    expect(rustSource).toContain("gtk_window.connect_realize");
    expect(rustSource).toContain("set_linux_window_manager_functions");
  });

  it("prevents Linux titlebar close from quitting the app", () => {
    expect(rustSource).toContain("WindowEvent::CloseRequested { api, .. }");
    expect(rustSource).toContain("api.prevent_close()");
    expect(rustSource).toContain("let _ = window.hide();");
  });

  it("does not fight Linux maximize requests after the window manager accepts them", () => {
    expect(rustSource).not.toContain("connect_is_maximized_notify");
    expect(rustSource).not.toContain("unmaximize");
  });

  it("does not keep re-anchoring the Linux window", () => {
    expect(rustSource).toContain('#[cfg(not(target_os = "linux"))]\n        {');
    expect(rustSource).toContain('#[cfg(not(target_os = "linux"))]\n            {');
  });

  it("hides non-Linux windows immediately when they lose focus", () => {
    expect(rustSource).toContain('#[cfg(not(target_os = "linux"))]\n            WindowEvent::Focused(false) =>');
  });

  it("does not wire unreliable Linux focus-loss auto-hide", () => {
    expect(rustSource).not.toContain("connect_linux_auto_hide");
    expect(rustSource).not.toContain("connect_focus_out_event");
    expect(rustSource).not.toContain("connect_has_toplevel_focus_notify");
    expect(rustSource).not.toContain("connect_is_active_notify");
    expect(rustSource).not.toContain("schedule_linux_auto_hide_check");
    expect(rustSource).not.toContain("linux_window_pointer_state");
  });

  it("presents the Linux window once instead of delayed refocusing it", () => {
    expect(rustSource).toContain("present_linux_window(window)");
    expect(rustSource).toContain("gtk_window.present()");
    expect(rustSource).toContain('#[cfg(target_os = "linux")]\n    return;');
    expect(rustSource).toContain('#[cfg(not(target_os = "linux"))]\n    {');
    expect(rustSource).toContain("std::thread::sleep(std::time::Duration::from_millis(75))");
  });
});
