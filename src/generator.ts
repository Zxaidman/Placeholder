import { tile, allAbilities, type Room, type TileObject } from "./model";
import { World, emptyInput, recordInput, decodeInput, HEIGHT } from "./physics";
export const GENERATOR_VERSION = "1.0.0";
export type Generated = {
  room: Room;
  witness: [number, number][];
  difficulty: number;
  seed: string;
  index: number;
};
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function transfer(from: World, room: Room) {
  const to = new World(room);
  to.player = { ...from.player };
  to.previous = { ...from.previous };
  to.time = from.time;
  to.frames = from.frames;
  return to;
}
function reach(
  world: World,
  target: TileObject,
  log: [number, number][],
  maxFrames = 240,
) {
  const x = (target.x + target.w / 2) * 32;
  world.tick(emptyInput());
  recordInput(log, emptyInput());
  for (let n = 0; n < maxFrames; n++) {
    const p = world.player,
      dx = x - (p.x + 10);
    const axis =
      Math.abs(dx - p.vx * 0.07) < 5 ? 0 : Math.sign(dx - p.vx * 0.07);
    const i = {
      ...emptyInput(),
      axis,
      jump: n === 0 || n < 38 || (n > 40 && n < 95),
    };
    if (n > 38 && n < 41) i.jump = false;
    if (n === 62 && Math.abs(dx) > 115) i.dash = true;
    const event = world.tick(i);
    recordInput(log, i);
    if (event?.type === "death") return false;
    if (p.grounded && p.support === target.id) return true;
  }
  return false;
}
export function replayRoute(room: Room, witness: [number, number][]) {
  const world = new World(room);
  for (const [mask, n] of witness)
    for (let j = 0; j < n; j++) {
      const e = world.tick(decodeInput(mask));
      if (e?.type === "death") return false;
      if (e?.type === "exit") return true;
    }
  return false;
}
/** Bounded synthesis: no preset room templates, no unconstrained retry loop. */
export function generateRoom(seed: string, index: number): Generated {
  if (!Number.isSafeInteger(index) || index < 0 || index > 1_000_000)
    throw Error("Room index outside supported range");
  const difficulty = Math.min(1, index / 99),
    rng = random(`${GENERATOR_VERSION}:${seed}:${index}`);
  let id = 0;
  const obj = (
    kind: TileObject["kind"],
    x: number,
    y: number,
    props: Partial<TileObject> = {},
  ) => tile(kind, x, y, { ...props, id: `g${index}-${id++}` });
  const room: Room = {
    id: `endless-${index}`,
    name: `${["Dawn", "Ascent", "Thorns", "Ordeal", "Crown"][Math.min(4, Math.floor(difficulty * 5))]} · ${index + 1}`,
    spawn: { x: 2, y: 35 },
    deathRule: "health",
    abilities: allAbilities(),
    theme: index % 3 === 0 ? "palace" : index % 3 === 1 ? "garden" : "furnace",
    objects: [obj("solid", 0, 36, { w: 6, h: 2 })],
  };
  let world = new World(room);
  let platform = room.objects[0];
  let witness: [number, number][] = [];
  for (let n = 0; n < 30; n++) {
    world.tick(emptyInput());
    recordInput(witness, emptyInput());
  }
  while (platform.x + platform.w < 73) {
    let accepted = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const width = Math.max(1, Math.round(4 - difficulty * 2.8 + rng())),
        gap = attempt > 14 ? 2 : Math.floor(2 + rng() * (2 + difficulty * 3)),
        x = Math.min(74, platform.x + platform.w + gap),
        y = Math.max(25, Math.min(38, platform.y + Math.floor(rng() * 5) - 2));
      const candidate = obj("solid", x, y, {
        w: Math.min(width, 80 - x),
        h: 2,
      });
      const nextRoom = { ...room, objects: [...room.objects, candidate] };
      const next = transfer(world, nextRoom),
        inputs: [number, number][] = [];
      if (reach(next, candidate, inputs)) {
        room.objects.push(candidate);
        world = next;
        platform = candidate;
        witness.push(...inputs);
        accepted = true;
        break;
      }
    }
    if (!accepted)
      throw Error(
        "Could not certify a route within the generation budget. Try another seed.",
      );
  }
  const exit = obj(
    "exit",
    Math.min(79, platform.x + Math.floor(platform.w / 2)),
    platform.y - 1,
  );
  room.objects.push(exit);
  world = transfer(world, room);
  for (let n = 0; n < 120; n++) {
    const dx = exit.x * 32 + 16 - world.player.x - 10;
    const i = { ...emptyInput(), axis: Math.abs(dx) < 3 ? 0 : Math.sign(dx) };
    const e = world.tick(i);
    recordInput(witness, i);
    if (e?.type === "exit") break;
  }
  // Pogo targets and hook anchors offer alternate recoveries below/above the certified path.
  const platforms = room.objects.filter((o) => o.kind === "solid");
  for (let n = 1; n < platforms.length - 1; n += 3) {
    const p = platforms[n];
    room.objects.push(obj("pogo", Math.max(0, p.x - 2), Math.min(42, p.y + 4)));
    room.objects.push(
      obj("anchor", p.x, Math.max(2, p.y - 7), {
        anchorMode: n % 2 ? "pull" : "swing",
      }),
    );
    if (room.objects.length > 60) break;
  }
  // Introduce timed footholds only when the same recorded route still clears them.
  if (difficulty > 0.45) {
    for (const o of room.objects
      .filter((o) => o.kind === "solid")
      .slice(2, -2)
      .filter((_, i) => i % 3 === 0)) {
      o.kind = "timed";
      o.period = 2.6 + rng() * 2;
      o.phase = rng();
      if (!replayRoute(room, witness)) o.kind = "solid";
    }
  }
  if (!replayRoute(room, witness))
    throw Error("Generated room failed the final movement replay.");
  return { room, witness, difficulty, seed, index };
}
