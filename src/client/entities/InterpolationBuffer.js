import { INTERPOLATION_DELAY_MS } from '../../shared/constants.js';

// Buffers recent authoritative positions for a single remote entity and
// lerps between them at a fixed render delay, so remote players move
// smoothly despite snapshots arriving at a lower, irregular rate.
export class InterpolationBuffer {
  constructor() {
    this.buffer = [];
  }

  push(t, x, y) {
    this.buffer.push({ t, x, y });
    while (this.buffer.length > 20) this.buffer.shift();
  }

  getInterpolated(renderTime) {
    const buf = this.buffer;
    if (buf.length === 0) return null;
    if (buf.length === 1) return { x: buf[0].x, y: buf[0].y };

    for (let i = 0; i < buf.length - 1; i++) {
      const a = buf[i];
      const b = buf[i + 1];
      if (renderTime >= a.t && renderTime <= b.t) {
        const span = b.t - a.t || 1;
        const alpha = (renderTime - a.t) / span;
        return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
      }
    }
    const last = buf[buf.length - 1];
    return { x: last.x, y: last.y };
  }
}

export { INTERPOLATION_DELAY_MS };
