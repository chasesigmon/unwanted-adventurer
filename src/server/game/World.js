import { config } from '../config.js';

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// Owns all authoritative game state for a single arena: players and orbs.
// Nothing outside World is allowed to mutate player position/score directly.
export class World {
  constructor() {
    this.players = new Map(); // socket id -> PlayerState
    this.orbs = new Map(); // orb id -> { id, x, y }
    this.nextOrbId = 1;
    this.spawnOrbs(config.orbCount);
  }

  spawnOrb() {
    const id = this.nextOrbId++;
    const orb = {
      id,
      x: randRange(config.orbRadius, config.worldWidth - config.orbRadius),
      y: randRange(config.orbRadius, config.worldHeight - config.orbRadius),
    };
    this.orbs.set(id, orb);
    return orb;
  }

  spawnOrbs(count) {
    for (let i = 0; i < count; i++) this.spawnOrb();
  }

  addPlayer(playerState) {
    this.players.set(playerState.id, playerState);
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  applyInput(id, input) {
    const player = this.players.get(id);
    if (player) player.setInput(input);
  }

  say(id, text) {
    const player = this.players.get(id);
    if (player) player.say(text);
  }

  step(dt) {
    for (const player of this.players.values()) {
      player.step(dt);
      this.checkOrbCollisions(player);
    }
  }

  checkOrbCollisions(player) {
    const captureDist = config.playerRadius + config.orbRadius;
    const orbsSnapshot = Array.from(this.orbs.values());
    for (const orb of orbsSnapshot) {
      if (!this.orbs.has(orb.id)) continue; // already captured this tick
      const dist = Math.hypot(player.x - orb.x, player.y - orb.y);
      if (dist <= captureDist) {
        this.orbs.delete(orb.id);
        player.score += config.orbValue;
        this.spawnOrb();
      }
    }
  }

  getSnapshot() {
    return {
      t: Date.now(),
      players: Array.from(this.players.values()).map((p) => p.toSnapshot()),
      orbs: Array.from(this.orbs.values()),
    };
  }

  getLeaderboard(limit = 10) {
    return Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((p) => ({ username: p.username, score: p.score }));
  }
}
