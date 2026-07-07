// Experience needed to go from a given level to the next: level x 100.
// Pure and dependency-free, same reasoning as game/resolveMove.ts — it's
// consulted both when awarding exp (this file) and when building a
// PlayerSnapshot (GameGateway.snapshotFor) for the client's XP bar.
export function maxTnlForLevel(level: number): number {
  return level * 100;
}

export interface LevelState {
  level: number;
  exp: number;
}

// Scales a monster's base exp reward by how its level compares to the
// player's, using monsterLevel x 10 as the reference point: a player
// exactly at that level gets the flat base reward, a lower-level player
// gets proportionally more (a monster is "relatively tougher" for them),
// and a higher-level player gets proportionally less (diminishing returns
// for outleveling the monster) — never less than 1. See
// GameGateway.resolveAttackExchange.
export function monsterExpGain(baseReward: number, playerLevel: number, monsterLevel: number): number {
  const ratio = (monsterLevel * 10) / playerLevel;
  return Math.max(1, Math.round(baseReward * ratio));
}

// "murder <player>" — a flat multiple of the victim's level, unrelated to
// monsterExpGain's scaling (a player kill is a fixed, predictable reward
// regardless of the killer's own level). See GameGateway.resolveMurderExchange.
export const PLAYER_KILL_EXP_PER_LEVEL = 100;

export function playerKillExpGain(victimLevel: number): number {
  return PLAYER_KILL_EXP_PER_LEVEL * victimLevel;
}

// Applies an experience gain, rolling over into as many level-ups as the
// gain warrants — a loop rather than a single check, so one big gain that
// happens to cross more than one threshold is handled correctly, not just
// the common case of one kill's worth of progress.
export function applyExpGain(state: LevelState, gained: number): LevelState {
  let { level, exp } = state;
  exp += gained;

  let maxTnl = maxTnlForLevel(level);
  while (exp >= maxTnl) {
    exp -= maxTnl;
    level += 1;
    maxTnl = maxTnlForLevel(level);
  }

  return { level, exp };
}
