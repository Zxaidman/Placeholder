import Phaser from "phaser";
import LZString from "lz-string";
import { registerSW } from "virtual:pwa-register";
import {
  VERSION,
  PHYSICS_VERSION,
  COLS,
  ROWS,
  TILE,
  kinds,
  abilityNames,
  allAbilities,
  tile,
  blankRoom,
  blankProject,
  parseProject,
  projectDraftSchema,
  roomHash,
  safeName,
  type Project,
  type Room,
  type TileObject,
  type Kind,
  type Clear,
} from "./model";
import { campaign, chapters } from "./content";
import { TrialScene, type EditTool } from "./scene";
import { Controls, controlsSchema, defaults } from "./controls";
import { World, verifyClear } from "./physics";
import { save, load, download } from "./storage";
import type { Generated } from "./generator";
import "./style.css";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const app = $("app");
app.innerHTML = `<header><div class="brand">✦ THORNWAKE <small>v${VERSION}</small></div><nav><button id="campaign">Campaign</button><button id="endless">Endless</button><button id="creator" class="active">Creator</button><button id="guide">Guide</button><button id="settings">Settings</button><button id="install" hidden>Install</button><button id="fullscreen" aria-label="Fullscreen">⛶</button></nav></header>
<div class="toolbar" id="creatorToolbar"><input id="projectName" aria-label="Project name" maxlength="80"><select id="rooms" aria-label="Room"></select><button id="addRoom">＋ Room</button><button id="roomTools">Room tools</button><span class="spacer"></span><button id="undo" title="Undo">↶</button><button id="redo" title="Redo">↷</button><button id="projects">Projects</button><button id="save">Save</button><button id="import">Import</button><button id="export">Export</button><button id="share">Link</button><button id="play" class="primary">▶ Playtest</button></div>
<main><aside id="palette"><p class="eyebrow">CREATE A TRIAL</p><h1>The room is yours.</h1><div id="tools"></div><label><input type="checkbox" id="fineGrid"> Half-cell placement</label><label><input type="checkbox" id="multiSelect"> Add to selection</label><div class="smallrow"><button id="copy">Copy</button><button id="paste">Paste</button><button id="deleteObjects">Delete</button></div><label>Editor zoom<input id="editorZoom" type="range" min="1" max="5" step=".25" value="2"></label><div class="smallrow"><button id="fitRoom">Fit room</button><button id="focusSpawn">Focus spawn</button></div><section id="properties"></section><section class="room-options"><label>Room name<input id="roomName" maxlength="60"></label><label>Death rule<select id="deathRule"><option value="instant">Instant restart</option><option value="health">3 HP + checkpoints</option></select></label><label>Palette<select id="theme"><option value="palace">Silent palace</option><option value="garden">Hanging garden</option><option value="furnace">Ember halls</option></select></label><p class="eyebrow">MOVEMENT</p><div id="abilities"></div></section><p class="asset-credit">Kenney artwork · CC0<br>80 × 44 cells · 32 world units per cell</p></aside>
<section id="workspace"><div class="stage-bar"><span id="mode">CREATOR</span><span id="runStats">Drag to paint</span><span class="spacer"></span><label class="inline">Video <select id="ratio"><option value="full">Full</option><option value="16/9">16:9</option><option value="4/3">4:3</option></select></label><button id="controls">Controls</button><button id="home" hidden>Modes</button><button id="restart" hidden>Restart</button><button id="pause" hidden>Pause</button><button id="returnEditor" hidden>Editor</button></div><div id="surface"><div id="video"><div id="game"></div></div><div id="touch" hidden></div><div id="overlay" hidden><h2 id="overlayTitle">Paused</h2><p id="overlayText"></p><div id="overlayActions"></div></div><button id="doneControls" hidden>Done positioning</button></div><footer><span id="hint">Paint a route, place an exit, then play.</span><span id="clearState">UNVERIFIED</span></footer></section></main>
<div id="updateBanner" hidden><span>New version ready</span><button id="reviewUpdate">Update available</button></div><div id="toast" role="status"></div><dialog id="dialog"><button id="closeDialog">Close ✕</button><div id="dialogBody"></div></dialog><input type="file" id="file" accept=".json,application/json" hidden><div class="rotate"><span>⛶</span><h2>Turn your device sideways</h2><p>Thornwake is designed for landscape play.</p></div>`;
type Mode = "creator" | "campaign" | "endless";
let mode: Mode = "creator",
  project = campaign(),
  roomIndex = 0,
  playing = false,
  dirty = false,
  history: string[] = [],
  future: string[] = [],
  clipboard: TileObject[] = [],
  lastCell = { x: 5, y: 30 },
  hudTime = 0;
let campaignIndex = 0,
  campaignPractice = false,
  campaignData = campaign();
type Progress = {
  campaignUnlocked: number;
  campaignCleared: number[];
  endlessBest: number;
  endlessSeed: string;
  endlessIndex: number;
};
let progress: Progress = {
  campaignUnlocked: 0,
  campaignCleared: [],
  endlessBest: 0,
  endlessSeed: "first-root",
  endlessIndex: 0,
};
let prefs = { ratio: "full", zoom: 1.7, sound: true },
  endlessSeed = "first-root",
  endlessIndex = 0,
  endlessSurvival = false,
  endlessFrontier = 0;
const cache = new Map<number, Generated>();
let scene: TrialScene;
const labels: Record<string, string> = {
  solid: "Platform",
  spike: "Thorns",
  pogo: "Pogo target",
  enemy: "Moving enemy",
  crystal: "Air refill",
  checkpoint: "Checkpoint",
  exit: "Room exit",
  anchor: "Hook anchor",
  moving: "Moving platform",
  timed: "Fading platform",
  switch: "Switch",
  door: "Channel door",
  gravity: "Gravity field",
  pad: "Bounce pad",
  spawn: "Spawn",
  erase: "Erase",
  select: "Select / move",
  pan: "Pan view",
};
const icons: Record<string, string> = {
  solid: "▰",
  spike: "▲",
  pogo: "✺",
  enemy: "⊗",
  crystal: "◆",
  checkpoint: "⚑",
  exit: "▣",
  anchor: "◎",
  moving: "↔",
  timed: "▤",
  switch: "⌁",
  door: "▥",
  gravity: "⇅",
  pad: "⌃",
  spawn: "♟",
  erase: "⌫",
  select: "□",
  pan: "✥",
};
let toastTimeout: number;
function toast(message: string) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(
    () => $("toast").classList.remove("visible"),
    4500,
  );
}
function guard(action: () => Promise<unknown>) {
  return () =>
    void action().catch((e) =>
      toast(e instanceof Error ? e.message : "Operation failed"),
    );
}
const controls = new Controls($("touch"));
controls.onPause = () => {
  if (playing) pause();
};
controls.onLayout = () => {
  void save("controls-v1", controls.preset).catch(() =>
    toast("Could not save control layout"),
  );
};
let audio: AudioContext | undefined;
function sound(name: string) {
  if (!prefs.sound || !playing) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.value =
      (
        { jump: 360, pogo: 570, death: 95, dash: 220, refill: 790 } as Record<
          string,
          number
        >
      )[name] || 300;
    g.gain.setValueAtTime(0.045, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.09);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.1);
  } catch {
    /* Audio is optional on browsers that disallow autoplay. */
  }
}
const currentRoom = () =>
  mode === "creator"
    ? project.rooms[roomIndex]
    : mode === "campaign"
      ? campaignData.rooms[campaignIndex]
      : cache.get(endlessIndex)!.room;
