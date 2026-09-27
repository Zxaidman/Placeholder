import Phaser from "phaser";
import { PlatformCamera } from "./camera";
import { COLS, ROWS, TILE, type Room, type TileObject } from "./model";
import { World, STEP, rect, active, recordInput, type Input } from "./physics";
export type EditTool =
  TileObject["kind"] | "spawn" | "erase" | "select" | "pan";
export type SceneHooks = {
  input: () => Input;
  paint: (x: number, y: number, erase: boolean) => void;
  begin: () => void;
  select: (x: number, y: number, extend: boolean) => void;
  moveSelection: (dx: number, dy: number) => void;
  event: (
    event: { type: string; target?: string },
    log: [number, number][],
  ) => void;
  sound: (name: string) => void;
  hud: (world: World) => void;
};
const palettes = {
  palace: [0x101f2b, 0xb3c7ad, 0x435d65, 0x7aa390, 0xd8c795],
  garden: [0x102b24, 0xcfe0a7, 0x4d765f, 0x76ad73, 0xe1c987],
  furnace: [0x261b2b, 0xe4b58d, 0x78515a, 0xe97755, 0xf3d88b],
  mycelium: [0x1f1730, 0xd6b3cf, 0x60496f, 0xc98bd3, 0xf0d7a1],
  drowned: [0x10232e, 0x9bcbd0, 0x3e6570, 0x5fc1bf, 0xe1c989],
};
export class TrialScene extends Phaser.Scene {
  room!: Room;
  world!: World;
  playing = false;
  paused = false;
  tool: EditTool = "solid";
  selected = new Set<string>();
  editZoom = 2;
  panX = 20 * 32;
  panY = 33 * 32;
  accumulator = 0;
  log: [number, number][] = [];
  recording = true;
  art!: Phaser.GameObjects.Container;
  dynamic!: Phaser.GameObjects.Graphics;
  playerSprite!: Phaser.GameObjects.Sprite;
  drag = false;
  last = "";
  origin = { x: 0, y: 0 };
  cameraOrigin = { x: 0, y: 0 };
  playZoom = 1.2;
  framing = new PlatformCamera();
  visualX = 0;
  visualY = 0;
  visualScaleX = 1;
  visualScaleY = 1;
  tutorialStage = 0;
  tutorialWallJumped = false;
  tutorialInputFamily: "keyboard" | "touch" | "gamepad" =
    "touch" in window && navigator.maxTouchPoints > 0 ? "touch" : "keyboard";
  tutorialBubble!: Phaser.GameObjects.Text;
  private lastGamepadCheck = 0;
  constructor(public hooks: SceneHooks) {
    super("trial");
  }
  preload() {
    this.load.spritesheet("tiles", "/assets/kenney.png", {
      frameWidth: 16,
      frameHeight: 16,
    });
  }
  create() {
    this.art = this.add.container();
    this.dynamic = this.add.graphics().setDepth(4);
    this.playerSprite = this.add
      .sprite(0, 0, "tiles", 260)
      .setOrigin(0)
      .setDisplaySize(26, 34)
      .setVisible(false);
    this.tutorialBubble = this.add
      .text(0, 0, "")
      .setOrigin(0.5, 1)
      .setDepth(30)
      .setStyle({
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "13px",
        color: "#f4e8c6",
        backgroundColor: "#0a151dcc",
        padding: { left: 12, right: 12, top: 8, bottom: 8 },
        align: "center",
        stroke: "#050b0f",
        strokeThickness: 3,
      })
      .setVisible(false);
    window.addEventListener("keydown", () => (this.tutorialInputFamily = "keyboard"));
    document.getElementById("touch")?.addEventListener("pointerdown", () => {
      this.tutorialInputFamily = "touch";
    });
    window.addEventListener("gamepadconnected", () => (this.tutorialInputFamily = "gamepad"));
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.playing) return;
      this.drag = true;
      this.last = "";
      this.origin = { x: p.x, y: p.y };
      this.cameraOrigin = { x: this.panX, y: this.panY };
      if (this.tool === "select") {
        const q = this.cameras.main.getWorldPoint(p.x, p.y);
        this.hooks.select(
          Math.floor(q.x / TILE),
          Math.floor(q.y / TILE),
          p.event instanceof MouseEvent && p.event.shiftKey,
        );
      } else if (this.tool !== "pan") {
        this.hooks.begin();
        this.paint(p);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.drag || this.playing) return;
      if (this.tool === "pan") {
        this.panX =
          this.cameraOrigin.x - (p.x - this.origin.x) / this.cameras.main.zoom;
        this.panY =
          this.cameraOrigin.y - (p.y - this.origin.y) / this.cameras.main.zoom;
      } else if (this.tool !== "select") this.paint(p);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.drag && this.tool === "select") {
        const dx = Math.round(
            (p.x - this.origin.x) / this.cameras.main.zoom / TILE,
          ),
          dy = Math.round(
            (p.y - this.origin.y) / this.cameras.main.zoom / TILE,
          );
        if (dx || dy) this.hooks.moveSelection(dx, dy);
      }
      this.drag = false;
    });
    this.input.on("gameout", () => (this.drag = false));
    this.input.on(
      "wheel",
      (_p: unknown, _go: unknown, _dx: number, dy: number) => {
        if (!this.playing)
          this.editZoom = Math.max(
            1,
            Math.min(5, this.editZoom * (dy > 0 ? 0.9 : 1.1)),
          );
      },
    );
    if (this.room) this.rebuild();
  }
  fineGrid = false;
  paint(p: Phaser.Input.Pointer) {
    const q = this.cameras.main.getWorldPoint(p.x, p.y),
      x =
        Math.floor((q.x / TILE) * (this.fineGrid ? 2 : 1)) /
        (this.fineGrid ? 2 : 1),
      y =
        Math.floor((q.y / TILE) * (this.fineGrid ? 2 : 1)) /
        (this.fineGrid ? 2 : 1);
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
    const key = `${x},${y}`;
    if (key === this.last) return;
    this.last = key;
    this.hooks.paint(x, y, p.rightButtonDown());
  }
  setRoom(room: Room, playing: boolean) {
    this.room = room;
    this.playing = playing;
    this.world = new World(room);
    this.paused = false;
    this.framing.reset();
    this.accumulator = 0;
    this.log = [];
    this.recording = true;
    this.visualX = room.spawn.x * TILE + 16;
    this.visualY = room.spawn.y * TILE + 14;
    this.visualScaleX = 1;
    this.visualScaleY = 1;
    this.tutorialStage = room.id === "tutorial" ? 0 : -1;
    this.tutorialWallJumped = false;
    this.tutorialBubble.setVisible(false);
    this.rebuild();
  }
  resetTutorial() {
    if (this.room?.id !== "tutorial") return;
    this.tutorialStage = 0;
    this.tutorialWallJumped = false;
    this.tutorialBubble.setVisible(false);
  }
  tutorialText(stage: number) {
    const prompts = {
      keyboard: [
        "A / D\nMOVE",
        "SPACE\nJUMP",
        "SHIFT / K\nDASH",
        "SPACE AT WALL\nWALL JUMP",
        "SPACE AGAIN\nDOUBLE JUMP",
        "DOWN + J / X\nPOGO",
        "E\nCLAWLINE",
        "HOLD E\nSWING",
        "FOLLOW THE LIGHT\nREACH THE EXIT",
      ],
      touch: [
        "JOYSTICK\nMOVE",
        "JUMP\nTAP",
        "DASH\nTAP",
        "JUMP AT WALL\nWALL JUMP",
        "JUMP AGAIN\nDOUBLE JUMP",
        "DOWN + ATTACK\nPOGO",
        "HOOK\nCLAWLINE",
        "HOLD HOOK\nSWING",
        "FOLLOW THE LIGHT\nREACH THE EXIT",
      ],
      gamepad: [
        "LEFT STICK\nMOVE",
        "A / ✕\nJUMP",
        "B / ○\nDASH",
        "A / ✕ AT WALL\nWALL JUMP",
        "A / ✕ AGAIN\nDOUBLE JUMP",
        "DOWN + X / □\nPOGO",
        "LB / L1\nCLAWLINE",
        "HOLD LB / L1\nSWING",
        "FOLLOW THE LIGHT\nREACH THE EXIT",
      ],
    } as const;
    return prompts[this.tutorialInputFamily][Math.min(stage, 8)];
  }
  tutorialFocus(stage: number) {
    const action =
      stage === 0 ? "move" :
      stage === 1 || stage === 3 || stage === 4 ? "jump" :
      stage === 2 ? "dash" :
      stage === 5 ? "attack" :
      stage === 6 || stage === 7 ? "hook" :
      null;
    for (const el of document.querySelectorAll<HTMLElement>(".tutorial-focus"))
      el.classList.remove("tutorial-focus");
    if (this.tutorialInputFamily !== "touch" || !action) return;
    if (action === "move") {
      document.getElementById("stick")?.classList.add("tutorial-focus");
      document.getElementById("left")?.classList.add("tutorial-focus");
      document.getElementById("right")?.classList.add("tutorial-focus");
    } else {
      document.getElementById(action)?.classList.add("tutorial-focus");
    }
  }
  updateTutorial() {
    if (!this.playing || this.room.id !== "tutorial") {
      this.tutorialBubble.setVisible(false);
      this.tutorialFocus(-1);
      return;
    }
    const p = this.world.player;
    const current = this.tutorialStage;
    if (current === 0 && (Math.abs(p.vx) > 45 || p.x > this.room.spawn.x * TILE + 100))
      this.tutorialStage = 1;
    else if (current === 1 && this.world.lastEvent === "jump")
      this.tutorialStage = 2;
    else if (current === 2 && this.world.lastEvent === "dash")
      this.tutorialStage = 3;
    else if (current === 3 && this.tutorialWallJumped)
      this.tutorialStage = 4;
    else if (current === 4 && this.world.lastEvent === "jump" && !p.airJump)
      this.tutorialStage = 5;
    else if (current === 5 && this.world.lastEvent === "pogo")
      this.tutorialStage = 6;
    else if (current === 6 && p.grapple) {
      const a = this.room.objects.find((o) => o.id === p.grapple);
      if (a?.anchorMode === "pull") this.tutorialStage = 7;
    } else if (current === 7 && p.grapple) {
      const a = this.room.objects.find((o) => o.id === p.grapple);
      if (a?.anchorMode === "swing") this.tutorialStage = 8;
    }
    this.tutorialFocus(this.tutorialStage);
    const text = this.tutorialText(this.tutorialStage);
    this.tutorialBubble
      .setText(text)
      .setPosition(this.visualX, this.visualY - 34)
      .setVisible(!this.paused);
  }
  rebuild() {
    if (!this.art || !this.room) return;
    this.art.removeAll(true);
    const g = this.add.graphics();
    this.art.add(g);
    const colors = palettes[this.room.theme];
    g.fillStyle(colors[0]);
    g.fillRect(0, 0, COLS * TILE, ROWS * TILE);
    // Region-specific silhouettes and motifs. These are original vector assets,
    // so creator rooms and authored rooms share the same visual language.
    for (let band = 0; band < 5; band++) {
      g.fillStyle(colors[1], 0.018 + band * 0.004);
      g.fillRect(0, 100 + band * 210, COLS * TILE, 180);
    }
    if (this.room.theme === "palace") {
      for (let x = 40; x < COLS * TILE; x += 320) {
        g.lineStyle(10, colors[2], 0.26);
        g.strokeRoundedRect(x, 900, 180, 700, { tl: 90, tr: 90, bl: 0, br: 0 });
        g.lineStyle(2, colors[1], 0.18);
        g.strokeRoundedRect(x + 12, 912, 156, 676, { tl: 78, tr: 78, bl: 0, br: 0 });
      }
    } else if (this.room.theme === "garden") {
      for (let x = 30; x < COLS * TILE; x += 170) {
        const top = 130 + ((x * 17) % 260);
        g.lineStyle(4, colors[2], 0.24);
        g.lineBetween(x, 0, x - 16, top);
        for (let j = 0; j < 7; j++) {
          const ly = top + j * 44;
          g.fillStyle(colors[3], 0.17);
          g.fillEllipse(x - 18 + (j % 2 ? 12 : -4), ly, 28, 13);
          g.fillEllipse(x - 30 + (j % 2 ? -6 : 10), ly + 15, 21, 10);
        }
      }
    } else if (this.room.theme === "furnace") {
      for (let x = 20; x < COLS * TILE; x += 260) {
        g.lineStyle(14, colors[2], 0.3);
        g.strokeRoundedRect(x, 230, 110, 860, 44);
        g.lineStyle(4, colors[3], 0.5);
        g.lineBetween(x + 55, 280, x + 55, 1010);
        for (let j = 0; j < 5; j++) {
          g.fillStyle(colors[4], 0.16);
          g.fillCircle(x + 28 + (j % 2) * 52, 1080 + j * 35, 5 + (j % 3) * 2);
        }
      }
    } else if (this.room.theme === "mycelium") {
      for (let x = 55; x < COLS * TILE; x += 210) {
        const base = 980 + ((x * 11) % 160);
        g.lineStyle(5, colors[2], 0.25);
        g.lineBetween(x, base, x, base - 210);
        g.fillStyle(colors[3], 0.25);
        g.fillEllipse(x, base - 224, 70, 34);
        g.fillStyle(colors[4], 0.18);
        g.fillEllipse(x - 22, base - 236, 21, 12);
        g.fillEllipse(x + 18, base - 250, 18, 10);
        for (let n = 0; n < 8; n++) {
          const sx = x - 80 + n * 22;
          g.fillStyle(colors[4], 0.13);
          g.fillCircle(sx, 180 + ((n * 83 + x) % 460), 2.4);
        }
      }
    } else {
      for (let x = 60; x < COLS * TILE; x += 240) {
        const base = 1180 + ((x * 7) % 120);
        g.lineStyle(8, colors[2], 0.28);
        g.lineBetween(x, base, x + 30, 520);
        g.lineBetween(x + 70, base, x + 110, 650);
        g.fillStyle(colors[3], 0.18);
        g.fillEllipse(x + 38, 520, 130, 40);
        for (let n = 0; n < 5; n++) {
          g.fillStyle(colors[4], 0.13);
          g.fillCircle(x + 18 + n * 31, 160 + ((n * 117 + x) % 500), 3);
        }
      }
    }
    if (!this.playing) {
      g.lineStyle(1, colors[2], 0.25);
      for (let x = 0; x <= COLS; x++)
        g.lineBetween(x * TILE, 0, x * TILE, ROWS * TILE);
      for (let y = 0; y <= ROWS; y++)
        g.lineBetween(0, y * TILE, COLS * TILE, y * TILE);
    }
    for (const o of this.room.objects.filter((o) =>
      o.kind === "solid" || o.kind === "platform" || o.kind === "underPlatform"
    )) {
      const r = rect(o, 0);
      const under = o.kind === "underPlatform";
      g.fillStyle(under ? 0x0a1319 : 0x0b171f);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(under ? colors[2] : colors[2], under ? 0.82 : 1);
      g.fillRect(r.x, r.y + (under ? 3 : 5), r.w, Math.max(1, r.h - (under ? 3 : 5)));
      if (under) {
        g.fillStyle(colors[0], 0.32);
        for (let x = r.x + 8; x < r.x + r.w; x += 18)
          g.lineBetween(x, r.y + 6, x + 10, r.y + r.h - 4);
        g.lineStyle(2, colors[3], 0.22);
        g.strokeRect(r.x + 2, r.y + 2, Math.max(1, r.w - 4), Math.max(1, r.h - 4));
        continue;
      }
      g.fillStyle(0x101c25, 0.32);
      g.fillRect(r.x + 4, r.y + 12, Math.max(1, r.w - 8), Math.max(1, r.h - 12));
      g.fillStyle(colors[1]);
      g.fillRect(r.x, r.y, r.w, 5);
      g.fillStyle(colors[3], 0.95);
      g.fillRect(r.x, r.y + 5, r.w, 3);
      for (let x = r.x + 8; x < r.x + r.w - 4; x += 22) {
        g.fillStyle(colors[4], 0.45);
        if (this.room.theme === "garden")
          g.fillEllipse(x, r.y + 9, 13, 5);
        else if (this.room.theme === "furnace")
          g.fillRect(x, r.y + 8, 12, 3);
        else if (this.room.theme === "mycelium")
          g.fillEllipse(x, r.y + 8, 8, 8);
        else if (this.room.theme === "drowned")
          g.lineBetween(x, r.y + 4, x - 3, r.y - 2);
        else
          g.fillRect(x, r.y + 8, 9, 2);
      }
      if (this.room.theme === "palace" || this.room.theme === "drowned") {
        g.lineStyle(1, colors[1], 0.17);
        for (let y = r.y + 32; y < r.y + r.h; y += 32) {
          g.lineBetween(r.x, y, r.x + r.w, y);
          for (let x = r.x + (((y - r.y) / 32) % 2 ? 24 : 48); x < r.x + r.w; x += 64)
            g.lineBetween(x, y, x, Math.min(y + 32, r.y + r.h));
        }
      }
    }
  }

  update(_t: number, delta: number) {
    if (!this.room || !this.dynamic) return;
    if (this.playing && !this.paused) {
      this.accumulator += Math.min(delta / 1000, 0.05);
      while (this.accumulator >= STEP) {
        this.accumulator -= STEP;
        const input = this.hooks.input();
        const wallBeforeTick = this.world.player.wall;
        if (this.recording) {
          if (this.world.frames < 144000) recordInput(this.log, input);
          else this.recording = false;
        }
        const event = this.world.tick(input);
        if (this.room.id === "tutorial" && wallBeforeTick !== 0 && this.world.lastEvent === "jump")
          this.tutorialWallJumped = true;
        if (this.world.lastEvent) this.hooks.sound(this.world.lastEvent);
        if (event) {
          if (event.type === "exit") this.paused = true;
          this.hooks.event(event, this.log);
          if (event.type === "exit") break;
        }
      }
      this.hooks.hud(this.world);
    }
    this.updateTutorial();
    const camera = this.cameras.main;
    if (this.playing) {
      const zoom = (this.scale.height / 660) * this.playZoom;
      camera.setZoom(zoom);
      camera.setBounds(0, 0, COLS * TILE, ROWS * TILE);
      const center = this.framing.update(
        this.world.player,
        this.scale.width / zoom,
        this.scale.height / zoom,
        delta / 1000,
        this.world.previous.down && !this.world.previous.dash,
      );
      camera.centerOn(center.x, center.y);
    } else {
      camera.removeBounds();
      camera.setZoom(
        Math.min(
          this.scale.width / (COLS * TILE),
          this.scale.height / (ROWS * TILE),
        ) * this.editZoom,
      );
      camera.centerOn(this.panX, this.panY);
    }
    const g = this.dynamic;
    g.clear();
    const w = this.world;
    for (const o of this.room.objects.filter((o) => !["solid", "platform", "underPlatform"].includes(o.kind))) {
      const r = rect(o, this.playing ? w.time : 0),
        x = r.x,
        y = r.y;
      switch (o.kind) {
        case "moving":
        case "timed":
        case "door": {
          const a = active(o, w.time, w.channels);
          g.fillStyle(o.kind === "door" ? 0xdac18a : 0x90bab5, a ? 0.85 : 0.15);
          g.fillRect(x, y, r.w, r.h);
          g.lineStyle(2, 0xdcdfca, a ? 1 : 0.25);
          g.strokeRect(x, y, r.w, r.h);
          if (o.kind === "timed") {
            const phase = ((w.time + o.phase) % o.period) / o.period;
            g.fillStyle(a ? 0xeedda6 : 0x9ab8b3, a ? 0.95 : 0.35);
            g.fillRect(
              x,
              y - 5,
              r.w *
                (a
                  ? Math.max(0, (0.65 - phase) / 0.65)
                  : Math.max(0, (1 - phase) / 0.35)),
              2,
            );
          }
          break;
        }
        case "spike": {
          const spikeColor =
            this.room.theme === "furnace" ? colors[3] :
            this.room.theme === "mycelium" ? colors[4] :
            this.room.theme === "drowned" ? colors[3] : 0xd98282;
          g.fillStyle(spikeColor);
          for (let i = 0; i < o.w; i++)
            g.fillTriangle(
              x + i * 32,
              y + r.h,
              x + i * 32 + 16,
              y,
              x + i * 32 + 32,
              y + r.h,
            );
          break;
        }
        case "pogo":
        case "enemy":
          g.fillStyle(o.kind === "enemy" ? 0x8b414e : 0x82543b, 0.8);
          g.fillCircle(x + r.w / 2, y + r.h / 2, Math.min(r.w, r.h) / 2 - 4);
          g.fillStyle(0xffd3a2, 0.9);
          g.fillCircle(x + r.w / 2, y + r.h / 2, 3);
          g.lineStyle(3, o.kind === "enemy" ? 0xf37072 : 0xedb07f);
          g.strokeCircle(x + r.w / 2, y + r.h / 2, Math.min(r.w, r.h) / 2 - 3);
          g.lineBetween(x + 4, y + r.h / 2, x + r.w - 4, y + r.h / 2);
          g.lineBetween(x + r.w / 2, y + 4, x + r.w / 2, y + r.h - 4);
          break;
        case "crystal": {
          g.fillStyle(0x6ae6cf, (w.refills.get(o.id) || 0) > w.time ? 0.15 : 1);
          g.fillTriangle(x + 16, y + 2, x + 29, y + 16, x + 3, y + 16);
          g.fillTriangle(x + 16, y + 30, x + 29, y + 16, x + 3, y + 16);
          break;
        }
        case "checkpoint":
          g.fillStyle(0xeac781, 0.06);
          g.fillCircle(x + 16, y + 14, 42);
          g.fillStyle(0xeac781, 0.1);
          g.fillCircle(x + 16, y + 14, 24);
          g.lineStyle(3, 0xeac781);
          g.lineBetween(x + 6, y + 31, x + 6, y);
          g.fillStyle(0xeac781);
          g.fillTriangle(x + 7, y + 2, x + 28, y + 7, x + 7, y + 17);
          break;
        case "exit":
          g.lineStyle(3, 0xbbdfb4);
          g.strokeRoundedRect(x + 2, y + 1, r.w - 4, r.h - 2, {
            tl: 14,
            tr: 14,
            bl: 0,
            br: 0,
          });
          g.fillStyle(0xbbdfb4, 0.12);
          g.fillRect(x + 6, y + 4, r.w - 12, r.h - 8);
          break;
        case "anchor":
          g.lineStyle(3, o.anchorMode === "pull" ? 0x80cdea : 0xe4d6b2);
          g.strokeCircle(x + 16, y + 16, 12);
          if (o.anchorMode === "pull") {
            g.lineBetween(x + 16, y + 2, x + 16, y + 30);
            g.lineBetween(x + 2, y + 16, x + 30, y + 16);
          }
          break;
        case "switch":
          g.fillStyle(w.channels.has(o.channel) ? 0x82eeb4 : 0xce9969);
          g.fillRect(x + 4, y + 12, r.w - 8, r.h - 12);
          g.lineStyle(3, 0xeedcb1);
          g.lineBetween(x + 16, y + 18, x + 23, y + 2);
          break;
        case "gravity":
          g.fillStyle(0xa989e4, 0.2);
          g.fillRect(x, y, r.w, r.h);
          g.lineStyle(2, 0xb993e8);
          g.strokeRect(x, y, r.w, r.h);
          g.lineBetween(x + 8, y + 10, x + 16, y + 3);
          g.lineBetween(x + 16, y + 3, x + 24, y + 10);
          break;
        case "pad":
          g.fillStyle(0x94c8ff);
          g.fillRect(x, y + 23, 32, 9);
          g.fillTriangle(x + 4, y + 18, x + 16, y + 3, x + 28, y + 18);
          break;
      }
    }
    if (!this.playing) {
      g.lineStyle(2, 0xf4e7b6);
      g.strokeCircle(
        this.room.spawn.x * 32 + 16,
        this.room.spawn.y * 32 + 16,
        19,
      );
      for (const o of this.room.objects.filter((o) =>
        this.selected.has(o.id),
      )) {
        g.lineStyle(3, 0xffe18c);
        g.strokeRect(o.x * 32 - 2, o.y * 32 - 2, o.w * 32 + 4, o.h * 32 + 4);
        if (o.kind === "moving" || o.kind === "enemy") {
          g.lineStyle(2, 0xffe18c, 0.6);
          g.lineBetween(
            o.x * 32 + 16,
            o.y * 32 + 16,
            (o.x + (o.axis === "x" ? o.travel : 0)) * 32 + 16,
            (o.y + (o.axis === "y" ? o.travel : 0)) * 32 + 16,
          );
        }
      }
    }
    const p = this.playing
      ? w.player
      : {
          ...w.player,
          x: this.room.spawn.x * 32 + 6,
          y: this.room.spawn.y * 32,
        };
    this.playerSprite.setVisible(false);
    // Surface reference, not a trajectory prediction. Works with inverted gravity.
    if (this.playing && !p.grounded) {
      const candidates = w.solids
        .filter((o) => active(o, w.time, w.channels))
        .map((o) => rect(o, w.time))
        .filter((r) => p.x + 10 >= r.x && p.x + 10 <= r.x + r.w)
        .map((r) => ({ r, y: p.gravity > 0 ? r.y : r.y + r.h }))
        .filter((v) => (v.y - (p.y + 14)) * p.gravity > 14)
        .sort((a, b) => (a.y - b.y) * p.gravity);
      const surface = candidates[0];
      if (surface && Math.abs(surface.y - p.y) < 600) {
        g.fillStyle(0xf2deb4, 0.24);
        g.fillEllipse(p.x + 10, surface.y - p.gravity * 2, 22, 4);
        g.lineStyle(1, 0xf2deb4, 0.65);
        g.lineBetween(
          p.x + 4,
          surface.y - p.gravity * 6,
          p.x + 10,
          surface.y - p.gravity * 2,
        );
        g.lineBetween(
          p.x + 16,
          surface.y - p.gravity * 6,
          p.x + 10,
          surface.y - p.gravity * 2,
        );
      }
    }
    const targetX = p.x + 10,
      targetY = p.y + 14,
      smoothing = Math.min(1, delta / 1000 * 18);
    this.visualX += (targetX - this.visualX) * smoothing;
    this.visualY += (targetY - this.visualY) * smoothing;

    const px = this.visualX,
      py = this.visualY,
      flip = p.gravity,
      speed = Math.min(1, Math.abs(p.vx) / 280),
      phase = this.playing ? w.time * (9 + speed * 10) : 0,
      moving = speed > 0.08 && p.grounded,
      stride = moving ? Math.sin(phase) * 5 : 0,
      bob = moving ? Math.abs(Math.sin(phase)) * 1.5 : 0,
      airborne = !p.grounded,
      lean = p.dashTime > 0 ? p.face * 0.14 : p.charging ? -p.face * 0.08 : p.vx * 0.00018,
      squash = p.dashTime > 0 ? 0.86 : p.charging ? 1.06 : airborne ? 0.96 : 1 + Math.abs(stride) * 0.006;

    // Smoothed, expressive traveller: large mask, slim torso, segmented limbs,
    // rounded hand/foot ends, readable lean, and state-driven squash/stretch.
    g.fillStyle(0xa4e9d2, 0.09);
    g.fillEllipse(px, py + 18 * flip, 36, 9);
    g.save();
    g.translateCanvas(px, py - bob * flip);
    g.rotateCanvas(lean);
    g.scaleCanvas(squash, 1 / squash);

    // trailing cloak / shoulder silhouette
    g.fillStyle(p.dashTime > 0 ? 0xa8f0dc : 0xb76669);
    g.fillTriangle(-1, 2 * flip, -15 - p.vx * 0.025, 25 * flip, 13 - p.vx * 0.01, 22 * flip);
    g.fillStyle(0x8e4f58, 0.8);
    g.fillTriangle(-2, 7 * flip, -12 - p.vx * 0.02, 28 * flip, 8 - p.vx * 0.01, 26 * flip);

    const legY = 17 * flip;
    const kneeY = 25 * flip;
    const footY = 32 * flip;
    const leftKnee = 4 - stride * 0.7;
    const rightKnee = 5 + stride * 0.7;
    g.lineStyle(5, 0x1a2830, 1);
    g.lineBetween(-4, legY, leftKnee, kneeY);
    g.lineBetween(leftKnee, kneeY, leftKnee - stride * 0.7, footY);
    g.lineBetween(5, legY, rightKnee, kneeY);
    g.lineBetween(rightKnee, kneeY, rightKnee + stride * 0.7, footY);
    g.fillStyle(0x1a2830);
    g.fillCircle(leftKnee - stride * 0.7, footY, 3);
    g.fillCircle(rightKnee + stride * 0.7, footY, 3);

    // slim torso
    g.fillStyle(p.dashTime > 0 ? 0xa4ebd7 : 0x9f5e65);
    g.fillRoundedRect(-7, 1 * flip, 14, 21, 6);
    g.fillStyle(0xd9b08d, 0.7);
    g.fillEllipse(0, 4 * flip, 8, 14);

    // two-segment arms with circular hands
    const armLift = p.attackTime > 0 ? -4 * flip : moving ? Math.sin(phase + Math.PI) * 3 : 0;
    const lead = p.face * (p.dashTime > 0 ? 6 : moving ? 2 : 0);
    g.lineStyle(4.5, 0x1b2a31, 1);
    g.lineBetween(-7, 5 * flip, -11 - lead * 0.3, (10 + armLift) * flip);
    g.lineBetween(-11 - lead * 0.3, (10 + armLift) * flip, -14 - lead, (16 + armLift) * flip);
    g.lineBetween(7, 5 * flip, 10 + lead * 0.3, (10 - armLift) * flip);
    g.lineBetween(10 + lead * 0.3, (10 - armLift) * flip, 14 + lead, (16 - armLift) * flip);
    g.fillStyle(0xd5b190);
    g.fillCircle(-14 - lead, (16 + armLift) * flip, 3.2);
    g.fillCircle(14 + lead, (16 - armLift) * flip, 3.2);

    // oversized head / mask, with eye direction and simple horn personality
    g.fillStyle(0xefdfb8);
    g.fillEllipse(0, -11 * flip, 26, 24);
    g.fillStyle(0x213b43);
    const eyeShift = p.face * 3;
    g.fillEllipse(-4 + eyeShift, -11 * flip, 3.2, 6.5);
    g.fillEllipse(4 + eyeShift, -11 * flip, 3.2, 6.5);
    g.fillStyle(colors[3], 0.95);
    g.fillTriangle(-2, -20 * flip, -15, -33 * flip, -7, -18 * flip);
    g.fillTriangle(3, -20 * flip, 13, -31 * flip, 8, -17 * flip);
    g.restore();

    if (p.dashTime > 0 && this.playing) {
      g.lineStyle(6, colors[3], 0.22);
      for (let n = 1; n <= 3; n++)
        g.lineBetween(px - p.face * (12 + n * 12), py + 2, px - p.face * (28 + n * 16), py + 2);
    }
    // A restrained field of motes makes depth legible without obscuring hazards.
    if (this.playing)
      for (let n = 0; n < 24; n++) {
        const x = (n * 139 + Math.sin(w.time * 0.3 + n) * 13) % (COLS * TILE);
        const y =
          220 +
          ((n * 173) % (ROWS * TILE - 260)) +
          Math.sin(w.time * 0.6 + n) * 9;
        g.fillStyle(0xecd99b, 0.25 + Math.sin(w.time + n) * 0.12);
        g.fillCircle(x, y, 1.3);
      }
    if (p.attackTime > 0 && this.playing) {
      g.lineStyle(4, 0xf6e4b4);
      const y = p.y + (p.gravity > 0 ? 44 : -16);
      g.lineBetween(p.x - 8, y, p.x + 28, y);
    }
    if (p.grapple) {
      const a = this.room.objects.find((o) => o.id === p.grapple);
      if (a) {
        g.lineStyle(2, 0xe4d7ad);
        g.lineBetween(p.x + 10, p.y + 14, a.x * 32 + 16, a.y * 32 + 16);
      }
    }
    if (p.charging) {
      g.fillStyle(0xd9d09c);
      g.fillRect(p.x - 8, p.y - 12, Math.min(1, p.charge / 0.45) * 36, 4);
    }
  }
}
