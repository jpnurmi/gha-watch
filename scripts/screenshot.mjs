import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const platforms = ["linux", "macos", "windows"];
const [platform = "all", destination] = process.argv.slice(2);
if (process.argv.length > 4 || (platform !== "all" && !platforms.includes(platform))) {
  throw new Error("Usage: npm run screenshot -- [all|linux|macos|windows] [OUTPUT]");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch();
  for (const name of platform === "all" ? platforms : [platform]) {
    const output = platform === "all"
      ? resolve(destination ?? `${root}/dist/screenshots`, `${name}.png`)
      : resolve(destination ?? `${root}/dist/screenshots/${name}.png`);
    const page = await browser.newPage({
      viewport: { width: 740, height: 540 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce",
      locale: "en-US",
      timezoneId: "UTC",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === new URL(origin).origin) return route.continue();
      errors.push(`Unexpected external request: ${route.request().url()}`);
      return route.abort();
    });
    await page.goto(`${origin}scripts/screenshot.html?platform=${name}`);
    await page.locator("html[data-screenshot-ready]").waitFor();
    const content = await page.locator("#app").innerText();
    if (errors.length || /getsentry/i.test(content)) {
      throw new Error(`Invalid ${name} screenshot: ${errors.join("; ") || "getsentry repository"}`);
    }
    if (await page.locator("#app .watch").count() === 0) {
      throw new Error(`The ${name} screenshot has no rendered watches.`);
    }
    await mkdir(dirname(output), { recursive: true });
    await page.screenshot({ path: output, animations: "disabled" });
    console.log(`Saved ${output} (1480 × 1080)`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
