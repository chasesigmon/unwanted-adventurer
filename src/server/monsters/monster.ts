import type { MapName } from '../../shared/constants.js';

// "skeleton" was renamed to "wild skeleton" to disambiguate it from the
// player-choosable "skeleton" race (see shared/constants.ts's RACES) —
// otherwise "a skeleton is here!" would be ambiguous between a monster
// and another player who happens to be that race.
export type MonsterKind = 'wild skeleton' | 'wild goblin';

export interface Monster {
  id: string;
  kind: MonsterKind;
  hp: number;
  maxHp: number;
  mana: number;
  movement: number;
  mapName: MapName;
  row: number;
  col: number;
  // Awarded to whichever player lands the killing blow.
  expReward: number;
  // Whether anti-undead mechanics (currently just "lesser undead
  // resistance", see players/skills.ts) apply to this monster's attacks.
  undead: boolean;
  // Same shape as a player's own level/attributes — lets "examine"'s
  // power-comparison message and the attack-damage attribute bonus (see
  // GameGateway.attributeAttackBonus) treat a monster opponent exactly
  // like a player opponent. Every monster kind currently shares the same
  // baseline (see MonsterManagerService's MONSTER_BASE_* constants).
  level: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
}

// Flavor text for "examine <monster>" — every MonsterKind should have one.
const MONSTER_DESCRIPTIONS: Record<MonsterKind, string> = {
  'wild skeleton':
    'An animated pile of bones held together by dark magic, endlessly wandering the Labyrinth in search of the living.',
  'wild goblin':
    'A feral, unkempt goblin that has never known a settlement, roaming the Great Plains in search of easy prey.',
};

export function monsterDescriptionFor(kind: MonsterKind): string {
  return MONSTER_DESCRIPTIONS[kind];
}