function snapshot() {
  history.push(JSON.stringify(project));
  if (history.length > 60) history.shift();
  future = [];
  dirty = true;
  project.clears = [];
  $("clearState").textContent = "UNVERIFIED";
}
function refresh() {
  const r = project.rooms[roomIndex];
  $<HTMLInputElement>("projectName").value = project.name;
  const list = $<HTMLSelectElement>("rooms");
  list.replaceChildren(
    ...project.rooms.map((v, i) => new Option(v.name, String(i))),
  );
  list.value = String(roomIndex);
  $<HTMLInputElement>("roomName").value = r.name;
  $<HTMLSelectElement>("deathRule").value = r.deathRule;
  $<HTMLSelectElement>("theme").value = r.theme;
  for (const k of abilityNames)
    $<HTMLInputElement>("ability-" + k).checked = r.abilities[k];
  if (mode === "creator" && !playing) {
    scene?.setRoom(r, false);
    showProperties();
  }
  $("clearState").textContent = project.clears.some((c) => c.roomId === r.id)
    ? "CLEAR REPLAY SAVED"
    : "UNVERIFIED";
}
$("fineGrid").onchange = () => {
  scene.fineGrid = $<HTMLInputElement>("fineGrid").checked;
};
function paint(x: number, y: number, erase: boolean) {
  const r = project.rooms[roomIndex],
    tool = erase ? "erase" : scene.tool;
  lastCell = { x, y };
  if (tool === "spawn") {
    if (
      r.objects.some(
        (o) =>
          o.kind === "solid" &&
          x >= o.x &&
          x < o.x + o.w &&
          y >= o.y &&
          y < o.y + o.h,
      )
    )
      return;
    r.spawn = { x, y };
  } else {
    const hit = r.objects.find(
      (o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h,
    );
    if (tool === "erase") {
      if (hit) r.objects = r.objects.filter((o) => o.id !== hit.id);
    } else if (kinds.includes(tool as Kind)) {
      if (tool === "solid" && r.spawn.x === x && r.spawn.y === y) return;
      if (hit && hit.kind === tool) return;
      if (hit) r.objects = r.objects.filter((o) => o.id !== hit.id);
      r.objects.push(
        tile(tool as Kind, x, y, { travel: Math.min(4, COLS - x - 1) }),
      );
    }
  }
  scene.room = r;
  scene.rebuild();
}
function select(x: number, y: number, extend: boolean) {
  lastCell = { x, y };
  const hit = [...project.rooms[roomIndex].objects]
    .reverse()
    .find((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  if (
    !extend &&
    !$<HTMLInputElement>("multiSelect").checked &&
    (!hit || !scene.selected.has(hit.id))
  )
    scene.selected.clear();
  if (hit) {
    if (
      scene.selected.has(hit.id) &&
      (extend || $<HTMLInputElement>("multiSelect").checked)
    )
      scene.selected.delete(hit.id);
    else scene.selected.add(hit.id);
  }
  showProperties();
}
function moveSelection(dx: number, dy: number) {
  const selected = project.rooms[roomIndex].objects.filter((o) =>
    scene.selected.has(o.id),
  );
  if (!selected.length) return;
  if (
    selected.some(
      (o) =>
        o.x + dx < 0 ||
        o.y + dy < 0 ||
        o.x + o.w + dx > COLS ||
        o.y + o.h + dy > ROWS,
    )
  ) {
    toast("Selection would leave the room.");
    return;
  }
  snapshot();
  selected.forEach((o) => {
    o.x += dx;
    o.y += dy;
  });
  scene.rebuild();
  showProperties();
}
function hud(w: World) {
  if (performance.now() - hudTime < 120) return;
  hudTime = performance.now();
  $("runStats").textContent =
    `${w.room.deathRule === "health" ? "♥ " + w.health + " · " : ""}${w.deaths} deaths · ${(w.frames / 120).toFixed(1)}s`;
}
scene = new TrialScene({
  input: () => controls.read(),
  paint,
  begin: snapshot,
  select,
  moveSelection,
  event: (e, log) => void onEvent(e, log),
  sound,
  hud,
});
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 704,
  backgroundColor: "#101c24",
  pixelArt: true,
  render: { antialias: false },
  scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene,
});
scene.setRoom(project.rooms[0], false);
for (const tool of [
  ...kinds,
  "spawn",
  "erase",
  "select",
  "pan",
] as EditTool[]) {
  const b = document.createElement("button");
  b.dataset.tool = tool;
  b.innerHTML = `<span>${icons[tool]}</span>${labels[tool]}`;
  b.classList.toggle("selected", tool === "solid");
  b.onclick = () => {
    scene.tool = tool;
    document
      .querySelectorAll("[data-tool]")
      .forEach((el) =>
        el.classList.toggle(
          "selected",
          (el as HTMLElement).dataset.tool === tool,
        ),
      );
    $("hint").textContent =
      tool === "select"
        ? "Select an object; drag to move. Enable Add to selection for groups."
        : tool === "pan"
          ? "Drag the room to pan. Use the zoom slider for larger tiles."
          : `Paint ${labels[tool].toLowerCase()}. Select an object to edit its behavior.`;
  };
  $("tools").append(b);
}
for (const k of abilityNames) {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" id="ability-${k}">${({ doubleJump: "Double jump", wallJump: "Wall jump", longDash: "Long dash", grapple: "Clawline" } as Record<string, string>)[k] || k}`;
  $("abilities").append(l);
  $<HTMLInputElement>("ability-" + k).onchange = () => {
    snapshot();
    project.rooms[roomIndex].abilities[k] = $<HTMLInputElement>(
      "ability-" + k,
    ).checked;
  };
}
function showProperties() {
  const selected = project.rooms[roomIndex].objects.filter((o) =>
    scene?.selected.has(o.id),
  );
  $("properties").replaceChildren();
  if (!selected.length) return;
  const o = selected[0];
  const heading = document.createElement("p");
  heading.className = "eyebrow";
  heading.textContent = `${selected.length} SELECTED · ${labels[o.kind]}`;
  $("properties").append(heading);
  const fields: Record<
    string,
    { label: string; min?: number; max?: number; options?: string[] }
  > = {
    x: { label: "X (cells)", min: 0, max: COLS - o.w },
    y: { label: "Y (cells)", min: 0, max: ROWS - o.h },
    w: { label: "Width (cells)", min: 0.5, max: COLS - o.x },
    h: { label: "Height (cells)", min: 0.5, max: ROWS - o.y },
  };
  if (["moving", "enemy"].includes(o.kind))
    Object.assign(fields, {
      axis: { label: "Motion axis", options: ["x", "y"] },
      travel: { label: "Travel (cells)", min: 0, max: 20 },
      speed: { label: "Speed (units/s)", min: 10, max: 300 },
    });
  if (o.kind === "timed")
    Object.assign(fields, {
      period: { label: "Cycle (seconds)", min: 0.5, max: 12 },
      phase: { label: "Phase offset", min: 0, max: 12 },
    });
  if (["switch", "door"].includes(o.kind))
    fields.channel = { label: "Channel" };
  if (o.kind === "switch")
    fields.switchMode = { label: "Switch action", options: ["toggle", "hold"] };
  if (o.kind === "anchor")
    fields.anchorMode = { label: "Hook action", options: ["pull", "swing"] };
  if (o.kind === "pad")
    fields.direction = {
      label: "Launch direction",
      options: ["up", "down", "left", "right"],
    };
  if (o.kind === "exit")
    fields.target = {
      label: "Destination",
      options: [
        "next",
        "previous",
        "finish",
        ...project.rooms.map((r) => r.id),
      ],
    };
  for (const [key, f] of Object.entries(fields)) {
    const label = document.createElement("label");
    label.textContent = f.label;
    const input = f.options
      ? document.createElement("select")
      : document.createElement("input");
    if (input instanceof HTMLSelectElement)
      input.replaceChildren(
        ...f.options!.map(
          (v) =>
            new Option(project.rooms.find((r) => r.id === v)?.name || v, v),
        ),
      );
    else {
      input.type = f.min === undefined ? "text" : "number";
      input.maxLength = 30;
      if (f.min !== undefined) {
        input.min = String(f.min);
        input.max = String(f.max);
        input.step = ["x", "y", "w", "h"].includes(key) ? ".5" : ".1";
      }
    }
    input.value = String(o[key as keyof TileObject]);
    input.onchange = () => {
      snapshot();
      for (const target of selected) {
        let value: unknown =
          input instanceof HTMLInputElement && input.type === "number"
            ? Number(input.value)
            : input.value;
        if (typeof value === "number") {
          if (!Number.isFinite(value)) return;
          value = Math.max(f.min!, Math.min(f.max!, value));
          if (["x", "y", "w", "h"].includes(key))
            value = Math.round((value as number) * 2) / 2;
        }
        Object.assign(target, { [key]: value });
        target.w = Math.min(target.w, COLS - target.x);
        target.h = Math.min(target.h, ROWS - target.y);
        target.travel = Math.min(
          target.travel,
          target.axis === "x"
            ? COLS - target.x - target.w
            : ROWS - target.y - target.h,
        );
      }
      scene.rebuild();
      showProperties();
    };
    label.append(input);
    $("properties").append(label);
  }
}
function fitVideo() {
  const r = $("surface").getBoundingClientRect(),
    video = $("video"),
    value = prefs.ratio;
  if (value === "full") {
    video.style.width = "100%";
    video.style.height = "100%";
  } else {
    const [a, b] = value.split("/").map(Number),
      ratio = a / b,
      width = Math.min(r.width, r.height * ratio);
    video.style.width = width + "px";
    video.style.height = width / ratio + "px";
  }
  game.scale.resize(
    Math.max(1, video.clientWidth),
    Math.max(1, video.clientHeight),
  );
}
window.addEventListener("resize", () => requestAnimationFrame(fitVideo));
new ResizeObserver(() => requestAnimationFrame(fitVideo)).observe($("surface"));
$<HTMLSelectElement>("ratio").onchange = () => {
  prefs.ratio = $<HTMLSelectElement>("ratio").value;
  void save("preferences-v1", prefs);
  fitVideo();
};
function setPlaying(value: boolean) {
  playing = value;
  controls.enabled = value;
  controls.release();
  controls.apply();
  document.body.classList.toggle("playing", value);
  for (const id of ["restart", "pause", "home"]) $(id).hidden = !value;
  $("returnEditor").hidden = !(value && mode === "creator");
  $("clearState").hidden = mode !== "creator";
  $("overlay").hidden = true;
  $("mode").textContent = value
    ? `${mode.toUpperCase()} · ${currentRoom().name}`
    : "CREATOR · 80 × 44";
  $("hint").textContent = value
    ? "Move · Jump · Dash · Down + Attack = pogo · E / Hook = grapple"
    : "Choose a piece. Paint a path. Play your trial.";
  scene.playZoom = prefs.zoom;
  scene.setRoom(currentRoom(), value);
  requestAnimationFrame(fitVideo);
}
function overlay(
  title: string,
  text: string,
  actions: { label: string; run: () => void }[],
) {
  scene.paused = true;
  controls.release();
  $("overlayTitle").textContent = title;
  $("overlayText").textContent = text;
  $("overlayActions").replaceChildren(
    ...actions.map((a) => {
      const b = document.createElement("button");
      b.textContent = a.label;
      b.onclick = a.run;
      return b;
    }),
  );
  $("overlay").hidden = false;
}
function pause() {
  if (!playing) return;
  overlay("Paused", "Your trial will wait.", [
    {
      label: "Resume",
      run: () => {
        scene.paused = false;
        $("overlay").hidden = true;
      },
    },
    { label: "Restart room", run: restart },
    { label: "Modes", run: showModes },
  ]);
}
function restart() {
  scene.world.reset(true);
  scene.log = [];
  scene.recording = true;
  scene.paused = false;
  controls.release();
  $("overlay").hidden = true;
}
function showDialog(html: string) {
  if (playing) {
    scene.paused = true;
    controls.release();
  }
  $("dialogBody").innerHTML = html;
  $<HTMLDialogElement>("dialog").showModal();
}
$("closeDialog").onclick = () => {
  $<HTMLDialogElement>("dialog").close();
  if (playing && !$("overlay").hidden) scene.paused = true;
  else scene.paused = false;
};
$<HTMLDialogElement>("dialog").addEventListener("cancel", () => {
  if (playing && $("overlay").hidden) scene.paused = false;
});
$("play").onclick = () => {
  try {
    parseProject(JSON.stringify(project));
    mode = "creator";
    setPlaying(true);
  } catch (e) {
    toast(e instanceof Error ? e.message : "Invalid room");
  }
};
$("returnEditor").onclick = () => {
  mode = "creator";
  setPlaying(false);
  refresh();
};
$("pause").onclick = pause;
$("restart").onclick = restart;
$("home").onclick = showModes;
function showModes() {
  showDialog(
    '<h2>Choose your trial</h2><p>A handcrafted journey, an endless ascent, or a world of your own.</p><div class="cards"><button id="chooseCampaign">Campaign<br><small>12 authored trials · ability progression</small></button><button id="chooseEndless">Endless<br><small>Seeded geometry · certified routes</small></button><button id="chooseCreator">Creator<br><small>Build, connect, export and share</small></button></div>',
  );
  $("chooseCampaign").onclick = showCampaign;
  $("chooseEndless").onclick = showEndless;
  $("chooseCreator").onclick = () => {
    $<HTMLDialogElement>("dialog").close();
    mode = "creator";
    setPlaying(false);
    refresh();
  };
}
function showCampaign() {
  showDialog(
    '<p class="eyebrow">THE SILENT PALACE</p><h2>One skill at a time.</h2><label><input type="checkbox" id="practiceCampaign"> Practice: choose any trial with all abilities</label><div id="chapters" class="chapter-list"></div>',
  );
  const render = () => {
    $("chapters").replaceChildren(
      ...chapters.map(([name, tip], i) => {
        const b = document.createElement("button");
        b.textContent = `${String(i + 1).padStart(2, "0")} · ${name}${progress.campaignCleared.includes(i) ? " ✓" : ""}`;
        b.title = tip;
        b.disabled =
          i > progress.campaignUnlocked &&
          !$<HTMLInputElement>("practiceCampaign").checked;
        b.onclick = () => {
          campaignPractice = $<HTMLInputElement>("practiceCampaign").checked;
          campaignData = campaign();
          if (campaignPractice)
            campaignData.rooms.forEach((r) => (r.abilities = allAbilities()));
          mode = "campaign";
          campaignIndex = i;
          $<HTMLDialogElement>("dialog").close();
          setPlaying(true);
          toast(tip);
        };
        return b;
      }),
    );
  };
  $<HTMLInputElement>("practiceCampaign").onchange = render;
  render();
}
function showEndless() {
  showDialog(
    `<p class="eyebrow">BEYOND THE LAST ROOM</p><h2>The endless ascent</h2><p>New geometry from a seed. Difficulty climbs across 100 rooms, then stays at its ceiling. Recent rooms remain available for backtracking.</p><label>World seed<input id="seed" maxlength="80"></label><label>Run type<select id="runType"><option value="practice">Practice · unlimited checkpoint retries</option><option value="survival">Survival · run ends when 3 HP run out</option></select></label><label>Start room (practice only)<input type="number" id="startRoom" min="1" max="1000000" value="1"></label><button id="startEndless" class="primary">Begin ascent</button><button id="resumeEndless">Resume last practice room</button><p id="generationStatus"></p>`,
  );
  $<HTMLInputElement>("seed").value = progress.endlessSeed;
  $<HTMLSelectElement>("runType").onchange = () => {
    $<HTMLInputElement>("startRoom").disabled =
      $<HTMLSelectElement>("runType").value === "survival";
  };
  $("startEndless").onclick = guard(async () => {
    endlessSeed = $<HTMLInputElement>("seed").value.trim() || "first-root";
    endlessSurvival = $<HTMLSelectElement>("runType").value === "survival";
    endlessIndex = endlessSurvival
      ? 0
      : Math.max(
          0,
          Math.min(
            999999,
            Math.floor(Number($<HTMLInputElement>("startRoom").value) || 1) - 1,
          ),
        );
    cache.clear();
    endlessFrontier = endlessIndex;
    $("startEndless").setAttribute("disabled", "");
    $("generationStatus").textContent =
      "Generating geometry and replaying a route…";
    try {
      await openEndless(endlessIndex);
    } finally {
      $("startEndless")?.removeAttribute("disabled");
    }
  });
  $("resumeEndless").onclick = guard(async () => {
    endlessSeed = progress.endlessSeed;
    endlessSurvival = false;
    cache.clear();
    endlessFrontier = progress.endlessIndex;
    await openEndless(progress.endlessIndex);
  });
}
let worker: Worker | undefined,
  requestId = 0;
const pending = new Map<
  number,
  { resolve: (r: Generated) => void; reject: (e: Error) => void; timer: number }
>();
function generate(index: number): Promise<Generated> {
  const cached = cache.get(index);
  if (cached) return Promise.resolve(cached);
  worker ??= new Worker(new URL("./generator.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(e.data.id);
    if (e.data.error) p.reject(Error(e.data.error));
    else p.resolve(e.data.result);
  };
  worker.onerror = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("Generator worker failed. Try another seed."));
    }
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(Error("Generation exceeded 15 seconds. Try another seed."));
      worker?.terminate();
      worker = undefined;
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    worker!.postMessage({ id, seed: endlessSeed, index });
  });
}
async function openEndless(index: number, back = false, health = 3) {
  const result = await generate(index);
  cache.set(index, result);
  endlessFrontier = Math.max(endlessFrontier, index);
  for (const key of cache.keys())
    if (key < endlessFrontier - 3 || key > endlessFrontier + 1)
      cache.delete(key);
  endlessIndex = index;
  mode = "endless";
  const r = result.room;
  if (index > 0 && !r.objects.some((o) => o.target === "previous"))
    r.objects.push(tile("exit", 0, 35, { id: "back", target: "previous" }));
  if (!$<HTMLDialogElement>("dialog").open) {
  } else $<HTMLDialogElement>("dialog").close();
  setPlaying(true);
  scene.world.health = health;
  if (back) {
    const exit = r.objects.find(
      (o) => o.kind === "exit" && o.target !== "previous",
    )!;
    scene.world.player.x = exit.x * 32 + 6;
    scene.world.player.y = (exit.y + 1) * 32 - 28;
    scene.world.touching.add(exit.id);
  }
  progress.endlessBest = Math.max(progress.endlessBest, index + 1);
  if (!endlessSurvival) {
    progress.endlessSeed = endlessSeed;
    progress.endlessIndex = index;
  }
  void save("progress-v1", progress).catch(() =>
    toast("Progress could not be saved"),
  );
}
async function onEvent(
  event: { type: string; target?: string; exhausted?: boolean },
  log: [number, number][],
) {
  if (event.type === "death") {
    if (mode === "endless" && endlessSurvival && scene.world.exhausted)
      overlay("The ascent ends", `You reached room ${endlessIndex + 1}.`, [
        {
          label: "New run",
          run: () => {
            endlessFrontier = 0;
            cache.clear();
            void openEndless(0);
          },
        },
        { label: "Choose mode", run: showModes },
      ]);
    return;
  }
  if (event.type !== "exit") return;
  if (mode === "endless") {
    const next =
      event.target === "previous" ? endlessIndex - 1 : endlessIndex + 1;
    if (next < 0 || next < endlessFrontier - 3) {
      overlay(
        "The passage has closed",
        "Only the most recent rooms remain accessible.",
        [
          {
            label: "Resume",
            run: () => {
              scene.paused = false;
              $("overlay").hidden = true;
            },
          },
        ],
      );
      return;
    }
    overlay(
      "Opening the next room",
      "Generating geometry and checking a route…",
      [],
    );
    try {
      await openEndless(next, event.target === "previous", scene.world.health);
    } catch (e) {
      overlay("Generation paused", String(e), [
        { label: "Choose another seed", run: showEndless },
        { label: "Retry", run: () => void onEvent(event, log) },
      ]);
    }
    return;
  }
  const data = mode === "campaign" ? campaignData : project,
    index = mode === "campaign" ? campaignIndex : roomIndex,
    r = data.rooms[index];
  if (mode === "creator" && scene.recording) {
    const clear: Clear = {
      roomId: r.id,
      physicsVersion: PHYSICS_VERSION,
      roomHash: await roomHash(r),
      inputs: structuredClone(log),
    };
    data.clears = data.clears.filter((c) => c.roomId !== r.id);
    data.clears.push(clear);
    dirty = true;
    $("clearState").textContent = "CLEAR REPLAY SAVED";
  }
  if (mode === "campaign" && !campaignPractice) {
    if (!progress.campaignCleared.includes(index))
      progress.campaignCleared.push(index);
    progress.campaignUnlocked = Math.min(
      chapters.length - 1,
      Math.max(progress.campaignUnlocked, index + 1),
    );
    void save("progress-v1", progress);
  }
  const target = event.target || "next";
  const next =
    target === "finish"
      ? -1
      : target === "previous"
        ? index - 1
        : target === "next"
          ? index + 1
          : data.rooms.findIndex((v) => v.id === target);
  if (next >= 0 && next < data.rooms.length) {
    if (mode === "campaign") campaignIndex = next;
    else roomIndex = next;
    setPlaying(true);
    if (mode === "campaign") toast(chapters[next][1]);
  } else
    overlay(
      "Trial complete",
      mode === "campaign"
        ? "The silent palace remembers your steps."
        : "Your clear replay is attached to this project. Export it to share the evidence.",
      [
        { label: "Play again", run: restart },
        { label: "Choose mode", run: showModes },
        ...(mode === "creator"
          ? [
              {
                label: "Back to creator",
                run: () => {
                  setPlaying(false);
                  refresh();
                },
              },
            ]
          : []),
      ],
    );
}
$("campaign").onclick = showCampaign;
$("endless").onclick = showEndless;
$("creator").onclick = () => {
  mode = "creator";
  setPlaying(false);
  refresh();
};
$<HTMLInputElement>("projectName").onchange = () => {
  snapshot();
  project.name =
    $<HTMLInputElement>("projectName").value.trim() || "Untitled project";
};
$<HTMLSelectElement>("rooms").onchange = () => {
  roomIndex = Number($<HTMLSelectElement>("rooms").value);
  scene.selected.clear();
  refresh();
};
$("addRoom").onclick = () => {
  if (project.rooms.length >= 100) {
    toast("Limit: 100 rooms per project.");
    return;
  }
  snapshot();
  project.rooms.push(blankRoom(`Trial ${project.rooms.length + 1}`));
  roomIndex = project.rooms.length - 1;
  refresh();
};
$("roomTools").onclick = () => {
  showDialog(
    '<h2>Room tools</h2><button id="duplicateRoom">Duplicate room</button><button id="roomUp">Move earlier</button><button id="roomDown">Move later</button><button id="deleteRoom">Delete room</button><p>Named exit links follow room IDs. “Next” and “Previous” follow list order.</p>',
  );
  $("duplicateRoom").onclick = () => {
    snapshot();
    const r = structuredClone(project.rooms[roomIndex]);
    r.id = crypto.randomUUID();
    r.name = (r.name + " copy").slice(0, 60);
    r.objects.forEach((o) => (o.id = crypto.randomUUID()));
    project.rooms.splice(roomIndex + 1, 0, r);
    roomIndex++;
    refresh();
    $<HTMLDialogElement>("dialog").close();
  };
  for (const [id, delta] of [
    ["roomUp", -1],
    ["roomDown", 1],
  ] as const)
    $(id).onclick = () => {
      const j = roomIndex + delta;
      if (j < 0 || j >= project.rooms.length) return;
      snapshot();
      [project.rooms[j], project.rooms[roomIndex]] = [
        project.rooms[roomIndex],
        project.rooms[j],
      ];
      roomIndex = j;
      refresh();
    };
  $("deleteRoom").onclick = () => {
    if (project.rooms.length === 1) {
      toast("Keep at least one room.");
      return;
    }
    const id = project.rooms[roomIndex].id;
    if (project.rooms.some((r) => r.objects.some((o) => o.target === id))) {
      toast("Change exits pointing to this room before deleting it.");
      return;
    }
    snapshot();
    project.rooms.splice(roomIndex, 1);
    roomIndex = Math.min(roomIndex, project.rooms.length - 1);
    refresh();
    $<HTMLDialogElement>("dialog").close();
  };
};
$("undo").onclick = () => {
  if (!history.length) return;
  future.push(JSON.stringify(project));
  project = parseProject(history.pop()!, true);
  roomIndex = Math.min(roomIndex, project.rooms.length - 1);
  dirty = true;
  scene.selected.clear();
  refresh();
};
$("redo").onclick = () => {
  if (!future.length) return;
  history.push(JSON.stringify(project));
  project = parseProject(future.pop()!, true);
  roomIndex = Math.min(roomIndex, project.rooms.length - 1);
  dirty = true;
  refresh();
};
$("copy").onclick = () => {
  clipboard = structuredClone(
    project.rooms[roomIndex].objects.filter((o) => scene.selected.has(o.id)),
  );
  toast(`${clipboard.length} objects copied`);
};
$("paste").onclick = () => {
  if (!clipboard.length) return;
  snapshot();
  const minX = Math.min(...clipboard.map((o) => o.x)),
    minY = Math.min(...clipboard.map((o) => o.y));
  scene.selected.clear();
  for (const o of clipboard) {
    const clone = {
      ...o,
      id: crypto.randomUUID(),
      x: Math.min(COLS - o.w, lastCell.x + o.x - minX),
      y: Math.min(ROWS - o.h, lastCell.y + o.y - minY),
    };
    project.rooms[roomIndex].objects.push(clone);
    scene.selected.add(clone.id);
  }
  scene.rebuild();
  showProperties();
};
$("deleteObjects").onclick = () => {
  snapshot();
  project.rooms[roomIndex].objects = project.rooms[roomIndex].objects.filter(
    (o) => !scene.selected.has(o.id),
  );
  scene.selected.clear();
  scene.room = project.rooms[roomIndex];
  scene.rebuild();
  showProperties();
};
$<HTMLInputElement>("editorZoom").oninput = () =>
  (scene.editZoom = Number($<HTMLInputElement>("editorZoom").value));
