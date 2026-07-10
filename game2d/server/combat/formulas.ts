// Pure, dependency-free combat/leveling formulas — mirrors the shape of
// the text game's own src/server/players/leveling.ts and skills.ts, sized
// down to this project's smaller scope (one active attack — punch — but
// now with equipment, resistances, and dodge/parry/shield-block ported
// from the text game).
import { type EquipmentSlot } from '../../shared/equipment.js';
import type { MonsterClass } from '../../shared/constants.js';
export { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type EquipmentSlot } from '../../shared/equipment.js';
import {
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_SKILLS,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  HOBGOBLIN_EVOLUTION_SKILLS,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
} from '../../shared/skills.js';
export {
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_SKILLS,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  HOBGOBLIN_EVOLUTION_SKILLS,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
} from '../../shared/skills.js';

export const STARTING_ATTRIBUTE = 1;
export const STARTING_VITAL = 100;
export const STARTING_LEVEL = 1;
// A goblin can't level past this without evolving — matches the text
// game's own GOBLIN_MAX_LEVEL exactly. (Skeleton/zombie/dragonborn/slime
// have no such cap in this project yet — none of them has a defined 2nd
// form to evolve into.)
export const GOBLIN_MAX_LEVEL = 10;
export const STARTING_EXP = 0;

export const STARTING_SKILL_PERCENT = 1;
export const MAX_SKILL_PERCENT = 100;
export const SKILL_GROWTH_CHANCE = 0.02;

export function startingSkills(): Record<string, number> {
  return Object.fromEntries(STARTING_SKILLS.map((skill) => [skill, STARTING_SKILL_PERCENT]));
}

// Same message shape for every skill's growth notice — quoted here so
// every combat-resolution call site formats it identically.
export function skillGrowthMessage(skill: string, newPercent: number): string {
  return `Your ${skill} skill has increased to ${newPercent}%!`;
}

export interface Attributes {
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
}

export interface CombatantStats extends Attributes {
  level: number;
}

// Base unarmed damage — mirrors the text game's baseHitDamage (its own
// PLAYER_BASE_ATTACK_DAMAGE_FLOOR of 6, plus half of strength and half of
// level), the floor every punch builds on top of before any bonuses.
const PUNCH_BASE_DAMAGE_FLOOR = 6;
export function baseDamage(strength: number, level: number): number {
  return PUNCH_BASE_DAMAGE_FLOOR + Math.floor(strength / 2) + Math.floor(level / 2);
}

// Every 2 points of relative strength edge, and every 2 levels of
// relative level edge, add +1 damage — clamped at 0 (being weaker or
// lower-level never subtracts damage, it just earns no bonus). Since this
// is symmetric between attacker/defender, whichever side is ahead is the
// one who gets the bonus: the bigger the gap, the more damage THEY do —
// exactly "the more difference there is, the more damage either one
// would do".
export function attributeBonus(attacker: CombatantStats, defender: CombatantStats): number {
  const strengthEdge = attacker.strength - defender.strength;
  const levelEdge = attacker.level - defender.level;
  return Math.max(0, Math.floor(strengthEdge / 2) + Math.floor(levelEdge / 2));
}

// Skill proficiency adds a small flat bonus — same shape as the text
// game's percentBonus (its dagger-skill bonus): +1 per 20% learned,
// capping at +5 at 100%.
export function skillBonus(skillPercent: number): number {
  return Math.floor(skillPercent / 20);
}

export function punchDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  punchSkillPercent: number,
  weaponBonus = 0
): number {
  return baseDamage(attacker.strength, attacker.level) + attributeBonus(attacker, defender) + skillBonus(punchSkillPercent) + weaponBonus;
}

// Which equipment slot an item goes into, if any — items not listed here
// aren't equippable at all, just consumable body parts (see
// CONSUME_EXP_PER_ITEM below).
export const EQUIPMENT_SLOT_FOR_ITEM: Record<string, EquipmentSlot> = {
  'bone dagger': 'weapon',
  'bone shield': 'shield',
};

// Flat damage bonus while a given item is equipped in its slot — matches
// the text game's own BONE_DAGGER_EQUIPMENT.attackBonus (+2), not a
// bigger made-up number.
export const WEAPON_DAMAGE_BONUS: Record<string, number> = {
  'bone dagger': 2,
};

