// Dev aid: screenshots live pages (WebGL and animation included) by driving headless Edge or Chrome
// over the DevTools protocol, waiting real seconds rather than virtual time.
// Usage: pnpm tsx scripts/shot.ts <url> <out.png> [width=1440] [height=900] [waitSeconds=6] [fullPage=0]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "undici";

const [url, out, w = "1440", h = "900", wait = "6", full = "0"] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: shot.ts <url> <out.png> [width] [height] [waitSeconds] [fullPage]");
  process.exit(2);
}
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const exe = BROWSERS.find((b) => fs.existsSync(b));
if (!exe) throw new Error("No Edge or Chrome found");
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nod-shot-"));
const proc = spawn(exe, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--hide-scrollbars",
  `--window-size=${w},${h}`,
  "about:blank",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let wsUrl = "";
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    } catch {
      await sleep(200);
    }
  }
  if (!wsUrl) throw new Error("DevTools did not come up");
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown };
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m.result);
      pending.delete(m.id);
    }
  });
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send("Emulation.setDeviceMetricsOverride", { width: Number(w), height: Number(h), deviceScaleFactor: 1, mobile: Number(w) < 600 });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(Number(wait) * 1000);
  let clip: object | undefined;
  if (full === "1") {
    const m = (await send("Page.getLayoutMetrics")) as { cssContentSize: { width: number; height: number } };
    clip = { x: 0, y: 0, width: Number(w), height: Math.ceil(m.cssContentSize.height), scale: 1 };
  }
  const shot = (await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full === "1", ...(clip ? { clip } : {}) })) as { data: string };
  fs.writeFileSync(out!, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${out}`);
  ws.close();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    proc.kill();
    setTimeout(() => {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        // profile still locked; harmless
      }
      process.exit();
    }, 500);
  });
