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
// 2. The starting kit every race gets at level 1 (dodge, parry, and either
//    dagger+kick or, for slime, slap — see startingSkillsForRace), each
//    starting at STARTING_SKILL_PERCENT and growing through their own use,
//    not by taking a hit from anything in particular.
//
// Both families share the same 1-100 percentage scale and the same
// "1 point of reduction/bonus per 20%" shape (see resistanceReduction)
// where a percentage translates into a mechanical effect.
export const LESSER_UNDEAD_MONSTER_RESISTANCE = 'lesser undead monster resistance';
export const DODGE = 'dodge';
export const PARRY = 'parry';
export const DAGGER = 'dagger';
export const KICK = 'kick';
// Slime's equivalent of "kick" — same active-skill mechanics (queued,
// flat 2 damage, 2% growth chance per use), just a different name/verb for
// a race with no legs to kick with. See GameGateway.activeSkillFor.
export const SLAP = 'slap';

export function lesserRaceResistanceName(race: Race): string {
  return `lesser ${race} resistance`;
}

export const BODY_PART_SKILL_STARTING_PERCENT = 10;
export const BODY_PART_SKILL_GROWTH_CHANCE = 0.02;

// Every race starts with dodge/parry at level 1; every race but slime also
// gets dagger/kick, while slime gets "slap" (see SLAP) instead of kick —
// mechanically identical, just reflavored for a race with no legs.
export function startingSkillsForRace(race: Race): string[] {
  if (race === 'slime') return [DODGE, PARRY, SLAP];
  return [DODGE, PARRY, DAGGER, KICK];
}

// The verb ("kick"/"slap") for whichever active skill a given
// skillLevels record actually has — always exactly one, since every race
// gets one or the other (see startingSkillsForRace), never both.
export const ACTIVE_SKILL_VERB: Record<string, string> = {
  [KICK]: 'kick',
  [SLAP]: 'slap',
};

export function activeSkillFor(skillLevels: Record<string, number>): string | undefined {
  if (skillLevels[KICK] !== undefined) return KICK;
  if (skillLevels[SLAP] !== undefined) return SLAP;
  return undefined;
}

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
