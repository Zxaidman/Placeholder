/** Presentation only; independent of simulation and replay physics. */
export class PlatformCamera {
  x = 0;
  y = 0;
  ready = false;
  peekTime = 0;
  reset() {
    this.ready = false;
    this.peekTime = 0;
  }
  update(
    p: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      grounded: boolean;
      gravity: number;
    },
    width: number,
    height: number,
    dt: number,
    lookDown = false,
  ) {
    const px = p.x + 10,
      py = p.y + 14;
    if (
      !this.ready ||
      Math.abs(py - this.y) > height * 1.5 ||
      Math.abs(px - this.x) > width * 1.5
    ) {
      this.x = px;
      this.y = py + height * 0.08 * p.gravity;
      this.ready = true;
    }
    const ease = 1 - Math.exp(-Math.min(dt, 0.05) * 5);
    const look = Math.max(-width * 0.18, Math.min(width * 0.18, p.vx * 0.3));
    this.x += (px + look - this.x) * ease;
    // Keep the takeoff platform in view throughout ordinary jumps.
    let target = this.y;
    this.peekTime =
      lookDown && p.grounded && Math.abs(p.vx) < 40
        ? Math.min(0.8, this.peekTime + Math.min(dt, 0.05))
        : 0;
    if (p.grounded)
      target = py + height * (this.peekTime > 0.25 ? 0.28 : 0.08) * p.gravity;
    else {
      // Measure along gravity so inverted jumps receive identical framing.
      const offset = (py - this.y) * p.gravity;
      if (offset < -height * 0.25) target = py + height * 0.25 * p.gravity;
      if (offset > height * 0.14) target = py - height * 0.14 * p.gravity;
      if (p.vy * p.gravity > 420) target = py + height * 0.12 * p.gravity;
    }
    this.y += (target - this.y) * (1 - Math.exp(-Math.min(dt, 0.05) * 3.5));
    return { x: this.x, y: this.y };
  }
}
