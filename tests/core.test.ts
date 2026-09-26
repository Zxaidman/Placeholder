import { describe, it, expect } from "vitest";
import { blankRoom, demoProject, parseProject } from "../src/model";
import { spawn, step, emptyInput, STEP, HEIGHT } from "../src/physics";
describe("portable level contract", () => {
  it("round-trips demo rooms", () =>
    expect(parseProject(JSON.stringify(demoProject())).rooms).toHaveLength(2));
  it("rejects missing exits and duplicate room IDs", () => {
    const p = demoProject();
    p.rooms[0].objects = [];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    const q = demoProject();
    q.rooms[1].id = q.rooms[0].id;
    expect(() => parseProject(JSON.stringify(q))).toThrow();
  });
  it("rejects unbounded positions and unsupported schemas", () => {
    const p = demoProject();
    p.rooms[0].spawn.x = 9999;
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    expect(() => parseProject('{"schemaVersion":"999"}')).toThrow();
  });
});
describe("fixed-step movement", () => {
  it("lands without sinking through the floor", () => {
    const r = blankRoom(),
      p = spawn(r);
    for (let n = 0; n < 240; n++) step(p, emptyInput(), emptyInput(), r);
    expect(p.y + HEIGHT).toBeCloseTo(640);
    expect(p.grounded).toBe(true);
  });
  it("jumps vertically from rest and short hops lower than held jumps", () => {
    const r = blankRoom();
    function height(hold: number) {
      const p = spawn(r);
      for (let n = 0; n < 120; n++) step(p, emptyInput(), emptyInput(), r);
      const y = p.y;
      let min = y,
        prev = emptyInput();
      for (let n = 0; n < 100; n++) {
        const i = { ...emptyInput(), jump: n < hold };
        step(p, i, prev, r);
        prev = i;
        min = Math.min(min, p.y);
      }
      expect(p.x).toBe(70);
      return y - min;
    }
    expect(height(60)).toBeGreaterThan(height(5) + 15);
  });
  it("does not dash through a one-tile wall", () => {
    const r = blankRoom();
    for (let y = 0; y < 20; y++) r.objects.push({ x: 5, y, kind: "solid" });
    const p = spawn(r);
    step(p, { ...emptyInput(), dash: true }, emptyInput(), r);
    for (let n = 0; n < 30; n++) step(p, emptyInput(), emptyInput(), r);
    expect(p.x + 20).toBeLessThanOrEqual(160);
  });
  it("pogo restores air abilities and bounces before hazard damage", () => {
    const r = blankRoom();
    r.objects.push({ x: 4, y: 10, kind: "pogo" });
    const p = spawn(r);
    Object.assign(p, {
      x: 130,
      y: 280,
      vy: 200,
      airDash: false,
      airJump: false,
    });
    expect(
      step(p, { ...emptyInput(), down: true, attack: true }, emptyInput(), r),
    ).toBeNull();
    expect(p.vy).toBe(-600);
    expect(p.airDash).toBe(true);
  });
  it("disabled abilities do not dash", () => {
    const r = blankRoom();
    r.abilities.dash = false;
    const p = spawn(r);
    step(p, { ...emptyInput(), dash: true }, emptyInput(), r, STEP);
    expect(p.dashTime).toBe(0);
  });
});
