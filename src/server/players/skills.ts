// Permanent player abilities, learned (never lost) from consuming certain
// dropped items — see items/item-manager.service.ts and
// GameGateway.handleConsume. Pure and dependency-free, same reasoning as
// leveling.ts.
export const LESSER_UNDEAD_RESISTANCE = 'lesser undead resistance';

// How much a player's known skills reduce an incoming hit from an undead
// monster. Only one skill affects this so far; kept as a function (not a
// flat lookup) so it stays the single place this rule lives as more skills
// are added.
export function undeadDamageReduction(skills: string[]): number {
  return skills.includes(LESSER_UNDEAD_RESISTANCE) ? 1 : 0;
}
