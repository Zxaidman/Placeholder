import { z } from "zod";
export const COLS = 40,
  ROWS = 22,
  TILE = 32;
export const kinds = [
  "solid",
  "spike",
  "pogo",
  "crystal",
  "checkpoint",
  "exit",
] as const;
export type Kind = (typeof kinds)[number];
const point = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(COLS - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(ROWS - 1),
});
const object = point.extend({ kind: z.enum(kinds) });
export const projectSchema = z
  .object({
    format: z.literal("thornwake"),
    schemaVersion: z.literal("1.0.0"),
    name: z.string().trim().min(1).max(80),
    rooms: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          name: z.string().min(1).max(60),
          spawn: point,
          deathRule: z.enum(["instant", "health"]),
          abilities: z.object({
            dash: z.boolean(),
            doubleJump: z.boolean(),
            wallJump: z.boolean(),
            pogo: z.boolean(),
          }),
          objects: z.array(object).max(COLS * ROWS),
        }),
      )
      .min(1)
      .max(30),
  })
  .superRefine((p, c) => {
    const ids = new Set<string>();
    for (const r of p.rooms) {
      if (ids.has(r.id))
        c.addIssue({ code: "custom", message: "Room IDs must be unique" });
      ids.add(r.id);
      const cells = new Set<string>();
      for (const o of r.objects) {
        const key = `${o.x},${o.y}`;
        if (cells.has(key))
          c.addIssue({
            code: "custom",
            message: "Only one object per cell is supported",
          });
        cells.add(key);
      }
      if (
        r.objects.some(
          (o) => o.kind === "solid" && o.x === r.spawn.x && o.y === r.spawn.y,
        )
      )
        c.addIssue({
          code: "custom",
          message: "Spawn cannot be inside a wall",
        });
      if (r.objects.filter((o) => o.kind === "exit").length !== 1)
        c.addIssue({
          code: "custom",
          message: "Each room needs exactly one exit",
        });
    }
  });
export type Project = z.infer<typeof projectSchema>;
export type Room = Project["rooms"][number];
export type TileObject = Room["objects"][number];
export function parseProject(text: string): Project {
  if (text.length > 2_000_000) throw Error("Project exceeds the 2 MB limit");
  return projectSchema.parse(JSON.parse(text));
}
export function blankRoom(name = "Untitled trial"): Room {
  return {
    id: crypto.randomUUID(),
    name,
    spawn: { x: 2, y: 18 },
    deathRule: "instant",
    abilities: { dash: true, doubleJump: true, wallJump: true, pogo: true },
    objects: [
      ...Array.from({ length: COLS }, (_, x) => ({
        x,
        y: 20,
        kind: "solid" as const,
      })),
      { x: 37, y: 19, kind: "exit" },
    ],
  };
}
export function demoProject(): Project {
  const a = blankRoom("01 · The waking steps");
  a.objects = a.objects.filter(
    (o) => o.kind !== "solid" || o.x < 12 || o.x > 17,
  );
  for (let x = 7; x < 11; x++) a.objects.push({ x, y: 17, kind: "solid" });
  for (let x = 19; x < 23; x++) a.objects.push({ x, y: 17, kind: "solid" });
  a.objects.push(
    { x: 15, y: 18, kind: "pogo" },
    { x: 25, y: 19, kind: "checkpoint" },
    { x: 29, y: 19, kind: "spike" },
    { x: 30, y: 19, kind: "spike" },
    { x: 33, y: 16, kind: "crystal" },
  );
  const b = blankRoom("02 · Across the thorns");
  b.objects = b.objects.filter(
    (o) => o.kind !== "solid" || o.x < 6 || o.x > 33,
  );
  for (const x of [9, 17, 25]) b.objects.push({ x, y: 18, kind: "pogo" });
  for (const x of [13, 21, 29]) b.objects.push({ x, y: 15, kind: "crystal" });
  b.deathRule = "health";
  return {
    format: "thornwake",
    schemaVersion: "1.0.0",
    name: "The silent palace",
    rooms: [a, b],
  };
}
