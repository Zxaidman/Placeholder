import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
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
try {
  const c = await b.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const p = await c.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
  await p.locator("canvas").waitFor();
  try {
    await p.waitForSelector("body[data-ready=true]", { timeout: 30000 });
  } catch (error) {
    console.error("Thornwake boot diagnostics:", JSON.stringify({
      errors,
      url: await p.url(),
      bodyClass: await p.locator("body").getAttribute("class"),
      bodyText: (await p.locator("body").innerText()).slice(0, 1200),
    }));
    throw error;
  }
  if (await p.locator("#chooseCreator").isVisible()) {
    await p.screenshot({ path: join(tmpdir(), "thornwake-menu.png") });
    await p.locator("#chooseCreator").click();
  }
  await p.waitForTimeout(200);
  assert.equal(await p.locator("#rooms option").count(), 12);
  await p.locator("#projectName").fill("V1 browser trial");
  await p.locator("#projectName").press("Tab");
  await p.locator("#save").click();
  await p.waitForFunction(() =>
    document.getElementById("toast").textContent.startsWith("Project saved"),
  );
  await p.reload();
  await p.waitForFunction(
    () => document.getElementById("projectName")?.value === "V1 browser trial",
  );
  if (await p.locator("#chooseCreator").isVisible())
    await p.locator("#chooseCreator").click();
  await p.locator("#addRoom").click();
  assert.equal(await p.locator("#rooms option").count(), 13);
  await p.locator("#undo").click();
  assert.equal(await p.locator("#rooms option").count(), 12);
  await p.locator("#rooms").selectOption("0");
  await p.locator("#fitRoom").click();
  await p.waitForTimeout(100);
  const bounds = await p.locator("canvas").boundingBox(),
    zoom = Math.min(bounds.width / 2560, bounds.height / 1408);
  const clickCell = (x, y) =>
    p.mouse.click(
      bounds.x + bounds.width / 2 + ((x + 0.5) * 32 - 1280) * zoom,
      bounds.y + bounds.height / 2 + ((y + 0.5) * 32 - 704) * zoom,
    );
  await p.locator('[data-tool="moving"]').click();
  await clickCell(70, 30);
  await p.locator('[data-tool="select"]').click();
  await clickCell(70, 30);
  await p.getByLabel("Speed (units/s)", { exact: true }).fill("90");
  await p.getByLabel("Speed (units/s)", { exact: true }).press("Tab");
  await p.locator("#copy").click();
  await clickCell(72, 32);
  await p.locator("#paste").click();
  const downloadPromise = p.waitForEvent("download");
  await p.locator("#export").click();
  const d = await downloadPromise;
  await d.saveAs(join(tmpdir(), "thornwake-v1-export.json"));
  const exported = JSON.parse(
    await readFile(join(tmpdir(), "thornwake-v1-export.json"), "utf8"),
  );
  assert.equal(exported.schemaVersion, "1.2.0");
  assert.ok(
    exported.rooms[0].objects.some(
      (o) => o.kind === "moving" && o.speed === 90,
    ),
  );
  await p
    .locator("#file")
    .setInputFiles(join(tmpdir(), "thornwake-v1-export.json"));
  await p.waitForFunction(() =>
    document.getElementById("toast").textContent.startsWith("Imported"),
  );
  await p.locator("#play").click();
  assert.equal(await p.locator("#jump").isVisible(), false);
  await p.locator("#controls").click();
  assert.equal(await p.locator("#touchControls").isChecked(), false);
  await p.locator("#touchControls").check();
  await p.locator("#closeDialog").click();
  await p.waitForTimeout(100);
  assert.equal(await p.locator("#jump").isVisible(), true);
  const jumpBox = await p.locator("#jump").boundingBox();
  await p.mouse.move(
    jumpBox.x + jumpBox.width / 2,
    jumpBox.y + jumpBox.height / 2,
  );
  await p.mouse.down();
  assert.ok(
    (await p.locator("#jump").getAttribute("class")).includes("pressed"),
  );
  await p.mouse.up();
  assert.ok(
    !(await p.locator("#jump").getAttribute("class")).includes("pressed"),
  );
  assert.equal(await p.locator("#dash").getAttribute("aria-disabled"), "true");
  await p.keyboard.down("KeyD");
  await p.waitForTimeout(300);
  await p.keyboard.up("KeyD");
  await p.locator("#pause").click();
  assert.equal(await p.locator("#overlay").isVisible(), true);
  await p.getByRole("button", { name: "Resume", exact: true }).click();
  await p.locator("#returnEditor").click();
  await p.screenshot({ path: join(tmpdir(), "thornwake-desktop.png") });
  await p.locator("#home").click();
  await p.locator("#chooseTutorial").click();
  await p.waitForFunction(
    () => document.getElementById("mode")?.textContent.includes("TUTORIAL"),
  );
  assert.ok((await p.locator("#mode").innerText()).includes("Wayfinder"));
  await p.locator("#home").click();
  await p.locator("#campaign").click();
  assert.equal(await p.locator("#chapters button").count(), 12);
  assert.equal(await p.locator("#chapters button").nth(1).isDisabled(), true);
  await p.locator("#practiceCampaign").check();
  await p.locator("#chapters button").nth(7).click();
  assert.ok((await p.locator("#mode").innerText()).includes("hanging garden"));
  await p.locator("#home").click();
  await p.locator("#chooseEndless").click();
  await p.locator("#seed").fill("browser-certified");
  await p.locator("#startRoom").fill("100");
  await p.locator("#startEndless").click();
  await p.waitForFunction(
    () => document.getElementById("mode")?.textContent.includes("ENDLESS"),
    { timeout: 20000 },
  );
  assert.ok((await p.locator("#mode").innerText()).includes("100"));
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(200);
  const surface = await p.locator("#surface").boundingBox();
  for (const ratio of ["4/3", "16/9", "full"]) {
    await p.locator("#ratio").selectOption(ratio);
    await p.waitForTimeout(100);
    const v = await p.locator("#video").boundingBox(),
      touch = await p.locator("#touch").boundingBox();
    assert.ok(
      Math.abs(touch.width - surface.width) < 1,
      "Touch area must remain full width",
    );
    const canvas = await p.locator("canvas").boundingBox();
    assert.ok(
      Math.abs(canvas.width - v.width) < 1 &&
        Math.abs(canvas.height - v.height) < 1,
      "Canvas must match video viewport after aspect changes",
    );
    if (ratio !== "full") {
      const [a, b] = ratio.split("/").map(Number);
      assert.ok(
        Math.abs(v.width / v.height - a / b) < 0.03,
        "Only video receives the chosen aspect",
      );
    }
    assert.equal(await p.locator("#jump").isVisible(), true);
  }
  await p.locator("#ratio").selectOption("4/3");
  await p.screenshot({ path: join(tmpdir(), "thornwake-mobile.png") });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.locator("#controls").click();
  await p.locator("#controlMode").selectOption("buttons");
  await p.locator("#reposition").click();
  await p.locator("#doneControls").click();
  await p.getByRole("button", { name: "Resume", exact: true }).click();
  assert.equal(await p.locator("#left").isVisible(), true);
  assert.equal(await p.locator("#stick").isVisible(), false);
  assert.deepEqual(errors, []);

  const mobile = await b.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36",
  });
  const mp = await mobile.newPage();
  await mp.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
  await mp.waitForSelector("body[data-ready=true]");
  await mp.locator("#chooseTutorial").click();
  assert.equal(await mp.locator("#jump").isVisible(), true);
  await mobile.close();

  const gamepadMobile = await b.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/153.0.0.0 Mobile Safari/537.36",
  });
  await gamepadMobile.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [
        {
          connected: true,
          axes: [0, 0],
          buttons: [],
        },
      ],
    });
  });
  const gp = await gamepadMobile.newPage();
  await gp.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
  await gp.waitForSelector("body[data-ready=true]");
  await gp.locator("#chooseTutorial").click();
  assert.equal(await gp.locator("#jump").isVisible(), false);
  await gamepadMobile.close();

  console.log(
    "Browser flows passed: creator paint/select/properties/copy, persistence/export/import, campaign practice/unlocks, certified endless room 100, mobile defaults, explicit touch toggle, and independent video aspect ratios.",
  );
} finally {
  await b.close();
}
