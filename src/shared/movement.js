import { PLAYER_SPEED, PLAYER_RADIUS, WORLD_WIDTH, WORLD_HEIGHT } from './constants.js';

// Pure, deterministic movement step. Imported by both the server's
// authoritative simulation and the client's local prediction so the two
// can never drift apart from divergent physics code.
export function stepPosition(pos, input, dt) {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;

  let x = pos.x;
  let y = pos.y;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    x += (dx / len) * PLAYER_SPEED * dt;
    y += (dy / len) * PLAYER_SPEED * dt;
  }

  x = Math.max(PLAYER_RADIUS, Math.min(WORLD_WIDTH - PLAYER_RADIUS, x));
  y = Math.max(PLAYER_RADIUS, Math.min(WORLD_HEIGHT - PLAYER_RADIUS, y));

  return { x, y };
}
