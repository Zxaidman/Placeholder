import { z } from "zod";
import { emptyInput, type Input } from "./physics";
const point = z.object({
  x: z.number().min(0).max(95),
  y: z.number().min(0).max(90),
  texture: z
    .string()
    .max(360000)
    .refine((s) => !s || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s))
    .default(""),
});
export const controlsSchema = z.object({
  version: z.literal("1.0.0"),
  mode: z.enum(["joystick", "buttons"]),
  scale: z.number().min(0.6).max(1.5),
  opacity: z.number().min(0.2).max(1),
  positions: z.record(z.string(), point),
  arrows: z.boolean().default(true),
});
export type ControlPreset = z.infer<typeof controlsSchema>;
export const defaults = (): ControlPreset => ({
  version: "1.0.0",
  mode: "joystick",
  scale: 1,
  opacity: 0.8,
  arrows: true,
  positions: {
    stick: { x: 6, y: 64, texture: "" },
    left: { x: 3, y: 68, texture: "" },
    right: { x: 19, y: 68, texture: "" },
    down: { x: 11, y: 75, texture: "" },
    jump: { x: 87, y: 66, texture: "" },
    dash: { x: 76, y: 73, texture: "" },
    attack: { x: 80, y: 47, texture: "" },
    hook: { x: 90, y: 41, texture: "" },
  },
});
export class Controls {
  preset = defaults();
  editing = false;
  enabled = false;
  keys = new Set<string>();
  touch = new Map<string, Input>();
  private resetPointers: Array<() => void> = [];
  onLayout = () => {};
  onPause = () => {};
  constructor(public element: HTMLElement) {
    element.innerHTML =
      '<div id="stick" class="control" aria-label="Movement joystick"><span></span></div>' +
      ["left", "right", "down", "jump", "dash", "attack", "hook"]
        .map(
          (k) =>
            `<button class="control" id="${k}" aria-label="${k}">${({ left: "◀", right: "▶", down: "▼" } as Record<string, string>)[k] || k}</button>`,
        )
        .join("");
    window.addEventListener("keydown", (e) => {
      if (
        (e.target as HTMLElement).matches("input,select,textarea") ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.code === "Escape") {
        this.onPause();
        return;
      }
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyA",
          "KeyD",
          "KeyS",
          "KeyW",
          "KeyJ",
          "KeyK",
          "KeyX",
          "KeyE",
        ].includes(e.code)
      ) {
        if (this.enabled) e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.release();
      if (this.enabled) this.onPause();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.release();
        if (this.enabled) this.onPause();
      }
    });
    for (const el of element.querySelectorAll<HTMLElement>(".control")) {
      let pointer: number | null = null;
      const move = (e: PointerEvent) => {
        if (this.editing) {
          const r = element.getBoundingClientRect(),
            p = this.preset.positions[el.id];
          p.x = Math.max(
            0,
            Math.min(
              95,
              ((e.clientX - r.left - el.offsetWidth / 2) / r.width) * 100,
            ),
          );
          p.y = Math.max(
            0,
            Math.min(
              90,
              ((e.clientY - r.top - el.offsetHeight / 2) / r.height) * 100,
            ),
          );
          this.apply();
          return;
        }
        const i = emptyInput();
        if (el.id === "stick") {
          const r = el.getBoundingClientRect(),
            dx = (e.clientX - r.left - r.width / 2) / (r.width / 2),
            dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
          i.axis = Math.abs(dx) > 0.2 ? Math.sign(dx) : 0;
          i.down = dy > 0.35;
          el.querySelector<HTMLElement>("span")!.style.transform =
            `translate(${Math.max(-25, Math.min(25, dx * 25))}px,${Math.max(-25, Math.min(25, dy * 25))}px)`;
        } else if (el.id === "left" || el.id === "right")
          i.axis = el.id === "left" ? -1 : 1;
        else i[el.id as "jump" | "dash" | "attack" | "hook" | "down"] = true;
        this.touch.set(el.id, i);
      };
      el.onpointerdown = (e) => {
        e.preventDefault();
        if (pointer !== null) return;
        el.classList.add("pressed");
        pointer = e.pointerId;
        el.setPointerCapture(pointer);
        move(e);
      };
      el.onpointermove = (e) => {
        if (pointer === e.pointerId) move(e);
      };
      const up = (e: PointerEvent) => {
        if (pointer !== e.pointerId) return;
        el.classList.remove("pressed");
        pointer = null;
        this.touch.delete(el.id);
        if (el.id === "stick")
          el.querySelector<HTMLElement>("span")!.style.transform = "";
        if (this.editing) this.onLayout();
      };
      this.resetPointers.push(() => {
        if (pointer !== null && el.hasPointerCapture(pointer))
          el.releasePointerCapture(pointer);
        pointer = null;
      });
      el.onpointerup = up;
      el.onpointercancel = up;
      el.onlostpointercapture = up;
    }
    this.apply();
  }
  apply() {
    this.element.dataset.mode = this.preset.mode;
    this.element.classList.toggle("editing", this.editing);
    this.element.hidden = !this.enabled && !this.editing;
    for (const el of this.element.querySelectorAll<HTMLElement>(".control")) {
      const p = this.preset.positions[el.id] || defaults().positions[el.id];
      el.style.left = `min(${p.x}%, calc(100% - ${el.offsetWidth * this.preset.scale}px))`;
      el.style.top = `min(${p.y}%, calc(100% - ${el.offsetHeight * this.preset.scale}px))`;
      el.style.opacity = String(this.preset.opacity);
      el.style.transform = `scale(${this.preset.scale})`;
      el.style.backgroundImage = p.texture ? `url("${p.texture}")` : "";
    }
  }
  availability(
    abilities: {
      dash: boolean;
      longDash: boolean;
      pogo: boolean;
      grapple: boolean;
      swing: boolean;
    },
    dashReady: boolean,
  ) {
    for (const [id, locked] of [
      ["dash", !abilities.dash && !abilities.longDash],
      ["attack", !abilities.pogo],
      ["hook", !abilities.grapple && !abilities.swing],
    ] as const) {
      const el = this.element.querySelector<HTMLElement>("#" + id)!;
      el.classList.toggle("ability-locked", locked);
      el.setAttribute("aria-disabled", String(locked));
    }
    this.element.querySelector("#dash")!.classList.toggle("spent", !dashReady);
  }
  read(): Input {
    const k = this.keys,
      i: Input = {
        axis:
          Number(k.has("KeyD") || k.has("ArrowRight")) -
          Number(k.has("KeyA") || k.has("ArrowLeft")),
        down: k.has("KeyS") || k.has("ArrowDown"),
        jump: k.has("Space") || k.has("KeyW") || k.has("ArrowUp"),
        dash: k.has("ShiftLeft") || k.has("ShiftRight") || k.has("KeyK"),
        attack: k.has("KeyJ") || k.has("KeyX"),
        hook: k.has("KeyE"),
      };
    for (const t of this.touch.values()) {
      if (t.axis) i.axis = t.axis;
      i.down ||= t.down;
      i.jump ||= t.jump;
      i.dash ||= t.dash;
      i.attack ||= t.attack;
      i.hook ||= t.hook;
    }
    return i;
  }
  release() {
    for (const reset of this.resetPointers) reset();
    this.keys.clear();
    this.touch.clear();
    for (const el of this.element.querySelectorAll<HTMLElement>(".control")) {
      el.classList.remove("pressed");
    }
    const knob = this.element.querySelector<HTMLElement>("#stick span");
    if (knob) knob.style.transform = "";
  }
}
