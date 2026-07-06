// Fixed-rate authoritative simulation loop, decoupled from client frame
// rate and from how often input messages arrive over the network.
export class GameLoop {
  constructor({ tickRate, onTick }) {
    this.tickIntervalMs = 1000 / tickRate;
    this.onTick = onTick;
    this.timer = null;
    this.lastTime = 0;
  }

  start() {
    this.lastTime = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.onTick(dt);
    }, this.tickIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
