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

export function stepsForOwnerSpeed(owner: PlayerState | undefined): number {
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
  return Math.max(1, Math.round(BASE_MOVE_COOLDOWN_MS / cooldown));
}
