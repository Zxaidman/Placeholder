import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
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
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173");
await page.locator("canvas").waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: join(tmpdir(), "thornwake-desktop.png") });
const canvasBounds = await page.locator("canvas").boundingBox();
const zoom = Math.min(canvasBounds.width / 1280, canvasBounds.height / 704);
await page.mouse.click(
  canvasBounds.x + canvasBounds.width / 2 + (176 - 640) * zoom,
  canvasBounds.y + canvasBounds.height / 2 + (176 - 352) * zoom,
);
const paintedDownload = page.waitForEvent("download");
await page.locator("#export").click();
const painted = await paintedDownload;
const paintedPath = join(tmpdir(), "thornwake-painted.json");
await painted.saveAs(paintedPath);
assert.ok(
  JSON.parse(await readFile(paintedPath, "utf8")).rooms[0].objects.some(
    (o) => o.kind === "solid" && o.x === 5 && o.y === 5,
  ),
  "Canvas painting writes the intended grid cell",
);
await page.locator("#undo").click();

await page.locator("#projectName").fill("Browser test");
await page.locator("#projectName").press("Tab");
await page.locator("#save").click();
await page.waitForFunction(() =>
  document.getElementById("toast").textContent.startsWith("Project saved"),
);
await page.reload();
await page.locator("canvas").waitFor();
await page.waitForTimeout(300);
assert.equal(await page.locator("#projectName").inputValue(), "Browser test");
await page.locator("#addRoom").click();
assert.equal(await page.locator("#rooms option").count(), 3);
await page.locator("#undo").click();
assert.equal(await page.locator("#rooms option").count(), 2);
const downloadPromise = page.waitForEvent("download");
await page.locator("#export").click();
const d = await downloadPromise;
assert.equal(d.suggestedFilename(), "thornwake-project.json");
await d.saveAs(join(tmpdir(), "thornwake-export.json"));
await page
  .locator("#file")
  .setInputFiles(join(tmpdir(), "thornwake-export.json"));
await page.waitForTimeout(200);
await page.locator("#play").click();
await page.keyboard.down("KeyD");
await page.waitForTimeout(300);
await page.keyboard.press("Space");
await page.keyboard.up("KeyD");
await page.locator("#pause").click();
assert.equal(await page.locator("#pauseOverlay").isVisible(), true);
await page.locator("#resume").click();
await page.locator("#play").click();
await page.locator("#settings").click();
await page.locator("#controlMode").selectOption("buttons");
await page.locator("#reposition").click();
await page.locator("#settings").click();
assert.equal(await page.locator("#dialog").isVisible(), false);
await page.setViewportSize({ width: 844, height: 390 });
await page.locator("#play").click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(tmpdir(), "thornwake-mobile.png") });
assert.equal(await page.locator("#jump").isVisible(), true);
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
await page.locator("#ratio").selectOption("4/3");
await page.waitForTimeout(100);
const bounds = await page.locator("#stage").boundingBox();
assert.ok(bounds.width > 100 && bounds.height > 100);
assert.ok(
  Math.abs(bounds.width / bounds.height - 4 / 3) < 0.1,
  "Aspect ratio must be honored",
);
assert.deepEqual(errors, []);
console.log(
  "Browser checks passed: save/reload, rooms/undo, export/import, play/pause, controls, mobile, aspect ratio; no page errors.",
);
await browser.close();
