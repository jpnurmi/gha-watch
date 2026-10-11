import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const platforms = { darwin: "macos", linux: "linux", win32: "windows" };
const platform = platforms[process.platform];
if (!platform) throw new Error(`Unsupported platform: ${process.platform}`);
if (process.argv.length > 3) throw new Error("Usage: npm run screenshot -- [OUTPUT.png]");

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] ?? `${root}/dist/screenshots/${platform}.png`);
const binary = resolve(root, `src-tauri/target/release/gha-watch${platform === "windows" ? ".exe" : ""}`);
await mkdir(dirname(output), { recursive: true });
await rm(output, { force: true });

await run(binary, ["--screenshot", output], "Build the screenshot app first: npm run tauri build -- --features screenshots --no-bundle");
if (platform === "macos") {
  await run("swift", [
    fileURLToPath(new URL("screenshot-macos.swift", import.meta.url)),
    output,
    resolve(root, "src-tauri/icons/tray-mixed-unseen.png"),
  ], "Could not run the macOS screenshot renderer.");
}

const png = await readFile(output);
if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw new Error(`The app did not produce a PNG: ${output}. Was it built with --features screenshots?`);
}
console.log(`Saved ${output} (${png.readUInt32BE(16)} × ${png.readUInt32BE(20)})`);

async function run(command, args, message) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Screenshot timed out after 60 seconds."));
    }, 60_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(message, { cause: error }));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Screenshot command exited with ${signal ?? code}.`));
    });
  });
}
