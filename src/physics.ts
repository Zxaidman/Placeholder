import {
  COLS,
  ROWS,
  TILE,
  PHYSICS_VERSION,
  type Room,
  type TileObject,
  type Clear,
  roomHash,
} from "./model";
export const STEP = 1 / 120,
  WIDTH = 20,
  HEIGHT = 28;
export type Input = {
  axis: number;
  down: boolean;
  jump: boolean;
  dash: boolean;
  attack: boolean;
  hook: boolean;
};
export const emptyInput = (): Input => ({
  axis: 0,
  down: false,
  jump: false,
  dash: false,
  attack: false,
  hook: false,
});
export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: number;
  grounded: boolean;
  wall: number;
  airJump: boolean;
  airDash: boolean;
  coyote: number;
  buffer: number;
  dashTime: number;
  attackTime: number;
  gravity: number;
  charge: number;
  charging: boolean;
  grapple: string | null;
  rope: number;
  support: string | null;
};
export const spawn = (room: Room): Player => ({
  x: room.spawn.x * TILE + 6,
  y: room.spawn.y * TILE,
  vx: 0,
  vy: 0,
  face: 1,
  grounded: false,
  wall: 0,
  airJump: true,
  airDash: true,
  coyote: 0,
  buffer: 0,
  dashTime: 0,
  attackTime: 0,
  gravity: 1,
  charge: 0,
  charging: false,
  grapple: null,
  rope: 0,
  support: null,
});
export const overlaps = (
  x: number,
  y: number,
  w: number,
  h: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) => x < bx + bw && x + w > bx && y < by + bh && y + h > by;
