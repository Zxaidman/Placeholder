import { TILE, COLS, ROWS, type Room } from "./model";
export type Input = {
  axis: number;
  down: boolean;
  jump: boolean;
  dash: boolean;
  attack: boolean;
};
export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  wall: number;
  face: number;
  airJump: boolean;
  airDash: boolean;
  coyote: number;
  buffer: number;
  dashTime: number;
  attackTime: number;
};
export const WIDTH = 20,
  HEIGHT = 27,
  STEP = 1 / 120;
export function spawn(room: Room): Player {
  return {
    x: room.spawn.x * TILE + 6,
    y: room.spawn.y * TILE,
    vx: 0,
    vy: 0,
    grounded: false,
    wall: 0,
    face: 1,
    airJump: true,
    airDash: true,
    coyote: 0,
    buffer: 0,
    dashTime: 0,
    attackTime: 0,
  };
}
export function overlaps(
  x: number,
  y: number,
  w: number,
  h: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return x < bx + bw && x + w > bx && y < by + bh && y + h > by;
}
export function step(
  p: Player,
  input: Input,
  previous: Input,
  room: Room,
  dt = STEP,
): "dead" | "exit" | "checkpoint" | null {
  const solids = room.objects.filter((o) => o.kind === "solid");
  const jump = input.jump && !previous.jump,
    dash = input.dash && !previous.dash;
  p.buffer = jump ? 0.12 : Math.max(0, p.buffer - dt);
  p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
  p.attackTime = Math.max(0, p.attackTime - dt);
  if (input.attack && !previous.attack && input.down && room.abilities.pogo)
    p.attackTime = 0.2;
  if (input.axis) p.face = Math.sign(input.axis);
  if (p.buffer > 0) {
    if (p.coyote > 0) {
      p.vy = -560;
      p.buffer = 0;
      p.coyote = 0;
      p.grounded = false;
    } else if (p.wall && room.abilities.wallJump) {
      p.vy = -530;
      p.vx = -p.wall * 340;
      p.buffer = 0;
    } else if (p.airJump && room.abilities.doubleJump) {
      p.vy = -520;
      p.airJump = false;
      p.buffer = 0;
    }
  }
  if (dash && p.airDash && room.abilities.dash) {
    p.dashTime = 0.16;
    p.airDash = false;
    p.vy = 0;
    p.vx = p.face * 700;
  }
  if (p.dashTime > 0) {
    p.dashTime -= dt;
  } else {
    const target = input.axis * 270;
    p.vx += (target - p.vx) * Math.min(1, dt * (p.grounded ? 24 : 12));
    p.vy = Math.min(850, p.vy + (p.vy < 0 && input.jump ? 1450 : 2300) * dt);
    if (p.wall && p.vy > 100 && input.axis === p.wall) p.vy = 100;
  }
  // Short collision substeps prevent high-speed dashes tunneling through tiles.
  const n = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(p.vx * dt), Math.abs(p.vy * dt)) / 6),
  );
  p.grounded = false;
  p.wall = 0;
  for (let i = 0; i < n; i++) {
    p.x += (p.vx * dt) / n;
    for (const o of solids) {
      if (
        overlaps(p.x, p.y, WIDTH, HEIGHT, o.x * TILE, o.y * TILE, TILE, TILE)
      ) {
        p.wall = Math.sign(p.vx);
        p.x = p.vx > 0 ? o.x * TILE - WIDTH : o.x * TILE + TILE;
        p.vx = 0;
        p.dashTime = 0;
      }
    }
    p.y += (p.vy * dt) / n;
    for (const o of solids) {
      if (
        overlaps(p.x, p.y, WIDTH, HEIGHT, o.x * TILE, o.y * TILE, TILE, TILE)
      ) {
        if (p.vy >= 0) {
          p.y = o.y * TILE - HEIGHT;
          p.grounded = true;
          p.airJump = true;
          p.airDash = true;
        } else p.y = o.y * TILE + TILE;
        p.vy = 0;
      }
    }
  }
  p.x = Math.max(0, Math.min(COLS * TILE - WIDTH, p.x));
  if (p.y > ROWS * TILE + 80) return "dead";
  for (const o of room.objects) {
    const x = o.x * TILE,
      y = o.y * TILE;
    if (o.kind === "solid") continue;
    if (
      (o.kind === "pogo" || o.kind === "spike") &&
      p.attackTime > 0 &&
      p.vy >= 0 &&
      overlaps(p.x - 8, p.y + HEIGHT, WIDTH + 16, 30, x, y, TILE, TILE)
    ) {
      p.vy = -600;
      p.airDash = true;
      p.airJump = true;
      p.attackTime = 0;
      return null;
    }
    if (!overlaps(p.x, p.y, WIDTH, HEIGHT, x + 4, y + 4, 24, 24)) continue;
    if (o.kind === "spike" || o.kind === "pogo") return "dead";
    if (o.kind === "crystal") {
      p.airDash = true;
      p.airJump = true;
    }
    if (o.kind === "exit") return "exit";
    if (o.kind === "checkpoint") return "checkpoint";
  }
  return null;
}
export const emptyInput = (): Input => ({
  axis: 0,
  down: false,
  jump: false,
  dash: false,
  attack: false,
});
