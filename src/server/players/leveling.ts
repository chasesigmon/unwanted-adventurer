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
