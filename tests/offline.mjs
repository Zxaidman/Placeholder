import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const c = await b.newContext(),
  p = await c.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
await p.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await p.reload();
await p.waitForFunction(() => !!navigator.serviceWorker.controller);
await c.setOffline(true);
await p.reload();
await p.locator("canvas").waitFor();
await p.locator("#play").click();
assert.equal(await p.locator("#pause").isVisible(), true);
await p.locator("#home").click();
await p.locator("#chooseEndless").click();
await p.locator("#seed").fill("offline-worker");
await p.locator("#startEndless").click();
await p.waitForFunction(() => document.getElementById("mode")?.textContent.includes("ENDLESS"));
assert.deepEqual(errors, []);
console.log("Offline production reload, playtest and procedural worker passed.");
await b.close();
