/** Presentation only; independent of simulation and replay physics. */
export class PlatformCamera {
  x = 0;
  y = 0;
  ready = false;
  reset() {
    this.ready = false;
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
    if (p.grounded) target = py + height * 0.08 * p.gravity;
    else {
      const top = this.y - height * 0.25,
        bottom = this.y + height * 0.14;
      if (py < top) target = py + height * 0.25;
      if (py > bottom) target = py - height * 0.14;
      // Anticipate a long fall, without chasing every small jump.
      if (p.vy * p.gravity > 420) target = py + height * 0.12 * p.gravity;
    }
    this.y += (target - this.y) * (1 - Math.exp(-Math.min(dt, 0.05) * 3.5));
    return { x: this.x, y: this.y };
  }
}
