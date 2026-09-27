import Phaser from "phaser";
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
  palace: [0x10202b, 0x8eaaa0, 0x536f73],
  garden: [0x101e20, 0x9fbc87, 0x4b7662],
  furnace: [0x231b28, 0xc8a389, 0x855b6a],
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
  playZoom = 1.7;
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
    this.dynamic = this.add.graphics();
    this.playerSprite = this.add
      .sprite(0, 0, "tiles", 260)
      .setOrigin(0)
      .setDisplaySize(26, 34);
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
    this.accumulator = 0;
    this.log = [];
    this.recording = true;
    this.rebuild();
  }
  rebuild() {
    if (!this.art || !this.room) return;
    this.art.removeAll(true);
    const g = this.add.graphics();
    this.art.add(g);
    const colors = palettes[this.room.theme];
    g.fillStyle(colors[0]);
    g.fillRect(0, 0, COLS * TILE, ROWS * TILE);
    g.lineStyle(1, colors[2], this.playing ? 0.1 : 0.3);
    for (let x = 0; x <= COLS; x++)
      g.lineBetween(x * TILE, 0, x * TILE, ROWS * TILE);
    for (let y = 0; y <= ROWS; y++)
      g.lineBetween(0, y * TILE, COLS * TILE, y * TILE);
    for (const o of this.room.objects.filter((o) => o.kind === "solid")) {
      const r = rect(o, 0);
      g.fillStyle(colors[2], 0.6);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(colors[1]);
      g.fillRect(r.x, r.y, r.w, 3);
      for (let x = 0; x < o.w; x++)
        this.art.add(
          this.add
            .image(r.x + x * TILE + 16, r.y + 17, "tiles", 7)
            .setDisplaySize(28, 28)
            .setTint(colors[2]),
        );
    }
  }
  update(_t: number, delta: number) {
    if (!this.room || !this.dynamic) return;
    if (this.playing && !this.paused) {
      this.accumulator += Math.min(delta / 1000, 0.05);
      while (this.accumulator >= STEP) {
        this.accumulator -= STEP;
        const input = this.hooks.input();
        if (this.recording) {
          if (this.world.frames < 144000) recordInput(this.log, input);
          else this.recording = false;
        }
        const event = this.world.tick(input);
        if (this.world.lastEvent) this.hooks.sound(this.world.lastEvent);
        if (event) {
          if (event.type === "exit") this.paused = true;
          this.hooks.event(event, this.log);
          if (event.type === "exit") break;
        }
      }
      this.hooks.hud(this.world);
    }
    const camera = this.cameras.main;
    if (this.playing) {
      camera.setZoom((this.scale.height / 440) * this.playZoom);
      camera.setBounds(0, 0, COLS * TILE, ROWS * TILE);
      camera.centerOn(this.world.player.x + 10, this.world.player.y - 45);
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
    for (const o of this.room.objects.filter((o) => o.kind !== "solid")) {
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
          break;
        }
        case "spike": {
          g.fillStyle(0xd98282);
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
          g.lineStyle(3, 0xeac781);
          g.lineBetween(x + 6, y + 31, x + 6, y);
          g.fillStyle(0xeac781);
          g.fillTriangle(x + 7, y + 2, x + 28, y + 7, x + 7, y + 17);
          break;
        case "exit":
          g.lineStyle(3, 0xbbdfb4);
          g.strokeRect(x + 2, y + 1, r.w - 4, r.h - 2);
          g.fillStyle(0xbbdfb4, 0.2);
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
    this.playerSprite
      .setPosition(p.x - 3, p.y - 4)
      .setFlipX(p.face < 0)
      .setFlipY(p.gravity < 0)
      .setTint(p.dashTime > 0 ? 0x9cf7e0 : 0xf4e7b6);
    const stretch = this.playing && Math.abs(p.vy) > 250 ? 1.1 : 1;
    this.playerSprite.setDisplaySize(26 / stretch, 34 * stretch);
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
