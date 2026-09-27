import { z } from "zod";
export const VERSION = "1.2.0",
  PHYSICS_VERSION = "1.0.0";
export const COLS = 80,
  ROWS = 44,
  TILE = 32;
export const kinds = [
  "solid",
  "platform",
  "underPlatform",
  "spike",
  "pogo",
  "enemy",
  "crystal",
  "checkpoint",
  "exit",
  "anchor",
  "moving",
  "timed",
  "switch",
  "door",
  "gravity",
  "pad",
] as const;
export type Kind = (typeof kinds)[number];
export const abilityNames = [
  "dash",
  "doubleJump",
  "wallJump",
  "pogo",
  "longDash",
  "grapple",
  "swing",
] as const;
export type Ability = (typeof abilityNames)[number];
export type Abilities = Record<Ability, boolean>;
export const allAbilities = (): Abilities =>
  Object.fromEntries(abilityNames.map((k) => [k, true])) as Abilities;
export const pointSchema = z.object({
  x: z
    .number()
    .multipleOf(0.5)
    .min(0)
    .max(COLS - 1),
  y: z
    .number()
    .multipleOf(0.5)
    .min(0)
    .max(ROWS - 1),
});
export const objectSchema = pointSchema.extend({
  id: z.string().max(80),
  kind: z.enum(kinds),
  w: z.number().multipleOf(0.5).min(0.5).max(COLS).default(1),
  h: z.number().multipleOf(0.5).min(0.5).max(ROWS).default(1),
  axis: z.enum(["x", "y"]).default("x"),
  travel: z.number().min(0).max(20).default(4),
  speed: z.number().min(10).max(300).default(70),
  period: z.number().min(0.5).max(12).default(2.5),
  phase: z.number().min(0).max(12).default(0),
  channel: z.string().max(30).default("A"),
  target: z.string().max(80).default("next"),
  anchorMode: z.enum(["pull", "swing"]).default("pull"),
  switchMode: z.enum(["toggle", "hold"]).default("toggle"),
  direction: z.enum(["up", "down", "left", "right"]).default("up"),
});
export type TileObject = z.infer<typeof objectSchema>;
const abilitiesSchema = z.object({
  dash: z.boolean(),
  doubleJump: z.boolean(),
  wallJump: z.boolean(),
  pogo: z.boolean(),
  longDash: z.boolean(),
  grapple: z.boolean(),
  swing: z.boolean(),
});
export const roomSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(60),
  spawn: pointSchema,
  deathRule: z.enum(["instant", "health"]),
  abilities: abilitiesSchema,
  objects: z.array(objectSchema).max(2500),
  theme: z.enum(["palace", "garden", "furnace", "mycelium", "drowned"]).default("palace"),
});
export type Room = z.infer<typeof roomSchema>;
const clearSchema = z.object({
  roomId: z.string().max(80),
  physicsVersion: z.string().max(30),
  roomHash: z.string().length(64),
  inputs: z
    .array(
      z.tuple([
        z.number().int().min(0).max(127),
        z.number().int().min(1).max(65535),
      ]),
    )
    .max(150000),
});
export type Clear = z.infer<typeof clearSchema>;
export const projectDraftSchema = z.object({
  format: z.literal("thornwake"),
  schemaVersion: z.literal("1.2.0"),
  name: z.string().trim().min(1).max(80),
  rooms: z.array(roomSchema).min(1).max(100),
  clears: z.array(clearSchema).max(100).default([]),
});
export type Project = z.infer<typeof projectDraftSchema>;
export const projectSchema = projectDraftSchema.superRefine((p, ctx) => {
  const ids = new Set(p.rooms.map((r) => r.id));
  if (ids.size !== p.rooms.length)
    ctx.addIssue({ code: "custom", message: "Room IDs must be unique" });
  for (const r of p.rooms) {
    const objects = new Set<string>();
    for (const o of r.objects) {
      if (objects.has(o.id))
        ctx.addIssue({
          code: "custom",
          message: "Object IDs must be unique in a room",
        });
      objects.add(o.id);
      if (o.x + o.w > COLS || o.y + o.h > ROWS)
        ctx.addIssue({
          code: "custom",
          message: "Objects must fit inside the room",
        });
      if (
        ["moving", "enemy"].includes(o.kind) &&
        (o.axis === "x" ? o.x + o.w : o.y + o.h) + o.travel >
          (o.axis === "x" ? COLS : ROWS)
      )
        ctx.addIssue({
          code: "custom",
          message: "Movement path leaves the room",
        });
      if (
        o.kind === "exit" &&
        !["next", "finish", "previous"].includes(o.target) &&
        !ids.has(o.target)
      )
        ctx.addIssue({
          code: "custom",
          message: "An exit references a missing room",
        });
    }
    if (!r.objects.some((o) => o.kind === "exit"))
      ctx.addIssue({ code: "custom", message: "Each room needs an exit" });
    if (
      r.objects.some(
        (o) =>
          ["solid", "platform", "underPlatform", "door"].includes(o.kind) &&
          r.spawn.x >= o.x &&
          r.spawn.x < o.x + o.w &&
          r.spawn.y >= o.y &&
          r.spawn.y < o.y + o.h,
      )
    )
      ctx.addIssue({ code: "custom", message: "Spawn must be outside walls" });
  }
});
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const p = structuredClone(raw) as Record<string, unknown>;
  if ((p.schemaVersion === "1.0.0" || p.schemaVersion === "1.1.0") && Array.isArray(p.rooms)) {
    p.schemaVersion = "1.2.0";
    p.clears = [];
    p.rooms = p.rooms.map((r: any) => ({
      ...r,
      abilities: { ...allAbilities(), ...r.abilities },
      objects: Array.isArray(r.objects)
        ? r.objects.map((o: any, i: number) => ({
            ...o,
            id: o.id || `${r.id}-${i}`,
          }))
        : r.objects,
    }));
  }
  return p;
}
export function parseProject(text: string, draft = false): Project {
  if (text.length > 5_000_000) throw Error("Project exceeds 5 MB");
  const raw = migrate(JSON.parse(text));
  return (draft ? projectDraftSchema : projectSchema).parse(raw);
}
export function tile(
  kind: Kind,
  x: number,
  y: number,
  props: Partial<TileObject> = {},
): TileObject {
  return objectSchema.parse({ id: crypto.randomUUID(), kind, x, y, ...props });
}
export function blankRoom(name = "Untitled trial"): Room {
  return {
    id: crypto.randomUUID(),
    name,
    spawn: { x: 3, y: 36 },
    deathRule: "instant",
    abilities: allAbilities(),
    theme: "palace",
    objects: [
      tile("platform", 0, 37, { w: 80, h: 1 }),
      tile("underPlatform", 0, 38, { w: 80, h: 6 }),
      tile("exit", 75, 36),
    ],
  };
}
export function blankProject(): Project {
  return {
    format: "thornwake",
    schemaVersion: "1.2.0",
    name: "My palace",
    rooms: [blankRoom()],
    clears: [],
  };
}
export async function roomHash(room: Room) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(room)),
  );
  return [...new Uint8Array(bytes)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) || "thornwake";
}
