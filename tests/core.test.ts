import { describe, it, expect } from "vitest";
import {
  blankRoom,
  blankProject,
  parseProject,
  tile,
  roomHash,
  PHYSICS_VERSION,
} from "../src/model";
import {
  World,
  emptyInput,
  HEIGHT,
  recordInput,
  verifyClear,
} from "../src/physics";
import { generateRoom, replayRoute } from "../src/generator";
import { campaign, tutorial } from "../src/content";
describe("versioned projects", () => {
  it("round-trips rooms with all properties", () => {
    const p = blankProject();
    p.rooms[0].objects.push(tile("anchor", 10, 20, { anchorMode: "swing" }));
    expect(
      parseProject(JSON.stringify(p)).rooms[0].objects.at(-1)?.anchorMode,
    ).toBe("swing");
  });
  it("migrates legacy v1.0.0 exports", () => {
    const p = blankProject() as any;
    p.schemaVersion = "1.0.0";
    p.rooms[0].objects.forEach((o: any) => delete o.id);
    expect(parseProject(JSON.stringify(p)).schemaVersion).toBe("1.2.0");
  });
  it("rejects missing exits, dangling links and unsafe positions", () => {
    const p = blankProject();
    p.rooms[0].objects = [];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
    p.rooms[0].objects = [tile("exit", 5, 5, { target: "missing" })];
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("allows unfinished drafts but blocks publishing them", () => {
    const p = blankProject();
    p.rooms[0].objects = [];
    expect(() => parseProject(JSON.stringify(p), true)).not.toThrow();
    expect(() => parseProject(JSON.stringify(p))).toThrow();
  });
  it("all authored rooms validate", () => {
    expect(() => parseProject(JSON.stringify(campaign()))).not.toThrow();
    expect(() => parseProject(JSON.stringify(tutorial()))).not.toThrow();
  });
  it("platform and under-platform cells are both walkable", () => {
    const r = blankRoom();
    r.objects = [
      tile("platform", 0, 37, { w: 10 }),
      tile("underPlatform", 0, 38, { w: 10 }),
      tile("exit", 8, 35),
    ];
    const w = new World(r);
    for (let n = 0; n < 240; n++) w.tick(emptyInput());
    expect(w.player.y + HEIGHT).toBe(37 * 32);
  });
});
describe("movement and interaction", () => {
  it("lands without sinking", () => {
    const w = new World(blankRoom());
    for (let n = 0; n < 240; n++) w.tick(emptyInput());
    expect(w.player.y + HEIGHT).toBe(37 * 32);
  });
  it("short hops rise less than held jumps", () => {
    function height(hold: number) {
      const w = new World(blankRoom());
      for (let n = 0; n < 120; n++) w.tick(emptyInput());
      const y = w.player.y;
      let top = y;
      for (let n = 0; n < 100; n++) {
        w.tick({ ...emptyInput(), jump: n < hold });
        top = Math.min(top, w.player.y);
      }
      return y - top;
    }
    expect(height(60)).toBeGreaterThan(height(5) + 15);
  });
  it("dash cannot tunnel through a thin wall", () => {
    const r = blankRoom();
    r.objects.push(tile("solid", 7, 20, { h: 18 }));
    const w = new World(r);
    w.player.grounded = true;
    w.tick({ ...emptyInput(), dash: true });
    for (let n = 0; n < 40; n++) w.tick(emptyInput());
    expect(w.player.x + 20).toBeLessThanOrEqual(7 * 32);
  });
  it("pogo bounces and refills", () => {
    const r = blankRoom();
    r.objects.push(tile("pogo", 4, 10));
    const w = new World(r);
    Object.assign(w.player, { x: 130, y: 280, vy: 200, airDash: false });
    w.tick({ ...emptyInput(), down: true, attack: true });
    expect(w.player.vy).toBe(-610);
    expect(w.player.airDash).toBe(true);
  });
  it("switch channels open matching doors", () => {
    const r = blankRoom();
    r.objects.push(tile("switch", 3, 36, { channel: "gate" }));
    const w = new World(r);
    w.tick(emptyInput());
    expect(w.channels.has("gate")).toBe(true);
  });
  it("gravity fields flip only on entry", () => {
    const r = blankRoom();
    r.objects.push(tile("gravity", 3, 36, { h: 2 }));
    const w = new World(r);
    w.tick(emptyInput());
    expect(w.player.gravity).toBe(-1);
    w.tick(emptyInput());
    expect(w.player.gravity).toBe(-1);
  });
  it("long dash requires a grounded charge and release", () => {
    const w = new World(blankRoom());
    for (let n = 0; n < 90; n++) w.tick(emptyInput());
    for (let n = 0; n < 60; n++)
      w.tick({ ...emptyInput(), down: true, dash: true });
    w.tick(emptyInput());
    expect(w.player.dashTime).toBeGreaterThan(0.5);
    expect(w.player.vx).toBeGreaterThan(1000);
  });
  it("survival detects health exhaustion", () => {
    const r = blankRoom();
    r.deathRule = "health";
    const w = new World(r);
    w.health = 1;
    w.player.y = 2000;
    w.tick(emptyInput());
    expect(w.exhausted).toBe(true);
  });
});
describe("procedural generation", () => {
  it("generates reproducible geometry", () => {
    expect(generateRoom("test", 0)).toEqual(generateRoom("test", 0));
  });
  it("certifies rooms across the first 100 difficulty steps", () => {
    for (let index = 0; index < 100; index++) {
      const g = generateRoom("first-root", index);
      expect(replayRoute(g.room, g.witness), `room ${index}`).toBe(true);
    }
  }, 30000);
  it("stays bounded beyond room 100", () => {
    const g = generateRoom("alternate", 300);
    expect(g.difficulty).toBe(1);
    expect(replayRoute(g.room, g.witness)).toBe(true);
  });
});
describe("clear evidence", () => {
  it("accepts a valid replay and rejects edited geometry", async () => {
    const g = generateRoom("proof", 0),
      clear = {
        roomId: g.room.id,
        roomHash: await roomHash(g.room),
        physicsVersion: PHYSICS_VERSION,
        inputs: g.witness,
      };
    expect(await verifyClear(g.room, clear)).toBe(true);
    g.room.spawn.x = 20;
    expect(await verifyClear(g.room, clear)).toBe(false);
  });
});

describe("advanced movement", () => {
  it("pulls toward a clawline anchor and releases near it", () => {
    const r = blankRoom();
    r.objects = [tile("anchor", 10, 28)];
    r.spawn = { x: 3, y: 32 };
    const w = new World(r);
    w.tick({ ...emptyInput(), hook: true });
    expect(w.player.grapple).toBe(r.objects[0].id);
    const start = w.player.x;
    for (let n = 0; n < 45; n++) w.tick(emptyInput());
    expect(w.player.x).toBeGreaterThan(start + 150);
    expect(w.player.grapple).toBeNull();
    expect(w.deaths).toBe(0);
  });
  it("holds a rope within its radius and releases on button up", () => {
    const r = blankRoom();
    r.objects = [tile("anchor", 8, 25, { anchorMode: "swing" })];
    r.spawn = { x: 4, y: 30 };
    const w = new World(r);
    w.tick({ ...emptyInput(), hook: true });
    const radius = w.player.rope;
    for (let n = 0; n < 100; n++)
      w.tick({ ...emptyInput(), hook: true, axis: 1 });
    expect(
      Math.hypot(w.player.x + 10 - 272, w.player.y + 14 - 816),
    ).toBeLessThanOrEqual(radius + 1);
    w.tick(emptyInput());
    expect(w.player.grapple).toBeNull();
    expect(w.deaths).toBe(0);
  });
  it("carries a standing player on moving platforms", () => {
    const r = blankRoom();
    r.objects = [tile("moving", 2, 38, { w: 8, travel: 10, speed: 60 })];
    const w = new World(r);
    for (let n = 0; n < 60; n++) w.tick(emptyInput());
    const x = w.player.x;
    for (let n = 0; n < 120; n++) w.tick(emptyInput());
    expect(w.player.x - x).toBeGreaterThan(50);
    expect(w.player.grounded).toBe(true);
  });
  it("accepts half-cell placement without rounding", () => {
    const p = blankProject();
    p.rooms[0].objects.push(tile("solid", 20.5, 30.5, { w: 1.5, h: 0.5 }));
    expect(parseProject(JSON.stringify(p)).rooms[0].objects.at(-1)?.x).toBe(
      20.5,
    );
  });
});
