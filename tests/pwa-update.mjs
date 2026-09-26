/** Run after npm run build. Exercises a real waiting worker and user-approved update. */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
let nextWorker = false;
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const path = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    let bytes = await readFile(path);
    if (pathname === "/sw.js" && nextWorker)
      bytes = Buffer.concat([
        bytes,
        Buffer.from("\n// controlled-update-test-v2\n"),
      ]);
    const mime =
      {
        ".js": "text/javascript",
        ".html": "text/html",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
      }[extname(path)] || "text/plain";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.evaluate(async () => await navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await p.locator("canvas").waitFor();
  await p.locator("#projectName").fill("Unfinished update draft");
  await p.locator("#projectName").press("Tab");
  await p.locator("#rooms").selectOption("1");
  await p.locator('[data-tool="erase"]').click();
  await p.waitForTimeout(100);
  const bounds = await p.locator("canvas").boundingBox(),
    zoom = Math.min(bounds.width / 1280, bounds.height / 704);
  await p.mouse.click(
    bounds.x + bounds.width / 2 + (1200 - 640) * zoom,
    bounds.y + bounds.height / 2 + (624 - 352) * zoom,
  );
  await p.locator("#settings").click();
  await p.locator("#controlMode").selectOption("buttons");
  await p.locator("#closeDialog").click();
  nextWorker = true;
  await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });
  await p.locator("#reviewUpdate").waitFor();
  await p.locator("#reviewUpdate").click();
  await p.locator("#applyUpdate").click();
  await p.waitForFunction(() =>
    document
      .getElementById("toast")
      ?.textContent.includes("Your editor draft was restored"),
  );
  assert.equal(
    await p.locator("#projectName").inputValue(),
    "Unfinished update draft",
  );
  assert.equal(await p.locator("#rooms").inputValue(), "1");
  assert.equal(
    await p.locator("body").getAttribute("data-controls"),
    "buttons",
  );
  await p.locator("#play").click();
  await p.waitForFunction(() =>
    document
      .getElementById("toast")
      ?.textContent.includes("Each room needs one exit"),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PWA update passed: real waiting worker activated; unfinished draft, selected room and control mode preserved; no page errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