$("fitRoom").onclick = () => {
  scene.editZoom = 1;
  scene.panX = COLS * 16;
  scene.panY = ROWS * 16;
  $<HTMLInputElement>("editorZoom").value = "1";
};
$("focusSpawn").onclick = () => {
  scene.editZoom = 3;
  scene.panX = project.rooms[roomIndex].spawn.x * 32;
  scene.panY = project.rooms[roomIndex].spawn.y * 32;
  $<HTMLInputElement>("editorZoom").value = "3";
};
for (const id of ["roomName", "deathRule", "theme"])
  $(id).onchange = () => {
    snapshot();
    const r = project.rooms[roomIndex];
    if (id === "roomName")
      r.name = $<HTMLInputElement>(id).value.trim() || "Untitled trial";
    else if (id === "deathRule")
      r.deathRule = $<HTMLSelectElement>(id).value as Room["deathRule"];
    else r.theme = $<HTMLSelectElement>(id).value as Room["theme"];
    refresh();
  };
type SavedProject = { id: string; project: Project };
let library: SavedProject[] = [],
  activeProjectId: string = crypto.randomUUID();
async function saveProject() {
  projectDraftSchema.parse(project);
  if (library.length >= 30 && !library.some((p) => p.id === activeProjectId))
    throw Error(
      "Maximum 30 saved projects. Export a backup before removing a project.",
    );
  const entry = { id: activeProjectId, project: structuredClone(project) };
  library = library.filter((p) => p.id !== entry.id);
  library.push(entry);
  await save("projects-v1", library);
  await save("active-project-v1", activeProjectId);
  dirty = false;
  toast("Project saved on this device. Export a backup for safekeeping.");
}
$("save").onclick = guard(saveProject);
$("projects").onclick = () => {
  showDialog(
    '<h2>Your projects</h2><button id="newProject">New empty project</button><button id="campaignCopy">Copy campaign to creator</button><div id="projectList"></div><button id="backup">Download full backup</button><label>Restore backup<input id="restoreBackup" type="file" accept=".json"></label><p>Projects stay in this browser. Backups include projects, progress and control textures.</p>',
  );
  $("projectList").replaceChildren(
    ...library.map((entry) => {
      const row = document.createElement("button");
      row.textContent = entry.project.name;
      row.onclick = () => {
        snapshot();
        project = structuredClone(entry.project);
        activeProjectId = entry.id;
        roomIndex = 0;
        refresh();
        $<HTMLDialogElement>("dialog").close();
      };
      const wrapper = document.createElement("div");
      const remove = document.createElement("button");
      remove.textContent = "Remove saved copy";
      remove.onclick = guard(async () => {
        library = library.filter((p) => p.id !== entry.id);
        await save("projects-v1", library);
        wrapper.remove();
        toast("Saved copy removed. The currently open draft is unchanged.");
      });
      wrapper.append(row, remove);
      return wrapper;
    }),
  );
  $("newProject").onclick = () => {
    snapshot();
    project = blankProject();
    activeProjectId = crypto.randomUUID();
    roomIndex = 0;
    refresh();
    $<HTMLDialogElement>("dialog").close();
  };
  $("campaignCopy").onclick = () => {
    snapshot();
    project = campaign();
    activeProjectId = crypto.randomUUID();
    roomIndex = 0;
    refresh();
    $<HTMLDialogElement>("dialog").close();
  };
  $("backup").onclick = () => {
    const projects = library.filter((p) => p.id !== activeProjectId);
    projects.push({ id: activeProjectId, project });
    if (projects.length > 30) {
      toast("Remove a saved copy before backing up another project.");
      return;
    }
    download(
      "thornwake-backup.json",
      JSON.stringify({
        format: "thornwake-backup",
        version: "1.0.0",
        projects,
        progress,
        controls: controls.preset,
        preferences: prefs,
      }),
    );
  };
  $<HTMLInputElement>("restoreBackup").onchange = guard(async () => {
    const f = $<HTMLInputElement>("restoreBackup").files?.[0];
    if (!f) return;
    if (f.size > 15_000_000) throw Error("Backup exceeds 15 MB");
    const b = JSON.parse(await f.text());
    if (
      b.format !== "thornwake-backup" ||
      b.version !== "1.0.0" ||
      !Array.isArray(b.projects) ||
      b.projects.length > 30
    )
      throw Error("Invalid backup");
    const next = b.projects.map((e: any) => ({
      id: crypto.randomUUID(),
      project: parseProject(JSON.stringify(e.project), true),
    }));
    const cp = controlsSchema.parse(b.controls);
    const pr = validateProgress(b.progress);
    snapshot();
    library = next;
    project = next[0]?.project || blankProject();
    activeProjectId = next[0]?.id || crypto.randomUUID();
    roomIndex = 0;
    progress = pr;
    prefs = validatePreferences(b.preferences);
    $<HTMLSelectElement>("ratio").value = prefs.ratio;
    scene.playZoom = prefs.zoom;
    await save("preferences-v1", prefs);
    fitVideo();
    controls.preset = cp;
    controls.apply();
    await saveProject();
    await save("progress-v1", progress);
    await save("controls-v1", cp);
    refresh();
    toast("Backup restored. Undo can recover the previously open project.");
  });
};
$("export").onclick = () => {
  try {
    parseProject(JSON.stringify(project));
    download(
      safeName(project.name) + ".json",
      JSON.stringify(project, null, 2),
    );
    toast("Exported with any recorded clear evidence.");
  } catch {
    toast(
      "Fix room exits, spawn or out-of-bounds objects before publishing. Save can keep unfinished drafts.",
    );
  }
};
$("import").onclick = () => {
  $<HTMLInputElement>("file").value = "";
  $<HTMLInputElement>("file").click();
};
$<HTMLInputElement>("file").onchange = guard(async () => {
  const f = $<HTMLInputElement>("file").files?.[0];
  if (!f) return;
  if (f.size > 5_000_000) throw Error("Project exceeds 5 MB");
  const next = parseProject(await f.text());
  snapshot();
  project = next;
  activeProjectId = crypto.randomUUID();
  roomIndex = 0;
  refresh();
  toast("Imported. Clear evidence is untrusted until replayed.");
  if (project.clears.length) offerVerification();
});
function offerVerification() {
  showDialog(
    '<h2>Check clear evidence</h2><p>Replays can demonstrate a clear with this physics version. They are not tamper-proof certification.</p><button id="verifyClears">Replay imported clears</button><p id="verifyResult"></p>',
  );
  $("verifyClears").onclick = guard(async () => {
    $("verifyClears").setAttribute("disabled", "");
    let passed = 0;
    for (const c of project.clears) {
      const r = project.rooms.find((r) => r.id === c.roomId);
      if (r && (await verifyClear(r, c))) passed++;
    }
    $("verifyResult").textContent =
      `${passed} of ${project.clears.length} replays reached an exit with matching room data and physics.`;
  });
}
$("share").onclick = guard(async () => {
  parseProject(JSON.stringify(project));
  const share = { ...project, clears: [] },
    encoded = LZString.compressToEncodedURIComponent(JSON.stringify(share));
  const link = `${location.origin}${location.pathname}#level=${encoded}`;
  if (link.length > 8000)
    throw Error("Project too large for a link. Export a JSON file instead.");
  try {
    await navigator.clipboard.writeText(link);
    toast(
      "Level link copied. Large clear replays are included only in file exports.",
    );
  } catch {
    showDialog(
      '<h2>Copy level link</h2><textarea id="shareLink" readonly></textarea>',
    );
    $<HTMLTextAreaElement>("shareLink").value = link;
  }
});
function settings() {
  showDialog(
    `<h2>Play your way</h2><label>Game zoom<input id="gameZoom" type="range" min="1" max="2.5" step=".1" value="${prefs.zoom}"></label><label><input id="sound" type="checkbox" ${prefs.sound ? "checked" : ""}> Sound effects</label><button id="editControls">Touch controls</button><button id="verifyCurrent">Check clear replays</button><p>Video aspect ratio changes only the game image. Touch controls always use the full play surface, including side bars.</p><p>Version ${VERSION} · physics ${PHYSICS_VERSION}</p>`,
  );
  $<HTMLInputElement>("gameZoom").oninput = () => {
    prefs.zoom = Number($<HTMLInputElement>("gameZoom").value);
    scene.playZoom = prefs.zoom;
    void save("preferences-v1", prefs);
  };
  $<HTMLInputElement>("sound").onchange = () => {
    prefs.sound = $<HTMLInputElement>("sound").checked;
    void save("preferences-v1", prefs);
  };
  $("editControls").onclick = controlSettings;
  $("verifyCurrent").onclick = offerVerification;
}
function controlSettings() {
  showDialog(
    `<h2>Touch controls</h2><label>Movement<select id="controlMode"><option value="joystick">Fixed joystick</option><option value="buttons">Directional buttons</option></select></label><label>Size<input id="controlSize" type="range" min=".6" max="1.5" step=".05" value="${controls.preset.scale}"></label><label>Opacity<input id="controlOpacity" type="range" min=".2" max="1" step=".05" value="${controls.preset.opacity}"></label><button id="reposition">Drag controls into position</button><button id="saveControls">Save layout</button><button id="exportControls">Export layout</button><label>Import layout<input id="importControls" type="file" accept=".json"></label><label>Texture target<select id="textureTarget">${Object.keys(
      defaults().positions,
    )
      .map((k) => `<option>${k}</option>`)
      .join(
        "",
      )}</select></label><label>Custom PNG (256 KB, up to 1024 × 1024)<input id="texture" type="file" accept="image/png"></label><button id="resetControls">Reset layout</button>`,
  );
  $<HTMLSelectElement>("controlMode").value = controls.preset.mode;
  $<HTMLSelectElement>("controlMode").onchange = () => {
    controls.preset.mode = $<HTMLSelectElement>("controlMode").value as
      "joystick" | "buttons";
    controls.apply();
  };
  for (const [id, key] of [
    ["controlSize", "scale"],
    ["controlOpacity", "opacity"],
  ] as const)
    $<HTMLInputElement>(id).oninput = () => {
      controls.preset[key] = Number($<HTMLInputElement>(id).value);
      controls.apply();
    };
  $("reposition").onclick = () => {
    $<HTMLDialogElement>("dialog").close();
    controls.editing = true;
    controls.apply();
    $("doneControls").hidden = false;
  };
  $("saveControls").onclick = guard(async () => {
    await save("controls-v1", controls.preset);
    toast("Layout saved");
  });
  $("exportControls").onclick = () =>
    download("thornwake-controls.json", JSON.stringify(controls.preset));
  $<HTMLInputElement>("importControls").onchange = guard(async () => {
    const f = $<HTMLInputElement>("importControls").files?.[0];
    if (!f) return;
    if (f.size > 3_000_000) throw Error("Layout file too large");
    controls.preset = controlsSchema.parse(JSON.parse(await f.text()));
    controls.apply();
    await save("controls-v1", controls.preset);
  });
  $<HTMLInputElement>("texture").onchange = guard(async () => {
    const f = $<HTMLInputElement>("texture").files?.[0];
    if (!f) return;
    if (f.type !== "image/png" || f.size > 256000)
      throw Error("Choose a PNG under 256 KB");
    const bitmap = await createImageBitmap(f);
    const valid = bitmap.width <= 1024 && bitmap.height <= 1024;
    bitmap.close();
    if (!valid) throw Error("Maximum texture dimensions are 1024 × 1024");
    const target = $<HTMLSelectElement>("textureTarget").value;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(Error("Could not read texture"));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(f);
    });
    controls.preset.positions[target].texture = data;
    controls.apply();
    await save("controls-v1", controls.preset);
  });
  $("resetControls").onclick = () => {
    controls.preset = defaults();
    controls.apply();
  };
}
$("doneControls").onclick = guard(async () => {
  controls.editing = false;
  controls.apply();
  $("doneControls").hidden = true;
  await save("controls-v1", controls.preset);
  if (playing) pause();
});
$("settings").onclick = settings;
$("controls").onclick = controlSettings;
$("guide").onclick = () =>
  showDialog(
    `<p class="eyebrow">FIELD NOTES · ${VERSION}</p><h2>Master the palace</h2><p><b>Move:</b> A/D or arrows. <b>Jump:</b> Space/W/Up, hold for height. <b>Dash:</b> Shift/K. <b>Pogo:</b> hold Down/S and press J/X. <b>Hook:</b> E.</p><p><b>Long dash:</b> hold Down + Dash on the ground until charged, then release Dash. <b>Clawline:</b> tap Hook at a cyan anchor. <b>Swing:</b> hold Hook at a cream anchor; release to launch.</p><p>Touch controls mirror these actions. Pull the joystick down for pogo/charging. Downward attacks also bounce on pink thorns and moving enemies. Cyan crystals restore air abilities.</p><p>Violet fields flip gravity on entry. Switches and doors with matching channel names are connected. Moving platforms carry you; fading platforms are solid for 65% of each cycle.</p><p>Creator: paint cells; use Select/move to edit object dimensions and properties. Shift-click or Add to selection builds groups. Copy/paste places groups at the last selected cell. Pan and zoom let you work on the larger 80 × 44 grid.</p><p>Endless rooms use generated geometry and a simulated clear route. Difficulty reaches a ceiling at room 100; route proof is not a guarantee of human difficulty or phone performance. Recent rooms can be revisited using the left portal.</p><p>Clear replays are local evidence, not anti-cheat certification. Export backups; browser storage can be cleared or evicted.</p><p>Art: <a href="https://kenney.nl/assets/1-bit-platformer-pack" target="_blank" rel="noopener">Kenney · CC0</a>. Sound effects are synthesized locally. No accounts or external assets are required during play.</p>`,
  );
