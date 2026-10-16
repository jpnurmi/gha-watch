import { createScreenshotWatches, screenshotNow } from "../src/app/screenshot.ts";
import { createTrayState } from "../src/app/trayState.ts";
import "../src/styles.css";
import "./screenshot.css";

const platform = new URLSearchParams(location.search).get("platform");
if (!["linux", "macos", "windows"].includes(platform)) throw new Error("Invalid screenshot platform");

window.__GHA_WATCH_SCREENSHOT__ = true;
document.documentElement.dataset.screenshotPlatform = platform;
const tray = createTrayState(createScreenshotWatches());
const icons = import.meta.glob("../src-tauri/icons/tray-*.svg", { eager: true, query: "?url", import: "default" });
const icon = icons[`../src-tauri/icons/tray-${tray.status}${tray.hasUnseenChanges ? "-unseen" : ""}.svg`];
const indicator = `<span class="desktop-tray"><img src="${icon}" alt="GHA Watch" /></span>`;
const wifi = `<svg viewBox="0 0 24 24"><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/></svg>`;
const volume = `<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></svg>`;
const battery = `<svg viewBox="0 0 28 24"><rect x="2" y="6" width="21" height="12" rx="3"/><path d="M26 10v4"/><rect x="5" y="9" width="15" height="6" rx="1" fill="currentColor" stroke="none"/></svg>`;
const status = `<span class="desktop-status">${wifi}${volume}${battery}</span>`;
const date = screenshotNow.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const weekday = screenshotNow.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
const time = screenshotNow.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit", minute: "2-digit" });
const bar = document.createElement("aside");
bar.className = "desktop-bar";

if (platform === "windows") {
  bar.innerHTML = `
    <span class="desktop-start"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h9v9H2zm11 0h9v9h-9zM2 13h9v9H2zm11 0h9v9h-9z"/></svg></span>
    <span class="desktop-notification-area">
      <svg viewBox="0 0 24 24"><path d="m7 14 5-5 5 5"/></svg>
      ${indicator}${wifi}${volume}
      <span class="desktop-clock">${screenshotNow.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" })}<br />${screenshotNow.toLocaleDateString("en-US", { timeZone: "UTC" })}</span>
    </span>`;
} else if (platform === "linux") {
  bar.innerHTML = `<span class="desktop-workspaces" aria-label="Workspaces"><svg viewBox="0 0 36 18"><rect y="5" width="20" height="8" rx="4"/><circle cx="30" cy="9" r="4" opacity="0.5"/></svg></span><span class="desktop-date">${date} &nbsp; ${time}</span><span class="desktop-notification-area">${indicator}${status}</span>`;
} else {
  bar.innerHTML = `<span class="desktop-menu"><b>Finder</b><span>File</span><span>Edit</span><span>View</span><span>Go</span></span><span class="desktop-notification-area">${indicator}${wifi}${battery}<span>${weekday} ${date} &nbsp; ${time}</span></span>`;
}
document.body.prepend(bar);

const popup = document.createElement("section");
popup.className = "desktop-popup";
if (platform === "linux") {
  popup.innerHTML = `<div class="desktop-titlebar"><b>GHA Watch</b><svg viewBox="0 0 24 24"><path d="m8 8 8 8m0-8-8 8"/></svg></div>`;
}
document.body.append(popup);
popup.append(document.querySelector("#app"));

await import("../src/main.ts");
document.documentElement.dataset.platform = platform === "macos" ? "default" : platform;
await new Promise(requestAnimationFrame);
await document.fonts.ready;
await Promise.all([...document.images].map((image) => image.decode()));
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
document.documentElement.dataset.screenshotReady = "true";
