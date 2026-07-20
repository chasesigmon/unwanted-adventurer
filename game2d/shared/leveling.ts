// The player exp-to-next-level curve — split out from
// server/combat/formulas.ts (which still owns applyExpGain/LevelState,
// the actual level-up mutation) so the CLIENT can also compute "how much
// more exp until the next level" for the character sheet (a follow-up
// ask: "add EXP TNL... update automatically when a player gains exp")
// without importing server-only code into a client bundle.
//
// linear-in-level curve, tuned so a level fighting same-level monsters
// takes on the order of 8 kills to level up — see
// tests/verify-balance-sim.mjs for the simulated 1-10 grind this was
// tuned against.
export const TNL_PER_LEVEL = 250;

export function maxTnlForLevel(level: number): number {
  return level * TNL_PER_LEVEL;
}
