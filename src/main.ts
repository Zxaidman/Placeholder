import Phaser from "phaser";
import LZString from "lz-string";
import { registerSW } from "virtual:pwa-register";
import {
  COLS,
  ROWS,
  TILE,
  kinds,
  blankRoom,
  demoProject,
  parseProject,
  type Project,
  type Kind,
} from "./model";
import { emptyInput, spawn, step, STEP, HEIGHT, type Input } from "./physics";
import { save, load, download } from "./storage";
import "./style.css";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const app = $("app");
app.innerHTML = `<header><div class="brand"><span class="sigil">✦</span> THORNWAKE <small>0.1.0 / CREATOR</small></div><nav><button id="help">Guide</button><button id="settings">Controls</button><button id="fullscreen" title="Fullscreen">⛶</button><button id="install" hidden>Install</button></nav></header>
<section class="toolbar"><input id="projectName" aria-label="Project name" maxlength="80"><select id="rooms" aria-label="Room"></select><button id="addRoom">＋ Room</button><span class="divider"></span><button id="undo" title="Undo">↶</button><button id="redo" title="Redo">↷</button><button id="save">Save</button><button id="import">Import</button><button id="export">Export</button><button id="share">Link</button><button id="play" class="primary">▶ Playtest</button></section>
<main><aside id="palette"><p class="eyebrow">BUILD YOUR TRIAL</p><h1>The room is yours.</h1><p class="subtle">Choose a piece. Paint a path.<br>Then see if you can survive it.</p><div id="tools"></div><div class="room-options"><label>Room name<input id="roomName" maxlength="60"></label><label>Death rule<select id="deathRule"><option value="instant">Instant · restart room</option><option value="health">Health · checkpoint / 3 HP</option></select></label><p class="eyebrow">AVAILABLE MOVEMENT</p><div id="abilities"></div></div><p class="asset-credit">Art by Kenney · CC0<br>Precision trials, made by you.</p></aside>
<section id="workspace"><div class="stage-bar"><span id="mode">CREATOR / 40 × 22</span><span id="runStats">Grid snapped · drag to paint</span><select id="ratio" aria-label="Viewport aspect ratio"><option value="full">Full</option><option value="16/9">16:9</option><option value="4/3">4:3</option></select></div><div id="stage"><div id="game"></div><div id="touch"><div id="stick" class="control"><span></span></div><button id="left" class="control direction">◀</button><button id="right" class="control direction">▶</button><button id="down" class="control direction">▼</button><button id="attack" class="control">Attack</button><button id="dash" class="control">Dash</button><button id="jump" class="control">Jump</button></div><div id="pauseOverlay" hidden><h2>Paused</h2><button id="resume">Resume trial</button></div></div><footer><span id="hint">Place platforms, hazards, and an exit. Drag to paint.</span><button id="restart" hidden>Restart</button><button id="pause" hidden>Pause</button><span id="clearState">UNVERIFIED</span></footer></section></main><div id="toast" role="status"></div><input type="file" id="file" accept=".json,application/json" hidden>
<dialog id="dialog"><button id="closeDialog" class="close">Close ✕</button><div id="dialogBody"></div></dialog><div class="rotate"><span>⛶</span><h2>Turn your device sideways</h2><p>Thornwake is designed for landscape play.</p></div>`;
let project = demoProject(),
  roomIndex = 0,
  playing = false,
  paused = false,
  selected: Kind | "spawn" | "erase" = "solid";
let history: string[] = [],
  future: string[] = [],
  scene: TrialScene,
  dirty = false,
  verified = new Set<string>();
let touchInput = emptyInput();
let deaths = 0,
  health = 3,
  elapsed = 0,
  checkpoint: { x: number; y: number } | null = null;
let controlMode = "joystick",
  editingControls = false;
let controlScale = 1,
  controlOpacity = 0.75;
