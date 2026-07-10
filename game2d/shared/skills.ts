// Skill-name constants shared between the server (combat/formulas.ts,
// which owns the actual growth/chance mechanics) and the client (the
// Skills modal's "Show All" preview of not-yet-acquired skills) — pure
// data, no server-only logic, so it lives here rather than being
// duplicated.
export const PUNCH_SKILL = 'punch';
export const DODGE_SKILL = 'dodge';
export const PARRY_SKILL = 'parry';
export const SHIELD_BLOCK_SKILL = 'shield block';
export const DAGGER_SKILL = 'dagger';
export const STARTING_SKILLS = [PUNCH_SKILL, DODGE_SKILL, PARRY_SKILL, SHIELD_BLOCK_SKILL, DAGGER_SKILL];

export const SECOND_ATTACK_SKILL = 'second attack';
export const THIRD_ATTACK_SKILL = 'third attack';
export const ENHANCED_DAMAGE_SKILL = 'enhanced damage';
// Granted only on evolving to Hobgoblin — see game.gateway.ts's
// maybeEvolveToHobgoblin.
export const HOBGOBLIN_EVOLUTION_SKILLS = [SECOND_ATTACK_SKILL, THIRD_ATTACK_SKILL, ENHANCED_DAMAGE_SKILL];

export const LESSER_NORMAL_MONSTER_RESISTANCE = 'lesser normal monster resistance';
export const LESSER_UNDEAD_MONSTER_RESISTANCE = 'lesser undead monster resistance';
export const RESISTANCE_SKILLS = [LESSER_NORMAL_MONSTER_RESISTANCE, LESSER_UNDEAD_MONSTER_RESISTANCE];
