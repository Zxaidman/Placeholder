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
  palace: [0x101f2b, 0xb3c7ad, 0x435d65],
  garden: [0x112928, 0xc6d7a0, 0x426b60],
  furnace: [0x282033, 0xe4ba97, 0x785868],
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
    this.framing.reset();
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
    // Distant palace silhouettes are drawn once per room, never collidable.
    for (let layer = 0; layer < 2; layer++) {
      const spacing = layer ? 244 : 180;
      for (let x = -80; x < COLS * TILE; x += spacing) {
        const top = 800 + (Math.abs(x * 13) % 7) * 19 + layer * 110;
        g.fillStyle(layer ? 0x29444c : 0x203841, layer ? 0.38 : 0.42);
        g.fillRect(x, top, 70, ROWS * TILE - top);
        g.fillEllipse(x + 35, top, 70, 150);
        g.fillStyle(colors[0], 0.7);
        g.fillRect(x + 14, top + 40, 42, 350);
        g.fillEllipse(x + 35, top + 40, 42, 105);
        g.lineStyle(2, colors[1], 0.06);
        g.lineBetween(x + 35, top + 10, x + 35, top + 380);
      }
    }
    // Soft pools of ambient light and hanging vegetation.
    for (let n = 0; n < 22; n++) {
      const x = (n * 193 + 73) % (COLS * TILE),
        y = 180 + ((n * 137) % (ROWS * TILE - 200));
      for (let radius = 120; radius > 0; radius -= 10) {
        g.fillStyle(0xb7dec7, 0.002);
        g.fillCircle(x, y, radius);
      }
      g.lineStyle(2, 0x5b9380, 0.18);
      g.lineBetween(x, 0, x + 12, y * 0.45);
      for (let j = 0; j < 8; j++) {
        g.fillStyle(0x5b9380, 0.16);
        g.fillEllipse(x + 12 + (j % 2 ? 5 : -5), y * 0.45 - j * 19, 16, 7);
      }
    }
    for (let x = 40; x < COLS * TILE; x += 320) {
      g.lineStyle(9, colors[2], 0.18);
      g.strokeRoundedRect(x, 960, 180, 650, { tl: 90, tr: 90, bl: 0, br: 0 });
      g.lineStyle(2, colors[1], 0.06);
      g.strokeRoundedRect(x + 11, 972, 158, 625, {
        tl: 79,
        tr: 79,
        bl: 0,
        br: 0,
      });
      const ly = 1040 + (x % 3) * 24;
      g.lineStyle(1, 0x87978c, 0.35);
      g.lineBetween(x + 200, 850, x + 200, ly);
      for (let radius = 65; radius > 5; radius -= 8) {
        g.fillStyle(0xe8c38a, 0.008);
        g.fillCircle(x + 200, ly, radius);
      }
      g.fillStyle(0xc8b385, 0.45);
      g.fillRoundedRect(x + 197, ly - 5, 6, 10, 2);
    }
    if (!this.playing) {
      g.lineStyle(1, colors[2], 0.25);
      for (let x = 0; x <= COLS; x++)
        g.lineBetween(x * TILE, 0, x * TILE, ROWS * TILE);
      for (let y = 0; y <= ROWS; y++)
        g.lineBetween(0, y * TILE, COLS * TILE, y * TILE);
    }
    for (const o of this.room.objects.filter((o) => o.kind === "solid")) {
      const r = rect(o, 0);
      g.fillStyle(0x0b171f);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle(colors[2]);
      g.fillRect(r.x, r.y + 5, r.w, Math.max(1, r.h - 5));
      g.fillStyle(0x101c25, 0.4);
      g.fillRect(
        r.x + 4,
        r.y + 17,
        Math.max(1, r.w - 8),
        Math.max(1, r.h - 17),
      );
      g.lineStyle(1, colors[1], 0.13);
      for (let y = r.y + 32; y < r.y + r.h; y += 32) {
        g.lineBetween(r.x, y, r.x + r.w, y);
        for (
          let x = r.x + (((y - r.y) / 32) % 2 ? 24 : 48);
          x < r.x + r.w;
          x += 64
        )
          g.lineBetween(x, y, x, Math.min(y + 32, r.y + r.h));
      }
      g.fillStyle(colors[1]);
      g.fillRect(r.x, r.y, r.w, 4);
      g.fillStyle(0x799d79);
      g.fillRect(r.x, r.y + 4, r.w, 3);
      for (let x = r.x + 7; x < r.x + r.w - 3; x += 19) {
        g.fillStyle(0x799d79, 0.7);
        g.fillTriangle(x, r.y + 5, x + 8, r.y + 5, x + 2, r.y + 13 + (x % 7));
        g.lineStyle(1, colors[1], 0.6);
        g.lineBetween(x, r.y, x - 3, r.y - 4);
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
    const px = p.x + 10,
      py = p.y + 14,
      flip = p.gravity;
    const stride =
      this.playing && p.grounded
        ? Math.sin(w.time * 19) * Math.min(3, Math.abs(p.vx) / 90)
        : 1;
    // Original botanical traveller: cream mask, coral cloak, flexible legs.
    g.fillStyle(0xa4e9d2, 0.07);
    g.fillCircle(px, py, 25);
    g.lineStyle(3, 0x101b26);
    g.lineBetween(px - 4, py + 5 * flip, px - 5 - stride, py + 14 * flip);
    g.lineBetween(px + 4, py + 5 * flip, px + 5 + stride, py + 14 * flip);
    g.fillStyle(p.dashTime > 0 ? 0xa3e9d5 : 0xb96567);
    g.fillTriangle(
      px,
      py - 6 * flip,
      px - 12 - p.vx * 0.006,
      py + 9 * flip,
      px + 11 - p.vx * 0.006,
      py + 9 * flip,
    );
    g.fillStyle(0xefdfb8);
    g.fillEllipse(px, py - 8 * flip, 18, 17);
    g.fillStyle(0x213b43);
    g.fillEllipse(px - 3 + p.face * 2, py - 8 * flip, 2.5, 5);
    g.fillEllipse(px + 3 + p.face * 2, py - 8 * flip, 2.5, 5);
    g.fillStyle(0x8cbea2);
    g.fillTriangle(
      px - 1,
      py - 15 * flip,
      px - 11,
      py - 24 * flip,
      px - 6,
      py - 13 * flip,
    );
    g.fillTriangle(
      px + 1,
      py - 15 * flip,
      px + 9,
      py - 22 * flip,
      px + 6,
      py - 13 * flip,
    );
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
