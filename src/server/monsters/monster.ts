import type { MapName } from '../../shared/constants.js';

export type MonsterKind = 'skeleton';

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
  skeleton:
    'An animated pile of bones held together by dark magic, endlessly wandering the Labyrinth in search of the living.',
};

export function monsterDescriptionFor(kind: MonsterKind): string {
  return MONSTER_DESCRIPTIONS[kind];
}
