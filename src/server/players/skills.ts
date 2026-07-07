import type { Race } from '../../shared/constants.js';

// Permanent player abilities. Two families:
//
// 1. Body-part-taught resistances ("lesser undead monster resistance",
//    "lesser <race> resistance") — learned with some chance when
//    consuming a body part (see items/item-definitions.ts's
//    skillForItemName), starting at BODY_PART_SKILL_STARTING_PERCENT and
//    growing BODY_PART_SKILL_GROWTH_CHANCE per relevant hit *taken* (see
//    GameGateway.maybeGrowSkill). "Undead monster resistance" only ever
//    applies against undead monsters (never against an undead-flavored
//    player race like skeleton/zombie — that's what the race-scoped
//    version is for).
// 2. The goblin-only starting kit (dodge/parry/dagger/kick) — see
//    GOBLIN_STARTING_SKILLS, each starting at STARTING_SKILL_PERCENT and
//    growing through their own use, not by taking a hit from anything in
//    particular.
//
// Both families share the same 1-100 percentage scale and the same
// "1 point of reduction/bonus per 20%" shape (see resistanceReduction)
// where a percentage translates into a mechanical effect.
export const LESSER_UNDEAD_MONSTER_RESISTANCE = 'lesser undead monster resistance';
export const DODGE = 'dodge';
export const PARRY = 'parry';
export const DAGGER = 'dagger';
export const KICK = 'kick';

export function lesserRaceResistanceName(race: Race): string {
  return `lesser ${race} resistance`;
}

export const BODY_PART_SKILL_STARTING_PERCENT = 10;
export const BODY_PART_SKILL_GROWTH_CHANCE = 0.02;

export const GOBLIN_STARTING_SKILLS = [DODGE, PARRY, DAGGER, KICK];
export const STARTING_SKILL_PERCENT = 1;
export const SKILL_GROWTH_CHANCE = 0.02;
export const MAX_SKILL_PERCENT = 100;

// Every 20% of a resistance skill reduces damage by 1 point — "slightly"
// increasing as the percentage climbs, capping at 5 points at 100%. Also
// reused for the dagger skill's damage bonus (same shape, different
// context — see GameGateway.weaponAttack).
export function percentBonus(skillPercent: number): number {
  return Math.floor(skillPercent / 20);
}

export function undeadMonsterDamageReduction(skillLevels: Record<string, number>): number {
  return percentBonus(skillLevels[LESSER_UNDEAD_MONSTER_RESISTANCE] ?? 0);
}

export function raceDamageReduction(skillLevels: Record<string, number>, race: Race): number {
  return percentBonus(skillLevels[lesserRaceResistanceName(race)] ?? 0);
}
