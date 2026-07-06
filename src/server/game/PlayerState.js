import { stepPosition } from '../../shared/movement.js';

// In-memory authoritative state for one connected player. The server is the
// only thing that ever mutates x/y/score here — clients only ever submit
// input and receive read-only snapshots.
export class PlayerState {
  constructor({ id, username, color, x, y, score = 0 }) {
    this.id = id; // socket id
    this.username = username;
    this.color = color;
    this.x = x;
    this.y = y;
    this.score = score;
    this.input = { up: false, down: false, left: false, right: false, seq: 0 };
    this.lastProcessedInput = 0;
    this.chat = null; // { text, expiresAt }
  }

  setInput(input) {
    if (input.seq <= this.lastProcessedInput) return; // stale/out-of-order, ignore
    this.input = input;
  }

  say(text) {
    this.chat = { text: String(text).slice(0, 140), expiresAt: Date.now() + 5000 };
  }

  step(dt) {
    const next = stepPosition({ x: this.x, y: this.y }, this.input, dt);
    this.x = next.x;
    this.y = next.y;
    this.lastProcessedInput = this.input.seq;

    if (this.chat && Date.now() > this.chat.expiresAt) this.chat = null;
  }

  toSnapshot() {
    return {
      id: this.id,
      username: this.username,
      color: this.color,
      x: Math.round(this.x * 100) / 100,
      y: Math.round(this.y * 100) / 100,
      score: this.score,
      chat: this.chat ? this.chat.text : null,
      lastProcessedInput: this.lastProcessedInput,
    };
  }
}