$("fullscreen").onclick = guard(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (document.documentElement.requestFullscreen)
    await document.documentElement.requestFullscreen();
  else toast("Fullscreen is not available in this browser.");
});
let installEvent: Event & { prompt?: () => Promise<void> };
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("install").hidden = false;
});
$("install").onclick = guard(async () => await installEvent?.prompt?.());
const updateSW = registerSW({
  onNeedRefresh() {
    $("updateBanner").hidden = false;
  },
  onOfflineReady() {
    toast("Ready for offline play.");
  },
  onRegisteredSW(_url, r) {
    if (!r) return;
    const check = () => {
      if (navigator.onLine && !document.hidden) void r.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    window.setInterval(check, 3600000);
  },
});
$("reviewUpdate").onclick = () => {
  showDialog(
    '<h2>Update Thornwake?</h2><p>Your editor draft, control settings and saved progress will be preserved. The current playtest ends.</p><button id="applyUpdate" class="primary">Preserve draft & update</button>',
  );
  $("applyUpdate").onclick = guard(async () => {
    sessionStorage.setItem(
      "thornwake-update-draft",
      JSON.stringify({
        project,
        roomIndex,
        activeProjectId,
        hash: location.hash,
      }),
    );
    await save("controls-v1", controls.preset);
    await save("progress-v1", progress);
    dirty = false;
    await updateSW(true);
  });
};
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function validatePreferences(raw: any) {
  return {
    ratio: ["full", "16/9", "4/3"].includes(raw?.ratio) ? raw.ratio : "full",
    zoom: Math.max(1, Math.min(2.5, Number(raw?.zoom) || 1.7)),
    sound: raw?.sound !== false,
  };
}
function validateProgress(raw: any): Progress {
  return {
    campaignUnlocked: Math.max(
      0,
      Math.min(11, Number(raw?.campaignUnlocked) || 0),
    ),
    campaignCleared: Array.isArray(raw?.campaignCleared)
      ? raw.campaignCleared.filter(
          (v: unknown) =>
            Number.isInteger(v) && Number(v) >= 0 && Number(v) < 12,
        )
      : [],
    endlessBest: Math.max(0, Math.min(1000000, Number(raw?.endlessBest) || 0)),
    endlessSeed:
      typeof raw?.endlessSeed === "string"
        ? raw.endlessSeed.slice(0, 80)
        : "first-root",
    endlessIndex: Math.max(
      0,
      Math.min(999999, Math.floor(Number(raw?.endlessIndex) || 0)),
    ),
  };
}
void (async () => {
  try {
    const saved = await load<SavedProject[]>("projects-v1");
    if (saved) {
      library = saved.map((e) => ({
        id: e.id,
        project: parseProject(JSON.stringify(e.project), true),
      }));
      activeProjectId =
        (await load<string>("active-project-v1")) ||
        library[0]?.id ||
        activeProjectId;
      project = structuredClone(
        library.find((e) => e.id === activeProjectId)?.project ||
          library[0]?.project ||
          project,
      );
    } else {
      const old = await load("project");
      if (old) project = parseProject(JSON.stringify(old), true);
    }
    const draftText = sessionStorage.getItem("thornwake-update-draft");
    if (draftText) {
      const d = JSON.parse(draftText);
      if (d.hash === location.hash) {
        project = parseProject(JSON.stringify(d.project), true);
        if (typeof d.activeProjectId === "string")
          activeProjectId = d.activeProjectId;
        roomIndex = Math.max(
          0,
          Math.min(
            project.rooms.length - 1,
            Math.floor(Number(d.roomIndex) || 0),
          ),
        );
        dirty = true;
        sessionStorage.removeItem("thornwake-update-draft");
        toast(
          "Update complete. Your editor draft was restored; Save to keep it.",
        );
      }
    } else if (location.hash.startsWith("#level=")) {
      if (location.hash.length > 8000) throw Error("Shared link is too large");
      const decoded = LZString.decompressFromEncodedURIComponent(
        location.hash.slice(7),
      );
      if (!decoded) throw Error("Invalid shared level");
      project = parseProject(decoded);
      activeProjectId = crypto.randomUUID();
      dirty = true;
    }
    const control = await load("controls-v1");
    if (control) controls.preset = controlsSchema.parse(control);
    else {
      const old = await load<any>("controls");
      if (old) {
        const migrated = defaults();
        for (const key of ["mode", "scale", "opacity"] as const)
          if (old[key] !== undefined)
            Object.assign(migrated, { [key]: old[key] });
        for (const [key, pos] of Object.entries(migrated.positions)) {
          const source = old.positions?.[key];
          if (!source) continue;
          if (/^[0-9.]+%$/.test(source.left))
            pos.x = Math.min(95, parseFloat(source.left));
          if (/^[0-9.]+%$/.test(source.top))
            pos.y = Math.min(90, parseFloat(source.top));
          const texture =
            /^url\("(data:image\/png;base64,[A-Za-z0-9+/=]+)"\)$/.exec(
              source.texture || "",
            );
          if (texture && texture[1].length <= 360000) pos.texture = texture[1];
        }
        controls.preset = controlsSchema.parse(migrated);
      }
    }
    controls.apply();
    progress = validateProgress(await load("progress-v1"));
    const settings = await load<typeof prefs>("preferences-v1");
    if (settings) {
      prefs = validatePreferences(settings);
    }
    $<HTMLSelectElement>("ratio").value = prefs.ratio;
    scene.playZoom = prefs.zoom;
    refresh();
    fitVideo();
  } catch (e) {
    toast(e instanceof Error ? e.message : "Could not restore local data");
    refresh();
  }
})();
refresh();
