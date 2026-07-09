import type { MapName, MonsterKind } from '../../shared/constants.js';
import type { CombatantStats } from '../combat/formulas.js';
import { WILD_GOBLIN_EXP_REWARD, WILD_SKELETON_EXP_REWARD } from '../combat/formulas.js';

// A wild monster is a plain in-memory record — no account, no login, not
// persisted (population/position reset on server restart, same tradeoff
// the text game's own monster-manager.service.ts makes and documents).
export interface Monster extends CombatantStats {
  id: string;
  kind: MonsterKind;
  mapName: MapName;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  expReward: number;
}

export interface MonsterSpecies {
  kind: MonsterKind;
  homeMap: MapName;
  // How many of this species should exist at once — 0 means "a real,
  // combat-capable monster kind, just not actively spawned anywhere yet".
  maxCount: number;
  startingHp: number;
  expReward: number;
}

// Every wild monster starts at level 1 with every attribute at 1 — so a
// level-1 player vs. a level-1 monster is exactly neutral by default,
// same convention as the text game's MONSTER_LEVEL/MONSTER_BASE_ATTRIBUTE.
export const MONSTER_LEVEL = 1;
export const MONSTER_BASE_ATTRIBUTE = 1;

export const MONSTER_SPECIES: MonsterSpecies[] = [
  { kind: 'wild goblin', homeMap: 'Great Plains', maxCount: 5, startingHp: 15, expReward: WILD_GOBLIN_EXP_REWARD },
  { kind: 'wild skeleton', homeMap: 'Labyrinth', maxCount: 0, startingHp: 20, expReward: WILD_SKELETON_EXP_REWARD },
];
