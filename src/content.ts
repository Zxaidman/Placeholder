import {
  blankRoom,
  tile,
  allAbilities,
  type Project,
  type Ability,
  type Room,
} from "./model";
const unlocks: Ability[] = [
  "dash",
  "wallJump",
  "doubleJump",
  "pogo",
  "longDash",
  "grapple",
  "swing",
];
export const chapters = [
  ["The first breath", "Hold Jump for height. Short taps make short hops."],
  ["Broken bridges", "Dash crosses gaps. Touch the ground to refill it."],
  ["The narrow climb", "Jump against a wall to climb."],
  ["A second chance", "Jump again in midair. Crystals restore air abilities."],
  [
    "Thorn choir",
    "Hold Down and press Attack to pogo off orange targets and thorns.",
  ],
  [
    "The long crossing",
    "On the ground: hold Down + Dash to charge, then release Dash.",
  ],
  ["Threads of light", "Press Hook near an anchor to pull toward it."],
  [
    "The hanging garden",
    "Hold Hook at a round anchor to swing; release to launch.",
  ],
  ["Borrowed time", "Platforms fade on a cycle. Moving platforms carry you."],
  ["The gatekeeper", "Touch a switch to open its matching door."],
  [
    "The inverted hall",
    "Violet fields flip gravity. Your jump and pogo follow it.",
  ],
  [
    "The crown of thorns",
    "Use everything you learned. Checkpoints are scarce.",
  ],
];
export function tutorial(): Project {
  const r = blankRoom("First Steps · The Wayfinder");
  r.id = "tutorial";
  r.name = "First Steps · The Wayfinder";
  r.theme = "garden";
  r.deathRule = "health";
  r.abilities = allAbilities();
  r.spawn = { x: 3, y: 36 };
  r.objects = [
    tile("solid", 0, 38, { w: 80, h: 6 }),
    tile("exit", 76, 35, { target: "finish" }),
    tile("platform", 13, 34, { w: 4, h: 1 }),
    tile("underPlatform", 13, 35, { w: 4, h: 1 }),
    tile("platform", 20, 31, { w: 4, h: 1 }),
    tile("underPlatform", 20, 32, { w: 4, h: 1 }),
    tile("solid", 29, 27, { w: 2, h: 11 }),
    tile("solid", 35, 22, { w: 2, h: 16 }),
    tile("platform", 40, 31, { w: 5, h: 1 }),
    tile("underPlatform", 40, 32, { w: 5, h: 1 }),
    tile("pogo", 47, 36),
    tile("pogo", 50, 33),
    tile("checkpoint", 53, 35),
    tile("anchor", 59, 29, { anchorMode: "pull" }),
    tile("platform", 64, 31, { w: 4, h: 1 }),
    tile("underPlatform", 64, 32, { w: 4, h: 1 }),
    tile("anchor", 70, 24, { anchorMode: "swing" }),
    tile("platform", 73, 30, { w: 4, h: 1 }),
    tile("underPlatform", 73, 31, { w: 4, h: 1 }),
  ];
  r.objects.forEach((o, i) => (o.id = `tutorial-${i}`));
  return {
    format: "thornwake",
    schemaVersion: "1.2.0",
    name: "Wayfinder tutorial",
    rooms: [r],
    clears: [],
  };
}

