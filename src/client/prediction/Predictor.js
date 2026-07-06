import { stepPosition } from '../../shared/movement.js';

// Client-side prediction + server reconciliation for the local player only.
// Remote players are never predicted, just interpolated (see
// InterpolationBuffer) since we don't have their future input.
export class Predictor {
  constructor(initial) {
    this.x = initial.x;
    this.y = initial.y;
    this.pendingInputs = [];
  }

  // Apply an input locally right away, and remember it so it can be
  // replayed on top of the next authoritative correction from the server.
  applyInput(input, dt) {
    const next = stepPosition({ x: this.x, y: this.y }, input, dt);
    this.x = next.x;
    this.y = next.y;
    this.pendingInputs.push({ ...input, dt });
  }

  // Snap to the server's authoritative position, drop any inputs the
  // server has already processed, then replay whatever's left so inputs
  // sent after the acknowledged one aren't lost (this is what makes
  // movement feel instant despite round-trip latency).
  reconcile(authoritative, lastProcessedSeq) {
    this.x = authoritative.x;
    this.y = authoritative.y;
    this.pendingInputs = this.pendingInputs.filter((i) => i.seq > lastProcessedSeq);

    for (const input of this.pendingInputs) {
      const next = stepPosition({ x: this.x, y: this.y }, input, input.dt);
      this.x = next.x;
      this.y = next.y;
    }
  }
}
