// A later follow-up ask: "followers should move as fast as the player,
// even with speed enhancements active." Shared by all three follower
// managers (pet/tamedBeast/animatedMonster) rather than tripled inline —
// see each manager's own tickAll doc comment for why this exists (the
// follower step tick runs at a flat cadence matching the player's
// UNBUFFED move speed, so a buffed owner's follower needs to take more
// than one step per tick to actually keep pace, rather than the tick
// itself needing to speed up).
import type { PlayerState } from '../worlds/types.js';
import { effectiveMoveCooldownMs, BASE_MOVE_COOLDOWN_MS } from '../../shared/skills.js';

// A later follow-up ask: "the followers still don't match speed, just
// with haste activated my battlemage was able to outrun the pet cat" —
// the original Math.round(BASE_MOVE_COOLDOWN_MS / cooldown) rounded any
// SINGLE modest buff (haste alone cuts cooldown ~10%, wisp/flight alone
// ~20%) straight back down to 1 step/tick, identical to unbuffed —only
// several buffs STACKED past a 1.5x ratio ever rounded up to 2. Real
// proportional speed needs a fractional carry: each call adds the exact
// (possibly non-integer) ratio to a per-follower accumulator and only
// steps on whole units, carrying the remainder to the next tick, so a
// 1.11x ratio nets an extra step roughly once every 9 ticks instead of
// never. Keyed by a caller-supplied id (unique per follower) so each
// pet/beast/animated-monster carries its own independent remainder.
const followerSpeedAccumulators = new Map<string, number>();

export function stepsForOwnerSpeed(id: string, owner: PlayerState | undefined): number {
  if (!owner) return 1;
  const cooldown = effectiveMoveCooldownMs({
    celeritasActive: owner.celeritasActive,
    wispActive: owner.wispActive,
    flightActive: owner.flightActive,
    beastTransformActive: owner.beastTransformActive,
    beastTransformKind: owner.beastTransformKind,
    dexterity: owner.dexterity,
    bootsItem: owner.equipment.boots,
  });
  const ratio = BASE_MOVE_COOLDOWN_MS / cooldown;
  const total = (followerSpeedAccumulators.get(id) ?? 0) + ratio;
  const steps = Math.max(1, Math.floor(total));
  followerSpeedAccumulators.set(id, total - steps);
  return steps;
}

// Called whenever a follower is permanently gone (death, manual remove,
// owner disconnect) so a stale id doesn't sit in the map forever — pets/
// tamed beasts are keyed one-per-owner (same cardinality as their own
// manager's Map, already accepted), but an animated monster's id is
// freshly generated per summon, so this one actually would grow
// unbounded over a long server uptime without cleanup.
export function clearFollowerSpeedAccumulator(id: string): void {
  followerSpeedAccumulators.delete(id);
}
