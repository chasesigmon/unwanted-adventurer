import type { MapName, MonsterKind, MonsterClass } from '../../shared/constants.js';
import type { CombatantStats } from '../combat/formulas.js';
import { WILD_GOBLIN_EXP_REWARD, WILD_SKELETON_EXP_REWARD } from '../combat/formulas.js';
import { PUNCH_SKILL, DAGGER_SKILL } from '../../shared/skills.js';

// A wild monster is a plain in-memory record — no account, no login, not
// persisted (population/position reset on server restart, same tradeoff
// the text game's own monster-manager.service.ts makes and documents).
export interface Monster extends CombatantStats {
  id: string;
  kind: MonsterKind;
  monsterClass: MonsterClass;
  mapName: MapName;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  expReward: number;
  // Rolled independently per entry at spawn time (see
  // MonsterSpecies.carriedItemRolls) — extra items its corpse drops
  // alongside the usual body part, and (while alive) what the
  // counter-attack overlay shows it wielding (first weapon-slot item, if
  // any). A monster can end up carrying none, one, or several at once.
  carriedItems: string[];
  // A real skill percent, same shape as a player's own client.data.skills
  // — every monster always knows punch; one carrying a weapon (see
  // carriedItems) also knows the matching weapon skill. Its counter-attack
  // damage (see game.gateway.ts's resolveMonsterCounterAttack) is computed
  // through the exact same punchDamage()/weaponBonusFor() formula a player
  // uses, at this percent, instead of a flat made-up number.
  skills: Record<string, number>;
}

export interface CarriedItemRoll {
  label: string;
  // 0-1 chance, rolled independently of any other entry, once per
  // spawned instance.
  chance: number;
}

export interface MonsterSpecies {
  kind: MonsterKind;
  monsterClass: MonsterClass;
  homeMap: MapName;
  // How many of this species should exist at once.
  maxCount: number;
  startingHp: number;
  expReward: number;
  carriedItemRolls?: CarriedItemRoll[];
}

// Every wild monster starts at level 1 with every attribute at 1 — so a
// level-1 player vs. a level-1 monster is exactly neutral by default,
// same convention as the text game's MONSTER_LEVEL/MONSTER_BASE_ATTRIBUTE.
export const MONSTER_LEVEL = 1;
export const MONSTER_BASE_ATTRIBUTE = 1;
// A wild monster's proficiency at whatever it's swinging — a real
// combatant, not a fresh level-1 character still practicing, but not
// maxed out either. Same percent for punch and (if it's carrying one) its
// weapon skill.
export const MONSTER_SKILL_PERCENT = 50;

// Every monster always knows how to punch; one carrying a weapon whose
// name contains "dagger" also knows the dagger skill — called once at
// spawn time (see MonsterManagerService.spawnOne) with that instance's
// own rolled carriedItems.
export function skillsForCarriedItems(carriedItems: string[]): Record<string, number> {
  const skills: Record<string, number> = { [PUNCH_SKILL]: MONSTER_SKILL_PERCENT };
  if (carriedItems.some((item) => item.toLowerCase().includes('dagger'))) {
    skills[DAGGER_SKILL] = MONSTER_SKILL_PERCENT;
  }
  return skills;
}

export const MONSTER_SPECIES: MonsterSpecies[] = [
  {
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Great Plains',
    maxCount: 15,
    startingHp: 15,
    expReward: WILD_GOBLIN_EXP_REWARD,
  },
  {
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Labyrinth',
    maxCount: 10,
    startingHp: 20,
    expReward: WILD_SKELETON_EXP_REWARD,
    carriedItemRolls: [
      { label: 'bone dagger', chance: 0.3 },
      { label: 'bone shield', chance: 0.2 },
    ],
  },
];
