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
// Counterpart to the above for "normal"-classified monsters (see
// monsters/monster.ts's MonsterClass) — a wild goblin, currently the only
// one. Taught by consuming a wild goblin's body part (see
// items/item-definitions.ts's wildGoblinBodyPartSkill).
export const LESSER_NORMAL_MONSTER_RESISTANCE = 'lesser normal monster resistance';
export const DODGE = 'dodge';
export const PARRY = 'parry';
export const DAGGER = 'dagger';
export const KICK = 'kick';
// Slime's equivalent of "kick" — same active-skill mechanics (queued,
// flat 2 damage, 2% growth chance per use), just a different name/verb for
// a race with no legs to kick with. See GameGateway.activeSkillFor.
export const SLAP = 'slap';
// Slime-only, innate — granted at MAX_SKILL_PERCENT (100%) rather than
// STARTING_SKILL_PERCENT (see startingSkillPercentFor), so it can never
// fail. Lets a slime take on the form (and equipment-slot eligibility —
// see items/item-definitions.ts's allowedSlotsForRace) of any race or
// monster kind it has ever consumed a body part from (see
// GameGateway.consumeBodyPart/handleMimic, and SocketData.mimicForms for
// the permanent collection).
export const MIMIC = 'mimic';
// Slime-only, innate — same 100%-guaranteed treatment as MIMIC. Changes
// the slime's form back to plain "slime" (see GameGateway.handleRevert).
export const REVERT = 'revert';
// Every race's base defensive kit alongside dodge/parry — see
// scaledSkillChance for the shared chance formula.
export const SHIELD_BLOCK = 'shield block';
// Goblin-only, granted at GameGateway.GOBLIN_SECOND_ATTACK_LEVEL (5) — see
// maybeGrantGoblinSecondAttack — not part of the level-1 starting kit
// below. A chance to swing a second time per combat tick (see
// scaledSkillChance/extraAttackSkillsFor).
export const SECOND_ATTACK = 'second attack';
// Hobgoblin-only (see startingSkillsForRace) — a separate, independently
// rolled chance to swing a *third* time per combat tick, on top of
// whatever second attack itself procs (see extraAttackSkillsFor). Not an
// upgrade or replacement for second attack — a character with both rolls
// each one on its own, so a tick can add 0, 1, or 2 bonus swings.
export const THIRD_ATTACK = 'third attack';
// Hobgoblin-only (see startingSkillsForRace) — a flat damage bonus (see
// enhancedDamageBonus).
export const ENHANCED_DAMAGE = 'enhanced damage';

export function lesserRaceResistanceName(race: Race): string {
  return `lesser ${race} resistance`;
}

export const BODY_PART_SKILL_STARTING_PERCENT = 10;
export const BODY_PART_SKILL_GROWTH_CHANCE = 0.02;

// Every race starts with dodge/parry/shield block at level 1; every race
// but slime also gets dagger/kick, while slime gets "slap" (see SLAP)
// instead of kick, plus the innate mimic/revert pair (see
// startingSkillPercentFor for their 100% starting value). Hobgoblin
// additionally gets second attack, third attack, and enhanced damage on
// top of the same dagger/kick baseline every other non-slime race has —
// granted immediately at evolution (see GameGateway.maybeEvolveToHobgoblin),
// not just on next reconnect, and including second attack even though
// it's normally goblin-only and level-gated (see SECOND_ATTACK) — a
// Hobgoblin gets every skill a goblin would have by level 10 regardless
// of what level it actually evolved at.
export function startingSkillsForRace(race: Race): string[] {
  const universal = [DODGE, PARRY, SHIELD_BLOCK];
  if (race === 'slime') return [...universal, SLAP, MIMIC, REVERT];
  if (race === 'hobgoblin') return [...universal, DAGGER, KICK, SECOND_ATTACK, THIRD_ATTACK, ENHANCED_DAMAGE];
  return [...universal, DAGGER, KICK];
}

// mimic/revert are innate and can never fail — everything else in the
// level-1 starting kit begins at STARTING_SKILL_PERCENT (1%) and has to
// grow through use, but a slime already knows these outright.
export function startingSkillPercentFor(skill: string): number {
  return skill === MIMIC || skill === REVERT ? MAX_SKILL_PERCENT : STARTING_SKILL_PERCENT;
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

export function normalMonsterDamageReduction(skillLevels: Record<string, number>): number {
  return percentBonus(skillLevels[LESSER_NORMAL_MONSTER_RESISTANCE] ?? 0);
}

export function raceDamageReduction(skillLevels: Record<string, number>, race: Race): number {
  return percentBonus(skillLevels[lesserRaceResistanceName(race)] ?? 0);
}

// Shared by "second attack" (a chance to swing twice in one combat tick)
// and "shield block" (a chance to block an attack outright while wearing
// a shield) — both start at a 20% base chance per trigger and climb
// toward an 80% ceiling as the skill's learned percentage grows, gaining
// floor(learnedPercent / 3) percentage points along the way (same
// "divide the learned percentage down" shape as percentBonus above, just
// a different divisor). See GameGateway.rollSecondAttack/
// computeShieldBlockChance.
const SCALED_SKILL_BASE_CHANCE = 0.2;
const SCALED_SKILL_MAX_CHANCE = 0.8;
const SCALED_SKILL_DIVISOR = 3;

export function scaledSkillChance(learnedPercent: number): number {
  const bonus = Math.floor(learnedPercent / SCALED_SKILL_DIVISOR) / 100;
  return Math.min(SCALED_SKILL_MAX_CHANCE, SCALED_SKILL_BASE_CHANCE + bonus);
}

// "enhanced damage" — a flat bonus added to base hit damage (not a
// chance), same divide-by-3 shape as scaledSkillChance above.
export function enhancedDamageBonus(skillLevels: Record<string, number>): number {
  return Math.floor((skillLevels[ENHANCED_DAMAGE] ?? 0) / SCALED_SKILL_DIVISOR);
}

// Every "extra attack" skill a player actually has — second attack and
// third attack are independent (see their own doc comments), so this can
// return zero, one, or both. Fixed order (second before third) just so
// GameGateway.rollExtraAttack reports proc messages in a consistent
// sequence when both fire in the same tick, not because either takes
// priority over the other.
export function extraAttackSkillsFor(skillLevels: Record<string, number>): string[] {
  return [SECOND_ATTACK, THIRD_ATTACK].filter((skill) => skillLevels[skill] !== undefined);
}