export function rect(o: TileObject, time: number) {
  let x = o.x * TILE,
    y = o.y * TILE;
  if (o.kind === "moving" || o.kind === "enemy") {
    const distance = o.travel * TILE;
    const t = distance ? (time * o.speed) % (2 * distance) : 0;
    const d = t < distance ? t : 2 * distance - t;
    if (o.axis === "x") x += d;
    else y += d;
  }
  return { x, y, w: o.w * TILE, h: o.h * TILE };
}
export function active(o: TileObject, time: number, channels: Set<string>) {
  return o.kind === "timed"
    ? (time + o.phase) % o.period < o.period * 0.65
    : o.kind === "door"
      ? !channels.has(o.channel)
      : true;
}
export class World {
  player: Player;
  previous = emptyInput();
  time = 0;
  frames = 0;
  deaths = 0;
  health = 3;
  channels = new Set<string>();
  checkpoint: { x: number; y: number; gravity: number } | null = null;
  touching = new Set<string>();
  refills = new Map<string, number>();
  solids: TileObject[];
  interactions: TileObject[];
  lastEvent = "";
  exhausted = false;
  constructor(public room: Room) {
    this.player = spawn(room);
    this.solids = room.objects.filter((o) =>
      ["solid", "moving", "timed", "door"].includes(o.kind),
    );
    this.interactions = room.objects.filter(
      (o) => !["solid", "moving", "timed", "door"].includes(o.kind),
    );
  }
  reset(full = false) {
    if (full) {
      this.health = 3;
      this.checkpoint = null;
      this.deaths = 0;
      this.frames = 0;
    }
    this.player = spawn(this.room);
    if (this.checkpoint) Object.assign(this.player, this.checkpoint);
    this.time = 0;
    this.channels.clear();
    this.touching.clear();
    this.refills.clear();
  }
  die() {
    this.exhausted = false;
    this.deaths++;
    if (this.room.deathRule === "health") {
      this.health--;
      if (this.health <= 0) {
        this.exhausted = true;
        this.health = 3;
        this.checkpoint = null;
      }
    } else this.checkpoint = null;
    this.reset();
    this.lastEvent = "death";
    return { type: "death" } as const;
  }
  tick(
    i: Input,
  ): { type: "death" | "exit" | "checkpoint"; target?: string } | null {
    const p = this.player,
      dt = STEP,
      abilities = this.room.abilities;
    this.lastEvent = "";
    this.time += dt;
    this.frames++;
    const attack = i.attack && !this.previous.attack,
      jump = i.jump && !this.previous.jump,
      dash = i.dash && !this.previous.dash,
      hook = i.hook && !this.previous.hook;
    this.previous = { ...i };
    p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
    p.buffer = jump ? 0.12 : Math.max(0, p.buffer - dt);
    p.attackTime = Math.max(0, p.attackTime - dt);
    if (attack && i.down && abilities.pogo) p.attackTime = 0.18;
    if (i.axis) p.face = Math.sign(i.axis);
    if (p.buffer > 0) {
      if (p.coyote > 0) {
        p.vy = -560 * p.gravity;
        p.grounded = false;
        p.buffer = 0;
        p.coyote = 0;
        this.lastEvent = "jump";
      } else if (p.wall && abilities.wallJump) {
        p.vy = -540 * p.gravity;
        p.vx = -p.wall * 360;
        p.buffer = 0;
        this.lastEvent = "jump";
      } else if (p.airJump && abilities.doubleJump) {
        p.vy = -540 * p.gravity;
        p.airJump = false;
        p.buffer = 0;
        this.lastEvent = "jump";
      }
      if (p.buffer === 0) p.grapple = null;
    }
    if (dash && p.grounded && i.down && abilities.longDash) {
      p.charging = true;
      p.charge = 0;
    }
    if (p.charging) {
      p.charge += dt;
      p.vx = 0;
      if (!i.dash) {
        if (p.charge >= 0.45) {
          p.dashTime = 0.7;
          p.vx = p.face * 1100;
          p.vy = 0;
          p.airDash = false;
          this.lastEvent = "dash";
        }
        p.charging = false;
      }
      if (!p.grounded) p.charging = false;
    } else if (dash && p.airDash && abilities.dash) {
      p.dashTime = 0.16;
      p.airDash = false;
      p.vy = 0;
      p.vx = p.face * 700;
      p.grapple = null;
      this.lastEvent = "dash";
    }
    if (hook) {
      const anchor = this.room.objects
        .filter(
          (o) =>
            o.kind === "anchor" &&
            (o.anchorMode === "pull" ? abilities.grapple : abilities.swing),
        )
        .map((o) => ({
          o,
          d: Math.hypot(o.x * TILE + 16 - p.x - 10, o.y * TILE + 16 - p.y - 14),
        }))
        .filter((v) => v.d < 460 && v.d > 20)
        .sort((a, b) => a.d - b.d)[0];
      if (anchor) {
        p.grapple = anchor.o.id;
        p.rope = anchor.d;
        p.dashTime = 0;
      }
    }
    const anchor = p.grapple
      ? this.room.objects.find((o) => o.id === p.grapple)
      : undefined;
    if (anchor?.anchorMode === "pull") {
      const dx = anchor.x * TILE + 16 - (p.x + 10),
        dy = anchor.y * TILE + 16 - (p.y + 14),
        d = Math.hypot(dx, dy);
      if (d < 24) {
        p.grapple = null;
        p.vy = -350 * p.gravity;
        p.airDash = true;
        p.airJump = true;
      } else {
        p.vx = (dx / d) * 900;
        p.vy = (dy / d) * 900;
      }
    } else if (p.dashTime > 0) p.dashTime -= dt;
    else {
      if (!p.charging) {
        const target = i.axis * 280;
        p.vx += (target - p.vx) * Math.min(1, dt * (p.grounded ? 26 : 13));
      }
      p.vy += (p.vy * p.gravity < 0 && i.jump ? 1450 : 2300) * p.gravity * dt;
      p.vy = Math.max(-850, Math.min(850, p.vy));
      if (p.wall && p.vy * p.gravity > 115 && i.axis === p.wall)
        p.vy = 115 * p.gravity;
    }
    if (anchor?.anchorMode === "swing") {
      if (!i.hook) {
        p.grapple = null;
        p.airDash = true;
      } else {
        const dx = p.x + 10 - anchor.x * TILE - 16,
          dy = p.y + 14 - anchor.y * TILE - 16,
          d = Math.hypot(dx, dy) || 1;
        const radial = (p.vx * dx + p.vy * dy) / d;
        if (d >= p.rope - 2 && radial > 0) {
          p.vx -= (radial * dx) / d;
          p.vy -= (radial * dy) / d;
        }
        const nx = p.x + p.vx * dt + 10 - anchor.x * TILE - 16,
          ny = p.y + p.vy * dt + 14 - anchor.y * TILE - 16,
          nd = Math.hypot(nx, ny);
        if (nd > p.rope) {
          p.vx = (anchor.x * TILE + 16 + (nx / nd) * p.rope - p.x - 10) / dt;
          p.vy = (anchor.y * TILE + 16 + (ny / nd) * p.rope - p.y - 14) / dt;
        }
      }
    }
    const solidRects = this.solids
      .filter((o) => active(o, this.time, this.channels))
      .map((o) => ({ o, ...rect(o, this.time) }));
    if (p.support) {
      const platform = solidRects.find((o) => o.o.id === p.support);
      if (platform?.o.kind === "moving") {
        const old = rect(platform.o, this.time - dt);
        p.x += platform.x - old.x;
        p.y += platform.y - old.y;
      }
    }
    const n = Math.max(
      1,
      Math.ceil(Math.max(Math.abs(p.vx * dt), Math.abs(p.vy * dt)) / 6),
    );
    p.grounded = false;
    p.wall = 0;
    p.support = null;
    for (let sub = 0; sub < n; sub++) {
      p.x += (p.vx * dt) / n;
      for (const o of solidRects) {
        if (overlaps(p.x, p.y, WIDTH, HEIGHT, o.x, o.y, o.w, o.h)) {
          const direction = Math.sign(p.vx);
          if (!direction) continue;
          p.wall = direction;
          p.x = direction > 0 ? o.x - WIDTH : o.x + o.w;
          p.vx = 0;
          p.dashTime = 0;
          p.grapple = null;
        }
      }
      p.y += (p.vy * dt) / n;
      for (const o of solidRects) {
        if (overlaps(p.x, p.y, WIDTH, HEIGHT, o.x, o.y, o.w, o.h)) {
          const down = p.vy >= 0;
          p.y = down ? o.y - HEIGHT : o.y + o.h;
          if ((down ? 1 : -1) === p.gravity) {
            p.grounded = true;
            p.airJump = true;
            p.airDash = true;
            p.support = o.o.id;
          }
          p.vy = 0;
        }
      }
    }
    p.x = Math.max(0, Math.min(COLS * TILE - WIDTH, p.x));
    if (p.y > ROWS * TILE + 64 || p.y < -128) return this.die();
    const contacts = new Set<string>();
    let event: { type: "checkpoint" | "exit"; target?: string } | null = null;
    for (const o of this.interactions) {
      const r = rect(o, this.time);
      if (
        ["pogo", "spike", "enemy"].includes(o.kind) &&
        p.attackTime > 0 &&
        p.vy * p.gravity >= 0
      ) {
        const ay = p.gravity === 1 ? p.y + HEIGHT : p.y - 32;
        if (overlaps(p.x - 8, ay, WIDTH + 16, 32, r.x, r.y, r.w, r.h)) {
          p.vy = -610 * p.gravity;
          p.airDash = true;
          p.airJump = true;
          p.attackTime = 0;
          this.lastEvent = "pogo";
          continue;
        }
      }
      if (
        !overlaps(p.x, p.y, WIDTH, HEIGHT, r.x + 3, r.y + 3, r.w - 6, r.h - 6)
      )
        continue;
      contacts.add(o.id);
      if (["pogo", "spike", "enemy"].includes(o.kind)) return this.die();
      if (o.kind === "crystal" && (this.refills.get(o.id) || 0) < this.time) {
        p.airDash = true;
        p.airJump = true;
        this.refills.set(o.id, this.time + 1.2);
        this.lastEvent = "refill";
      }
      if (o.kind === "exit" && !this.touching.has(o.id)) {
        event = { type: "exit", target: o.target };
      }
      if (o.kind === "checkpoint" && this.room.deathRule === "health") {
        this.checkpoint = { x: p.x, y: p.y, gravity: p.gravity };
        if (!this.touching.has(o.id)) {
          this.health = 3;
          event = { type: "checkpoint" };
        }
      }
      if (o.kind === "gravity" && !this.touching.has(o.id)) {
        p.gravity *= -1;
        p.vy = -150 * p.gravity;
        p.grapple = null;
        p.airDash = true;
        p.airJump = true;
      }
      if (o.kind === "switch" && !this.touching.has(o.id)) {
        if (o.switchMode === "hold") this.channels.add(o.channel);
        else if (this.channels.has(o.channel)) this.channels.delete(o.channel);
        else this.channels.add(o.channel);
      }
      if (o.kind === "pad" && !this.touching.has(o.id)) {
        p.vx =
          o.direction === "left" ? -780 : o.direction === "right" ? 780 : p.vx;
        p.vy =
          o.direction === "up" ? -740 : o.direction === "down" ? 740 : p.vy;
        p.airDash = true;
        p.airJump = true;
        this.lastEvent = "pogo";
      }
    }
    for (const o of this.interactions)
      if (
        o.kind === "switch" &&
        o.switchMode === "hold" &&
        this.touching.has(o.id) &&
        !contacts.has(o.id)
      )
        this.channels.delete(o.channel);
    this.touching = contacts;
    return event;
  }
}
export function encodeInput(i: Input) {
  return (
    (i.axis < 0 ? 1 : i.axis > 0 ? 2 : 0) |
    (i.down ? 4 : 0) |
    (i.jump ? 8 : 0) |
    (i.dash ? 16 : 0) |
    (i.attack ? 32 : 0) |
    (i.hook ? 64 : 0)
  );
}
export function decodeInput(n: number): Input {
  return {
    axis: n & 1 ? -1 : n & 2 ? 1 : 0,
    down: !!(n & 4),
    jump: !!(n & 8),
    dash: !!(n & 16),
    attack: !!(n & 32),
    hook: !!(n & 64),
  };
}
export function recordInput(log: [number, number][], i: Input) {
  const n = encodeInput(i),
    last = log.at(-1);
  if (last && last[0] === n && last[1] < 65535) last[1]++;
  else log.push([n, 1]);
}
export async function verifyClear(room: Room, clear: Clear) {
  if (
    clear.physicsVersion !== PHYSICS_VERSION ||
    clear.roomHash !== (await roomHash(room))
  )
    return false;
  let frames = 0;
  const world = new World(room);
  for (const [mask, count] of clear.inputs) {
    frames += count;
    if (frames > 144000) return false;
    for (let n = 0; n < count; n++) {
      const e = world.tick(decodeInput(mask));
      if (e?.type === "exit") return true;
    }
    if (frames % 2000 < count) await new Promise((r) => setTimeout(r, 0));
  }
  return false;
}