const labels: Record<string, string> = {
  solid: "Platform",
  spike: "Thorns · pogoable",
  pogo: "Pogo target",
  crystal: "Air refill",
  checkpoint: "Checkpoint",
  exit: "Exit → next room",
  spawn: "Spawn point",
  erase: "Erase",
};
const icons: Record<string, string> = {
  solid: "▰",
  spike: "▲",
  pogo: "✺",
  crystal: "◆",
  checkpoint: "⚑",
  exit: "▣",
  spawn: "♟",
  erase: "⌫",
};
const room = () => project.rooms[roomIndex];
let toastTimer: number;
function toast(s: string) {
  $("toast").textContent = s;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(
    () => $("toast").classList.remove("visible"),
    4000,
  );
}
function guard(fn: () => Promise<unknown>) {
  return () =>
    void fn().catch((e) =>
      toast(e instanceof Error ? e.message : "Operation failed"),
    );
}
function snapshot() {
  history.push(JSON.stringify(project));
  if (history.length > 60) history.shift();
  future = [];
  dirty = true;
  verified.clear();
  $("clearState").textContent = "UNVERIFIED";
}
function refresh() {
  const select = $<HTMLSelectElement>("rooms");
  select.replaceChildren(
    ...project.rooms.map((r, i) => new Option(r.name, String(i))),
  );
  select.value = String(roomIndex);
  $<HTMLInputElement>("projectName").value = project.name;
  $<HTMLInputElement>("roomName").value = room().name;
  $<HTMLSelectElement>("deathRule").value = room().deathRule;
  for (const [key, value] of Object.entries(room().abilities))
    $<HTMLInputElement>("ability-" + key).checked = value;
  scene?.rebuild();
  $("clearState").textContent = verified.has(room().id)
    ? "LOCAL CLEAR"
    : "UNVERIFIED";
}
for (const tool of [...kinds, "spawn", "erase"] as const) {
  const b = document.createElement("button");
  b.innerHTML = `<span>${icons[tool]}</span>${labels[tool]}`;
  b.dataset.tool = tool;
  b.className = tool === selected ? "selected" : "";
  b.onclick = () => {
    selected = tool;
    document
      .querySelectorAll("[data-tool]")
      .forEach((el) =>
        el.classList.toggle(
          "selected",
          (el as HTMLElement).dataset.tool === tool,
        ),
      );
    $("hint").textContent =
      tool === "spawn"
        ? "Tap a safe empty cell for the player spawn."
        : `Paint ${labels[tool].toLowerCase()}. Right-click also erases.`;
  };
  $("tools").append(b);
}
for (const [key, label] of Object.entries({
  dash: "Dash",
  doubleJump: "Double jump",
  wallJump: "Wall jump",
  pogo: "Pogo",
})) {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" id="ability-${key}" checked>${label}`;
  $("abilities").append(l);
  $<HTMLInputElement>("ability-" + key).onchange = (e) => {
    snapshot();
    room().abilities[key as "dash" | "doubleJump" | "wallJump" | "pogo"] = (
      e.target as HTMLInputElement
    ).checked;
  };
}
// Keyboard and touch are sampled together by the fixed-step simulation.
const keys = new Set<string>();
const keyCodes = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowDown",
  "ArrowUp",
  "Space",
  "KeyA",
  "KeyD",
  "KeyS",
  "KeyW",
  "KeyJ",
  "KeyK",
  "KeyX",
  "ShiftLeft",
  "ShiftRight",
];
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).matches("input,select,textarea")) return;
  if (keyCodes.includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.code === "Escape" && playing) {
    paused = !paused;
    $("pauseOverlay").hidden = !paused;
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
function release() {
  keys.clear();
  touchInput = emptyInput();
}
window.addEventListener("blur", () => {
  release();
  if (playing) {
    paused = true;
    $("pauseOverlay").hidden = false;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    release();
    if (playing) {
      paused = true;
      $("pauseOverlay").hidden = false;
    }
  }
});
function input(): Input {
  return {
    axis:
      touchInput.axis ||
      Number(keys.has("ArrowRight") || keys.has("KeyD")) -
        Number(keys.has("ArrowLeft") || keys.has("KeyA")),
    down: touchInput.down || keys.has("ArrowDown") || keys.has("KeyS"),
    jump:
      touchInput.jump ||
      keys.has("Space") ||
      keys.has("KeyW") ||
      keys.has("ArrowUp"),
    dash:
      touchInput.dash ||
      keys.has("ShiftLeft") ||
      keys.has("ShiftRight") ||
      keys.has("KeyK"),
    attack: touchInput.attack || keys.has("KeyJ") || keys.has("KeyX"),
  };
}
class TrialScene extends Phaser.Scene {
  art!: Phaser.GameObjects.Container;
  playerSprite!: Phaser.GameObjects.Sprite;
  ink!: Phaser.GameObjects.Graphics;
  player = spawn(room());
  previous = emptyInput();
  accumulator = 0;
  painting = false;
  lastCell = "";
  constructor() {
    super("trial");
  }
  preload() {
    this.load.spritesheet("tiles", "/assets/kenney.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
  }
  create() {
    scene = this;
    this.art = this.add.container();
    this.ink = this.add.graphics();
    this.playerSprite = this.add
      .sprite(0, 0, "tiles", 260)
      .setOrigin(0)
      .setDisplaySize(26, 32)
      .setTint(0xf1e6b7);
    this.rebuild();
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (playing) return;
      this.painting = true;
      this.lastCell = "";
      snapshot();
      this.paint(p);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.painting && !playing) this.paint(p);
    });
    this.input.on("pointerup", () => {
      this.painting = false;
    });
    this.input.on("gameout", () => {
      this.painting = false;
    });
    refresh();
  }
  paint(p: Phaser.Input.Pointer) {
    const x = Math.floor(p.worldX / TILE),
      y = Math.floor(p.worldY / TILE);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const cell = `${x},${y}`;
    if (cell === this.lastCell) return;
    this.lastCell = cell;
    const tool = p.rightButtonDown() ? "erase" : selected;
    if (tool === "spawn") {
      if (
        room().objects.some((o) => o.x === x && o.y === y && o.kind === "solid")
      )
        return;
      room().spawn = { x, y };
    } else {
      if (tool === "solid" && room().spawn.x === x && room().spawn.y === y)
        return;
      room().objects = room().objects.filter(
        (o) =>
          !(o.x === x && o.y === y) && !(tool === "exit" && o.kind === "exit"),
      );
      if (tool !== "erase") room().objects.push({ x, y, kind: tool });
    }
    this.rebuild();
  }
  rebuild() {
    if (!this.art) return;
    this.art.removeAll(true);
    const g = this.add.graphics();
    this.art.add(g);
    g.fillStyle(0x101c24);
    g.fillRect(0, 0, 1280, 704);
    g.lineStyle(1, 0x233642, playing ? 0.3 : 0.65);
    for (let x = 0; x <= COLS; x++) g.lineBetween(x * TILE, 0, x * TILE, 704);
    for (let y = 0; y <= ROWS; y++) g.lineBetween(0, y * TILE, 1280, y * TILE);
    for (const o of room().objects) {
      const x = o.x * TILE,
        y = o.y * TILE;
      if (o.kind === "solid") {
        g.fillStyle(0x283f48);
        g.fillRect(x, y, 32, 32);
        g.fillStyle(0x779b94);
        g.fillRect(x, y, 32, 3);
        this.art.add(
          this.add
            .image(x + 16, y + 17, "tiles", 7)
            .setDisplaySize(28, 28)
            .setTint(0x577774),
        );
      } else if (o.kind === "spike") {
        g.fillStyle(0xdb827e);
        g.fillTriangle(x + 2, y + 29, x + 10, y + 5, x + 18, y + 29);
        g.fillTriangle(x + 15, y + 29, x + 23, y + 5, x + 31, y + 29);
      } else if (o.kind === "pogo") {
        g.lineStyle(3, 0xe4a080);
        g.strokeCircle(x + 16, y + 16, 12);
        g.lineBetween(x + 4, y + 16, x + 28, y + 16);
        g.lineBetween(x + 16, y + 4, x + 16, y + 28);
      } else if (o.kind === "crystal") {
        g.fillStyle(0x7ad8d0);
        g.fillTriangle(x + 16, y + 2, x + 28, y + 16, x + 4, y + 16);
        g.fillTriangle(x + 16, y + 30, x + 28, y + 16, x + 4, y + 16);
      } else if (o.kind === "checkpoint") {
        g.lineStyle(3, 0xe4c983);
        g.lineBetween(x + 8, y + 30, x + 8, y + 2);
        g.fillStyle(0xe4c983);
        g.fillTriangle(x + 9, y + 3, x + 27, y + 8, x + 9, y + 16);
      } else {
        g.lineStyle(3, 0xb3dfbf);
        g.strokeRect(x + 3, y + 1, 26, 30);
        g.fillStyle(0xb3dfbf, 0.2);
        g.fillRect(x + 7, y + 5, 18, 26);
      }
    }
    if (!playing) {
      g.lineStyle(2, 0xf1e6b7);
      g.strokeCircle(
        room().spawn.x * TILE + 16,
        room().spawn.y * TILE + 16,
        18,
      );
      this.player = spawn(room());
    }
    this.playerSprite.setVisible(true);
  }
  reset() {
    this.player = spawn(room());
    if (checkpoint) {
      this.player.x = checkpoint.x;
      this.player.y = checkpoint.y;
    }
    this.previous = emptyInput();
    this.accumulator = 0;
  }
  update(_t: number, delta: number) {
    if (!this.playerSprite) return;
    if (playing && !paused) {
      this.accumulator += Math.min(delta / 1000, 0.05);
      while (this.accumulator >= STEP) {
        const controls = input();
        const result = step(this.player, controls, this.previous, room());
        this.previous = { ...controls };
        this.accumulator -= STEP;
        elapsed += STEP;
        if (result === "dead") {
          deaths++;
          if (room().deathRule === "health") {
            health--;
            if (health <= 0) {
              health = 3;
              checkpoint = null;
            }
          } else checkpoint = null;
          this.reset();
          break;
        }
        if (result === "checkpoint" && room().deathRule === "health")
          checkpoint = { x: this.player.x, y: this.player.y };
        if (result === "exit") {
          verified.add(room().id);
          $("clearState").textContent = "LOCAL CLEAR";
          if (roomIndex < project.rooms.length - 1) {
            roomIndex++;
            checkpoint = null;
            health = 3;
            refresh();
            this.reset();
            toast("Room cleared. The next trial awaits.");
          } else {
            paused = true;
            $("pauseOverlay").hidden = false;
            $("pauseOverlay").querySelector("h2")!.textContent =
              "Trial complete";
            toast("Local clear recorded for this session.");
          }
          break;
        }
      }
      $("runStats").textContent =
        `${room().deathRule === "health" ? "♥ " + health + " · " : ""}${deaths} deaths · ${elapsed.toFixed(1)}s`;
    }
    const camera = this.cameras.main;
    if (playing) {
      camera.setZoom(this.scale.height / 440);
      camera.setBounds(0, 0, 1280, 704);
      camera.centerOn(this.player.x + 10, this.player.y - 60);
    } else {
      camera.removeBounds();
      camera.setZoom(
        Math.min(this.scale.width / 1280, this.scale.height / 704),
      );
      camera.centerOn(640, 352);
    }
    this.playerSprite
      .setPosition(this.player.x - 3, this.player.y - 5)
      .setFlipX(this.player.face < 0);
    this.ink.clear();
    if (playing && this.player.attackTime > 0) {
      this.ink.lineStyle(4, 0xf1e6b7);
      this.ink.lineBetween(
        this.player.x - 6,
        this.player.y + HEIGHT + 16,
        this.player.x + 26,
        this.player.y + HEIGHT + 16,
      );
    }
  }
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 704,
  backgroundColor: "#101c24",
  pixelArt: true,
  render: { antialias: false },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: TrialScene,
});
function togglePlay() {
  if (!playing) {
    try {
      parseProject(JSON.stringify(project));
    } catch {
      toast("Each room needs one exit and a safe spawn before playtesting.");
      return;
    }
  }
  playing = !playing;
  paused = false;
  release();
  checkpoint = null;
  health = 3;
  deaths = 0;
  elapsed = 0;
  $("pauseOverlay").hidden = true;
  $("pauseOverlay").querySelector("h2")!.textContent = "Paused";
  document.body.classList.toggle("playing", playing);
  $("play").textContent = playing ? "■ Back to creator" : "▶ Playtest";
  $("mode").textContent = playing
    ? "PLAYTEST / " + room().name
    : "CREATOR / 40 × 22";
  $("hint").textContent = playing
    ? "Move A/D · Jump Space · Dash Shift · Pogo Down + J"
    : "Place platforms, hazards, and an exit. Drag to paint.";
  $("restart").hidden = !playing;
  $("pause").hidden = !playing;
  for (const id of [
    "rooms",
    "addRoom",
    "undo",
    "redo",
    "import",
    "projectName",
  ])
    $<HTMLButtonElement>(id).disabled = playing;
  scene.rebuild();
  scene.reset();
  requestAnimationFrame(fitStage);
}
$("play").onclick = togglePlay;
$("restart").onclick = () => {
  checkpoint = null;
  health = 3;
  paused = false;
  $("pauseOverlay").hidden = true;
  scene.reset();
};
$("pause").onclick = () => {
  paused = true;
  release();
  $("pauseOverlay").hidden = false;
};
$("resume").onclick = () => {
  paused = false;
  $("pauseOverlay").hidden = true;
};
$<HTMLSelectElement>("rooms").onchange = (e) => {
  roomIndex = Number((e.target as HTMLSelectElement).value);
  refresh();
};
$("addRoom").onclick = () => {
  if (project.rooms.length >= 30) {
    toast("Prototype limit: 30 rooms per project.");
    return;
  }
  snapshot();
  project.rooms.push(blankRoom(`Trial ${project.rooms.length + 1}`));
  roomIndex = project.rooms.length - 1;
  refresh();
};
$("undo").onclick = () => {
  if (history.length) {
    future.push(JSON.stringify(project));
    project = JSON.parse(history.pop()!);
    roomIndex = Math.min(roomIndex, project.rooms.length - 1);
    verified.clear();
    dirty = true;
    refresh();
  }
};
$("redo").onclick = () => {
  if (future.length) {
    history.push(JSON.stringify(project));
    project = JSON.parse(future.pop()!);
    verified.clear();
    dirty = true;
    refresh();
  }
};
$<HTMLInputElement>("projectName").onchange = (e) => {
  snapshot();
  project.name =
    (e.target as HTMLInputElement).value.trim() || "Untitled project";
  refresh();
};
$<HTMLInputElement>("roomName").onchange = (e) => {
  snapshot();
  room().name = (e.target as HTMLInputElement).value.trim() || "Untitled trial";
  refresh();
};
$<HTMLSelectElement>("deathRule").onchange = (e) => {
  snapshot();
  room().deathRule = (e.target as HTMLSelectElement).value as
    "instant" | "health";
};
$("save").onclick = guard(async () => {
  parseProject(JSON.stringify(project));
  await save("project", project);
  dirty = false;
  toast("Project saved on this device. Export a backup to keep it safe.");
});
$("export").onclick = () => {
  try {
    parseProject(JSON.stringify(project));
    download("thornwake-project.json", JSON.stringify(project, null, 2));
    toast("Project exported. Clear labels are session-local, not certified.");
  } catch {
    toast("Export needs one exit per room and a valid spawn.");
  }
};
$("import").onclick = () => {
  $<HTMLInputElement>("file").value = "";
  $<HTMLInputElement>("file").click();
};
$<HTMLInputElement>("file").onchange = guard(async () => {
  const f = $<HTMLInputElement>("file").files?.[0];
  if (!f) return;
  if (f.size > 2_000_000) throw Error("Maximum import size is 2 MB");
  const next = parseProject(await f.text());
  snapshot();
  project = next;
  roomIndex = 0;
  refresh();
  toast("Imported. Undo restores your previous project.");
});
$("share").onclick = guard(async () => {
  parseProject(JSON.stringify(project));
  const data = LZString.compressToEncodedURIComponent(JSON.stringify(project));
  const link = `${location.origin}${location.pathname}#level=${data}`;
  if (link.length > 8000)
    throw Error(
      "This project is too large for a portable link. Use Export instead.",
    );
  await navigator.clipboard.writeText(link);
  toast("Level link copied. It works once this app is hosted.");
});
$("fullscreen").onclick = guard(async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (document.documentElement.requestFullscreen)
    await document.documentElement.requestFullscreen();
  else toast("Use your browser’s install or fullscreen option.");
});
function fitStage() {
  const stage = $("stage"),
    workspace = $("workspace");
  const value = $<HTMLSelectElement>("ratio").value;
  if (value === "full") {
    stage.style.width = "100%";
    stage.style.height = "";
    stage.style.flex = "1";
  } else {
    const [a, b] = value.split("/").map(Number),
      ratio = a / b;
    const availableWidth =
      workspace.clientWidth -
      parseFloat(getComputedStyle(workspace).paddingLeft) * 2;
    const availableHeight =
      workspace.clientHeight -
      workspace.querySelector<HTMLElement>(".stage-bar")!.offsetHeight -
      workspace.querySelector<HTMLElement>("footer")!.offsetHeight;
    const width = Math.min(availableWidth, availableHeight * ratio);
    stage.style.flex = "none";
    stage.style.width = width + "px";
    stage.style.height = width / ratio + "px";
  }
  game.scale.refresh();
}
$<HTMLSelectElement>("ratio").onchange = fitStage;
window.addEventListener("resize", () => requestAnimationFrame(fitStage));
function showDialog(html: string) {
  $("dialogBody").innerHTML = html;
  $<HTMLDialogElement>("dialog").showModal();
  release();
  if (playing) {
    paused = true;
    $("pauseOverlay").hidden = false;
  }
}
$("closeDialog").onclick = () => {
  $<HTMLDialogElement>("dialog").close();
};
$("help").onclick = () =>
  showDialog(
    `<p class="eyebrow">THORNWAKE / FIELD NOTES</p><h2>Make the impossible feel possible.</h2><p>Paint a room, place a safe spawn and one exit, then playtest. An exit advances to the next room in your project.</p><p><b>Keyboard:</b> A/D or arrows to move; Space to jump; Shift to dash; Down + J/X to pogo. Hold jump for a higher leap. Jump against walls to climb.</p><p><b>Touch:</b> fixed joystick to move; pull it downward and tap Attack to pogo. Change to buttons or reposition controls in Controls.</p><p>Orange rings and pink thorns can be pogoed with a timed downward attack. Touching them without a successful pogo is lethal. Cyan crystals restore air abilities.</p><p>Gold flags save your position in health mode. Instant mode restarts the room. Three lost hearts restart the room in health mode.</p><p><b>0.1.0 boundaries:</b> static tile rooms, sequential exits, four ability toggles. No endless generator, rope, long dash, moving platforms, visual triggers, or online gallery yet. A local clear is not anti-cheat verification.</p><p>Free artwork: <a href="https://kenney.nl/assets/1-bit-platformer-pack" target="_blank" rel="noopener">Kenney 1-Bit Platformer Pack</a>, CC0. Built with Phaser.</p>`,
  );