// Any equipped weapon whose name contains "dagger" also adds
// skillBonus(dagger skill) on top of its own flat bonus — same shape as
// the text game's weaponAttackFor (its own dagger-skill percentBonus).
export function weaponBonusFor(equipment: Record<string, string>, skills: Record<string, number>): number {
  const weapon = equipment.weapon;
  if (!weapon) return 0;
  const flat = WEAPON_DAMAGE_BONUS[weapon] ?? 0;
  const daggerBonus = weapon.toLowerCase().includes('dagger') ? skillBonus(skills[DAGGER_SKILL] ?? 0) : 0;
  return flat + daggerBonus;
}

// --- Dodge / parry / shield block (mirrors the text game's own
// avoidChance/scaledSkillChance shapes exactly) ---
// Checked in this order against an incoming attack: dodge, then (only if
// dodge failed) parry, then (only if both failed) shield block. Dodge and
// parry fully negate the hit; shield block, only attempted once both have
// failed, also fully negates it once triggered.

const AVOID_BASE_CHANCE = 0.15;
const AVOID_MAX_CHANCE = 0.75;
const AVOID_SKILL_WEIGHT = 0.15;

function avoidChance(
  defenderLevel: number,
  defenderAttribute: number,
  defenderSkillPercent: number,
  attackerLevel: number,
  attackerAttribute: number
): number {
  const levelEdge = (defenderLevel - attackerLevel) * 0.01;
  const attributeEdge = (defenderAttribute - attackerAttribute) * 0.01;
  const skillWeight = (defenderSkillPercent / MAX_SKILL_PERCENT) * AVOID_SKILL_WEIGHT;
  return Math.max(0, Math.min(AVOID_MAX_CHANCE, AVOID_BASE_CHANCE + levelEdge + attributeEdge + skillWeight));
}

export function computeDodgeChance(defender: CombatantStats, defenderSkills: Record<string, number>, attacker: CombatantStats): number {
  return avoidChance(defender.level, defender.dexterity, defenderSkills[DODGE_SKILL] ?? 0, attacker.level, attacker.dexterity);
}

// Parrying requires a weapon equipped — bare-handed, there's nothing to
// parry with (same restriction the text game applies to every race but
// slime, which this project doesn't have).
export function computeParryChance(
  defender: CombatantStats,
  defenderSkills: Record<string, number>,
  defenderEquipment: Record<string, string>,
  attacker: CombatantStats
): number {
  if (!defenderEquipment.weapon) return 0;
  return avoidChance(defender.level, defender.strength, defenderSkills[PARRY_SKILL] ?? 0, attacker.level, attacker.strength);
}

// Same "scaled skill chance" shape used by shield block AND (Hobgoblin-
// only) second/third attack: a 20% base chance, +1 percentage point per
// 3% learned, capped at 80% — matches the text game's own
// scaledSkillChance exactly.
const SCALED_SKILL_BASE_CHANCE = 0.2;
const SCALED_SKILL_MAX_CHANCE = 0.8;
const SCALED_SKILL_DIVISOR = 3;

export function scaledSkillChance(learnedPercent: number): number {
  const bonus = Math.floor(learnedPercent / SCALED_SKILL_DIVISOR) / 100;
  return Math.min(SCALED_SKILL_MAX_CHANCE, SCALED_SKILL_BASE_CHANCE + bonus);
}

// Requires an actual shield equipped — no bare-handed version.
export function computeShieldBlockChance(defenderSkills: Record<string, number>, defenderEquipment: Record<string, string>): number {
  if (!defenderEquipment.shield) return 0;
  return scaledSkillChance(defenderSkills[SHIELD_BLOCK_SKILL] ?? 0);
}

// --- Hobgoblin-only: second/third attack (an extra swing per attack,
// each rolled independently — a hit can proc 0, 1, or 2 bonus swings)
// and enhanced damage (a flat bonus to base hit damage). All three grow
// 2% per attack thrown, hit or miss, same as every other skill here. ---

export function computeExtraAttackChance(skillPercent: number): number {
  return scaledSkillChance(skillPercent);
}

export function enhancedDamageBonus(skillPercent: number): number {
  return Math.floor(skillPercent / SCALED_SKILL_DIVISOR);
}

