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