function updateTouch() {
  document.body.dataset.controls = controlMode;
  document.body.classList.toggle("edit-controls", editingControls);
  $("touch").style.setProperty("--control-scale", String(controlScale));
  $("touch").style.opacity = String(controlOpacity);
}
function preset() {
  return {
    version: "1.0.0",
    mode: controlMode,
    scale: controlScale,
    opacity: controlOpacity,
    positions: Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>(".control")].map((el) => [
        el.id,
        {
          left: el.style.left,
          top: el.style.top,
          texture: el.style.backgroundImage,
        },
      ]),
    ),
  };
}
function applyPreset(raw: unknown) {
  const p = raw as ReturnType<typeof preset>;
  if (
    !p ||
    p.version !== "1.0.0" ||
    !["joystick", "buttons"].includes(p.mode) ||
    !Number.isFinite(p.scale) ||
    p.scale < 0.6 ||
    p.scale > 1.5 ||
    !Number.isFinite(p.opacity) ||
    p.opacity < 0.2 ||
    p.opacity > 1
  )
    throw Error("Invalid control preset");
  controlMode = p.mode;
  controlScale = p.scale;
  controlOpacity = p.opacity;
  for (const el of document.querySelectorAll<HTMLElement>(".control")) {
    const pos = p.positions?.[el.id];
    if (!pos) continue;
    if (
      pos.left &&
      /^\d+(\.\d+)?%$/.test(pos.left) &&
      parseFloat(pos.left) <= 90
    ) {
      el.style.left = pos.left;
      el.style.right = "auto";
    }
    if (
      pos.top &&
      /^\d+(\.\d+)?%$/.test(pos.top) &&
      parseFloat(pos.top) <= 80
    ) {
      el.style.top = pos.top;
      el.style.bottom = "auto";
    }
    if (
      pos.texture &&
      /^url\("data:image\/png;base64,[A-Za-z0-9+/=]+"\)$/.test(pos.texture) &&
      pos.texture.length < 400000
    )
      el.style.backgroundImage = pos.texture;
  }
  updateTouch();
}
$("settings").onclick = () => {
  showDialog(
    `<h2>Your controls, your way.</h2><label>Movement<select id="controlMode"><option value="joystick">Fixed joystick</option><option value="buttons">Directional buttons</option></select></label><label>Size<input id="size" type="range" min="0.6" max="1.5" step="0.05" value="${controlScale}"></label><label>Opacity<input id="opacity" type="range" min="0.2" max="1" step="0.05" value="${controlOpacity}"></label><button id="reposition">Drag controls into position</button><button id="saveControls">Save layout</button><button id="exportControls">Export layout</button><label>Import layout<input id="importControls" type="file" accept=".json"></label><label>Texture target<select id="textureTarget"><option value="jump">Jump</option><option value="dash">Dash</option><option value="attack">Attack</option><option value="stick">Joystick</option><option value="left">Left</option><option value="right">Right</option><option value="down">Down</option></select></label><label>Custom PNG (max 256 KB)<input id="texture" type="file" accept="image/png"></label><button id="resetControls">Reset controls</button><p>Layout editing closes this panel. Drag buttons, then tap Done. Controls are device-local unless exported.</p>`,
  );
  $<HTMLSelectElement>("controlMode").value = controlMode;
  $<HTMLSelectElement>("controlMode").onchange = (e) => {
    controlMode = (e.target as HTMLSelectElement).value;
    updateTouch();
  };
  for (const id of ["size", "opacity"])
    $<HTMLInputElement>(id).oninput = (e) => {
      if (id === "size")
        controlScale = Number((e.target as HTMLInputElement).value);
      else controlOpacity = Number((e.target as HTMLInputElement).value);
      updateTouch();
    };
  $("reposition").onclick = () => {
    editingControls = true;
    updateTouch();
    $<HTMLDialogElement>("dialog").close();
    $("hint").textContent = "Drag touch controls. Tap Done when ready.";
    $("settings").textContent = "Done";
  };
  $("saveControls").onclick = guard(async () => {
    await save("controls", preset());
    toast("Control layout saved.");
  });
  $("exportControls").onclick = () =>
    download("thornwake-controls.json", JSON.stringify(preset()));
  $<HTMLInputElement>("importControls").onchange = guard(async () => {
    const f = $<HTMLInputElement>("importControls").files?.[0];
    if (!f) return;
    if (f.size > 3000000) throw Error("Control file too large");
    applyPreset(JSON.parse(await f.text()));
    toast("Layout imported. Save layout to keep it.");
  });
  $<HTMLInputElement>("texture").onchange = guard(async () => {
    const f = $<HTMLInputElement>("texture").files?.[0];
    if (!f) return;
    if (f.type !== "image/png" || f.size > 256000)
      throw Error("Choose a PNG under 256 KB");
    const b = await createImageBitmap(f);
    if (b.width > 1024 || b.height > 1024) {
      b.close();
      throw Error("Maximum texture dimensions: 1024 × 1024");
    }
    b.close();
    const reader = new FileReader();
    reader.onload = () => {
      $($<HTMLSelectElement>("textureTarget").value).style.backgroundImage =
        `url("${reader.result}")`;
    };
    reader.readAsDataURL(f);
  });
  $("resetControls").onclick = () => {
    controlMode = "joystick";
    controlScale = 1;
    controlOpacity = 0.75;
    document
      .querySelectorAll<HTMLElement>(".control")
      .forEach((el) => el.removeAttribute("style"));
    updateTouch();
  };
};
$("settings").addEventListener(
  "click",
  (event) => {
    if (editingControls) {
      event.stopImmediatePropagation();
      editingControls = false;
      updateTouch();
      $("settings").textContent = "Controls";
      void save("controls", preset()).catch(() =>
        toast("Could not save layout"),
      );
    }
  },
  { capture: true },
);
for (const el of document.querySelectorAll<HTMLElement>(".control")) {
  let held: number | null = null;
  el.onpointerdown = (e) => {
    e.preventDefault();
    held = e.pointerId;
    el.setPointerCapture(e.pointerId);
    move(e);
  };
  el.onpointermove = (e) => {
    if (held === e.pointerId) move(e);
  };
  function move(e: PointerEvent) {
    if (editingControls) {
      const r = $("stage").getBoundingClientRect();
      el.style.left = `${Math.max(0, Math.min(90, ((e.clientX - r.left - el.offsetWidth / 2) / r.width) * 100))}%`;
      el.style.top = `${Math.max(0, Math.min(80, ((e.clientY - r.top - el.offsetHeight / 2) / r.height) * 100))}%`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      return;
    }
    if (el.id === "stick") {
      const r = el.getBoundingClientRect(),
        dx = (e.clientX - r.left - r.width / 2) / (r.width / 2),
        dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      touchInput.axis = Math.abs(dx) > 0.22 ? Math.sign(dx) : 0;
      touchInput.down = dy > 0.35;
      el.querySelector<HTMLElement>("span")!.style.transform =
        `translate(${Math.max(-25, Math.min(25, dx * 25))}px,${Math.max(-25, Math.min(25, dy * 25))}px)`;
    } else if (el.id === "left" || el.id === "right")
      touchInput.axis = el.id === "left" ? -1 : 1;
    else touchInput[el.id as "jump" | "dash" | "attack" | "down"] = true;
  }
  const up = () => {
    held = null;
    if (el.id === "stick") {
      touchInput.axis = 0;
      touchInput.down = false;
      el.querySelector<HTMLElement>("span")!.style.transform = "";
    } else if (el.id === "left" || el.id === "right") touchInput.axis = 0;
    else touchInput[el.id as "jump" | "dash" | "attack" | "down"] = false;
  };
  el.onpointerup = up;
  el.onpointercancel = up;
  el.onlostpointercapture = up;
}
let installEvent: Event & { prompt?: () => Promise<unknown> };
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("install").hidden = false;
});
$("install").onclick = guard(async () => {
  await installEvent?.prompt?.();
});
const updateSW = registerSW({
  onNeedRefresh() {
    toast("An update is ready. Save and reload when your trial is finished.");
  },
  onOfflineReady() {
    toast("Ready for offline play on this device.");
  },
});
void updateSW;
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
void (async () => {
  try {
    const hash = location.hash;
    if (hash.startsWith("#level=")) {
      if (hash.length > 8000) throw Error("Shared level link too large");
      const raw = LZString.decompressFromEncodedURIComponent(hash.slice(7));
      if (!raw) throw Error("Invalid level link");
      project = parseProject(raw);
      dirty = true;
    } else {
      const saved = await load<Project>("project");
      if (saved) project = parseProject(JSON.stringify(saved));
    }
    const controls = await load("controls");
    if (controls) applyPreset(controls);
    refresh();
  } catch (e) {
    toast(e instanceof Error ? e.message : "Could not restore saved data");
  }
})();
updateTouch();