// --- Goblin -> Hobgoblin evolution (one-way, one-time) ---

export const HOBGOBLIN_EVOLUTION_CXP = 300;
export const HOBGOBLIN_ATTRIBUTE_BONUS = 10;
export const HOBGOBLIN_STAT_BONUS = 100;

// --- Consuming body parts (mirrors the text game's separate
// consumeExp counter — tracked here but, unlike the text game's Hobgoblin
// evolution, doesn't drive any further mechanic yet in this project) ---

export const CONSUME_EXP_PER_ITEM = 5;

// --- Resistance skills, gained by chance on consuming a body part ---
// (mirrors the text game's BODY_PART_SKILL reward/chance baked into each
// dropped item by its source: a wild goblin's parts teach "lesser normal
// monster resistance" at a lower chance, a wild skeleton's (undead) parts
// teach "lesser undead monster resistance" at a higher chance — same
// values as the text game's item-definitions.ts.)

export const RESISTANCE_SKILL_STARTING_PERCENT = 10;

export interface ResistanceGrant {
  skill: string;
  chance: number;
}

const RESISTANCE_FOR_ITEM: Record<string, ResistanceGrant> = {
  'wild goblin ear': { skill: LESSER_NORMAL_MONSTER_RESISTANCE, chance: 0.1 },
  'goblin ear': { skill: LESSER_NORMAL_MONSTER_RESISTANCE, chance: 0.1 },
  'hobgoblin ear': { skill: LESSER_NORMAL_MONSTER_RESISTANCE, chance: 0.1 },
  'wild skeleton bone': { skill: LESSER_UNDEAD_MONSTER_RESISTANCE, chance: 0.2 },
  'skeleton bone': { skill: LESSER_UNDEAD_MONSTER_RESISTANCE, chance: 0.2 },
};

export function resistanceGrantForItem(item: string): ResistanceGrant | undefined {
  return RESISTANCE_FOR_ITEM[item];
}

// Reduces a monster's counter-attack damage (see MONSTER_ATTACK_DAMAGE)
// against the player who hit it — 1 point per 20% learned, same shape as
// skillBonus, picked by the monster's own classification.
export function normalMonsterDamageReduction(skills: Record<string, number>): number {
  return skillBonus(skills[LESSER_NORMAL_MONSTER_RESISTANCE] ?? 0);
}
export function undeadMonsterDamageReduction(skills: Record<string, number>): number {
  return skillBonus(skills[LESSER_UNDEAD_MONSTER_RESISTANCE] ?? 0);
}
export function monsterDamageReduction(monsterClass: MonsterClass, skills: Record<string, number>): number {
  return monsterClass === 'undead' ? undeadMonsterDamageReduction(skills) : normalMonsterDamageReduction(skills);
}

// --- Leveling — identical shape to the text game's leveling.ts ---

export function maxTnlForLevel(level: number): number {
  return level * 100;
}

export interface LevelState {
  level: number;
  exp: number;
}

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

export const LEVEL_UP_ATTRIBUTE_BONUS = 1;
export const LEVEL_UP_VITAL_BONUS = 10;

// --- Experience rewards ---

// One shared ratio formula for both monster and player kills: the higher
// the killer's level is above the victim's, the less experience it's
// worth (diminishing returns for stomping something far weaker); the
// lower the killer's level, the more it's worth (risk vs. reward for
// punching above your weight). Player kills just use a bigger base
// reward than a monster kill (see PLAYER_KILL_EXP_REWARD) — since it's a
// straight multiple fed through this SAME formula, the ratio between
// them holds at any level pairing, not just when levels happen to match.
export function expGainFor(baseReward: number, killerLevel: number, victimLevel: number): number {
  const ratio = (victimLevel * 10) / killerLevel;
  return Math.max(1, Math.round(baseReward * ratio));
}

export const WILD_GOBLIN_EXP_REWARD = 8;
export const WILD_SKELETON_EXP_REWARD = 10;
// ~7x a wild goblin kill (the monster this project actually spawns) at
// any matching level pairing — see expGainFor's doc comment above.
export const PLAYER_KILL_EXP_REWARD = WILD_GOBLIN_EXP_REWARD * 7;
