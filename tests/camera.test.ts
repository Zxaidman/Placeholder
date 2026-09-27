import { it, expect } from "vitest";
import { PlatformCamera } from "../src/camera";
const player = { x: 600, y: 900, vx: 0, vy: 0, grounded: true, gravity: 1 };
it("keeps takeoff ground visible during a normal jump", () => {
  const c = new PlatformCamera();
  c.update(player, 900, 550, 1 / 60);
  const initial = c.y;
  for (let i = 0; i < 35; i++)
    c.update(
      {
        ...player,
        y: 900 - 100 * Math.sin((i / 35) * Math.PI),
        grounded: false,
        vy: -200,
      },
      900,
      550,
      1 / 60,
    );
  expect(Math.abs(c.y - initial)).toBeLessThan(8);
  expect(c.y + 275).toBeGreaterThan(player.y + 28);
});
it("looks toward travel and eases changes in direction", () => {
  const c = new PlatformCamera();
  c.update(player, 900, 550, 1 / 60);
  for (let i = 0; i < 60; i++)
    c.update({ ...player, vx: 280 }, 900, 550, 1 / 60);
  const before = c.x;
  expect(before).toBeGreaterThan(680);
  c.update({ ...player, vx: -280 }, 900, 550, 1 / 60);
  expect(before - c.x).toBeLessThan(20);
});
it("reveals space below during a fast fall and snaps on room reset", () => {
  const c = new PlatformCamera();
  c.update(player, 900, 550, 1 / 60);
  for (let i = 0; i < 60; i++)
    c.update(
      { ...player, y: 1100, vy: 650, grounded: false },
      900,
      550,
      1 / 60,
    );
  expect(c.y).toBeGreaterThan(1130);
  c.reset();
  c.update({ ...player, x: 100, y: 200 }, 900, 550, 1 / 60);
  expect(c.y).toBeLessThan(300);
});
it("looks down only after a deliberate stationary hold", () => {
  const c = new PlatformCamera();
  c.update(player, 900, 550, 1 / 60);
  const initial = c.y;
  for (let n = 0; n < 10; n++) c.update(player, 900, 550, 1 / 60, true);
  expect(c.y).toBe(initial);
  for (let n = 0; n < 80; n++) c.update(player, 900, 550, 1 / 60, true);
  expect(c.y).toBeGreaterThan(initial + 90);
  for (let n = 0; n < 100; n++)
    c.update({ ...player, vx: 280 }, 900, 550, 1 / 60, true);
  expect(c.y).toBeLessThan(initial + 3);
});
it("mirrors airborne framing when gravity is inverted", () => {
  const down = new PlatformCamera(),
    up = new PlatformCamera();
  for (let n = 0; n < 100; n++) {
    const p = {
      ...player,
      y: 900 - Math.sin((n / 100) * Math.PI) * 170,
      grounded: n === 0,
      vy: n < 50 ? -300 : 300,
    };
    down.update(p, 900, 550, 1 / 60);
    up.update(
      { ...p, y: 1800 - p.y - 28, vy: -p.vy, gravity: -1 },
      900,
      550,
      1 / 60,
    );
    expect(Math.abs(down.y + up.y - 1800)).toBeLessThan(0.001);
  }
});