function base(n: number): Room {
  const r = blankRoom(chapters[n][0]);
  r.id = `campaign-${n}`;
  r.theme = n < 3 ? "palace" : n < 6 ? "garden" : n < 8 ? "mycelium" : n < 10 ? "furnace" : "drowned";
  r.abilities = Object.fromEntries(
    Object.keys(allAbilities()).map((k) => [
      k,
      unlocks.indexOf(k as Ability) < n,
    ]),
  ) as Room["abilities"];
  r.deathRule = n < 3 ? "instant" : "health";
  r.objects = [
    tile("solid", 0, 38, { w: 80, h: 6 }),
    tile("exit", 76, 37, { target: n === 11 ? "finish" : "next" }),
  ];
  return r;
}
function pit(r: Room, x: number, w: number) {
  const floors = r.objects.filter((o) => o.kind === "solid" && o.y === 38);
  r.objects = r.objects.filter((o) => !floors.includes(o));
  for (const f of floors) {
    if (x > f.x)
      r.objects.push(
        tile("solid", f.x, 38, { w: Math.min(f.w, x - f.x), h: 6 }),
      );
    if (x + w < f.x + f.w)
      r.objects.push(
        tile("solid", Math.max(x + w, f.x), 38, {
          w: f.x + f.w - Math.max(x + w, f.x),
          h: 6,
        }),
      );
  }
}
export function campaign(): Project {
  const rooms = chapters.map((_, n) => base(n));
  for (const [x, y, w] of [
    [10, 36, 5],
    [20, 34, 4],
    [30, 36, 5],
    [44, 35, 4],
    [56, 36, 5],
  ])
    rooms[0].objects.push(tile("solid", x, y, { w, h: 38 - y }));
  for (const x of [13, 35, 57]) pit(rooms[1], x, 8);
  for (const x of [15, 39, 62]) {
    rooms[2].objects.push(tile("solid", x, 31, { w: 2, h: 7 }));
    rooms[2].objects.push(tile("solid", x + 5, 28, { w: 2, h: 10 }));
  }
  for (const x of [14, 34, 56]) {
    pit(rooms[3], x, 9);
    rooms[3].objects.push(tile("crystal", x + 4, 33));
  }
  pit(rooms[4], 10, 53);
  for (const x of [13, 19, 25, 31, 37, 43, 49, 55, 61])
    rooms[4].objects.push(tile("pogo", x, 37));
  rooms[4].objects.push(tile("checkpoint", 65, 37));
  pit(rooms[5], 12, 22);
  pit(rooms[5], 44, 23);
  rooms[5].objects.push(tile("checkpoint", 38, 37));
  pit(rooms[6], 10, 58);
  for (const x of [15, 25, 35, 45, 55, 65])
    rooms[6].objects.push(tile("anchor", x, 32));
  pit(rooms[7], 12, 54);
  for (const x of [16, 26, 36, 46, 56, 65])
    rooms[7].objects.push(tile("anchor", x, 29, { anchorMode: "swing" }));
  for (const x of [23, 43, 63])
    rooms[7].objects.push(tile("solid", x, 37, { w: 3 }));
  pit(rooms[8], 12, 54);
  for (const x of [14, 24, 34, 44, 54, 64])
    rooms[8].objects.push(
      tile(x % 20 === 14 ? "moving" : "timed", x, 36, {
        w: 3,
        axis: "y",
        travel: 2,
        period: 3.5,
        phase: x / 30,
      }),
    );
  for (const x of [20, 45, 67]) {
    rooms[9].objects.push(
      tile("door", x, 28, { w: 2, h: 10, channel: String(x) }),
    );
    rooms[9].objects.push(tile("switch", x - 5, 37, { channel: String(x) }));
  }
  rooms[10].objects.push(
    tile("solid", 10, 26, { w: 55, h: 2 }),
    tile("gravity", 10, 31, { w: 2, h: 7 }),
    tile("gravity", 60, 28, { w: 2, h: 6 }),
  );
  for (const x of [22, 34, 46])
    rooms[10].objects.push(tile("spike", x, 37, { w: 4 }));
  pit(rooms[11], 8, 63);
  for (const x of [11, 19, 27, 35, 43, 51, 59, 67]) {
    rooms[11].objects.push(tile("pogo", x, 37));
    if (x % 3) rooms[11].objects.push(tile("anchor", x + 2, 30));
  }
  rooms[11].objects.push(
    tile("solid", 35, 36, { w: 2 }),
    tile("checkpoint", 35, 35),
  );
  for (const r of rooms) {
    r.objects.forEach((o, i) => (o.id = `${r.id}-${i}`));
  }
  return {
    format: "thornwake",
    schemaVersion: "1.2.0",
    name: "The silent palace",
    rooms,
    clears: [],
  };
}
