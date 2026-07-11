// Skill-name constants shared between the server (combat/formulas.ts,
// which owns the actual growth/chance mechanics) and the client (the
// Skills modal's "Show All" preview of not-yet-acquired skills) — pure
// data, no server-only logic, so it lives here rather than being
// duplicated.
import type { Race } from './constants.js';

export const STARTING_SKILL_PERCENT = 1;
export const MAX_SKILL_PERCENT = 100;

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
// Granted by a small chance on consuming a torch (see combat/formulas.ts's
// RESISTANCE_FOR_ITEM) rather than a body part — no fire-damage mechanic
// exists yet for it to actually reduce, same "earnable now, mechanically
// inert until there's fire damage to resist" status as a few other skills.
export const LESSER_FIRE_RESISTANCE = 'lesser fire resistance';
export const RESISTANCE_SKILLS = [LESSER_NORMAL_MONSTER_RESISTANCE, LESSER_UNDEAD_MONSTER_RESISTANCE, LESSER_FIRE_RESISTANCE];

// --- Per-race innate skills — each granted at character creation
// alongside the universal STARTING_SKILLS above, but starting at
// MAX_SKILL_PERCENT (100%) rather than STARTING_SKILL_PERCENT, since
// these are innate abilities the race is simply born with, not something
// learned through practice. ---

export const INFRAVISION_SKILL = 'infravision'; // goblin: see in the dark, no torch needed
export const LACERATE_SKILL = 'lacerate'; // dragonborn: chance of an extra "laceration" attack per combat tick
export const MIMIC_SKILL = 'mimic'; // slime: can transform into a consumed race's form
export const REVERT_SKILL = 'revert'; // slime: change back to plain slime form
export const EAT_BRAINS_SKILL = 'eat brains'; // zombie: heal by eating a corpse's brains (own killing blow only)
export const GLARE_SKILL = 'glare'; // skeleton: paralyze whoever it's fighting for 2 combat rounds
export const ENHANCED_DURABILITY_SKILL = 'enhanced durability'; // skeleton: +5% armor (armor itself: future work)

// Not race-bound — any race has a small chance of picking this up the
// first time they consume a "bone dagger" (see combat/formulas.ts's
// BONE_FINGER_STRIKE_GRANT_CHANCE), same as the resistance skills above
// but a real active attack rather than a passive damage reduction.
export const BONE_FINGER_STRIKE_SKILL = 'bone finger strike';

// A skill with an entry here can't be re-queued until this long (wall-
// clock ms) after it was last used — checked server-side (see
// game.gateway.ts's engageInDirection) and rendered client-side as a
// darkened, progressively-clearing overlay in both the Skills modal and
// the action bar (item 23; see main.ts's updateCooldownOverlays). A
// skill with no entry here has no cooldown at all. Glare's 2-combat-round
// figure matches MONSTER_TICK_INTERVAL_MS (3000ms) — kept as a literal
// here since shared/ can't import a server-only constant.
export const SKILL_COOLDOWN_MS: Partial<Record<string, number>> = {
  [GLARE_SKILL]: 2 * 3000,
};

export const RACE_INNATE_SKILLS: Record<Race, string[]> = {
  goblin: [INFRAVISION_SKILL],
  skeleton: [GLARE_SKILL, ENHANCED_DURABILITY_SKILL],
  zombie: [EAT_BRAINS_SKILL],
  dragonborn: [LACERATE_SKILL],
  slime: [MIMIC_SKILL, REVERT_SKILL],
  // Hobgoblin is evolution-only (never a starting race) — its own extra
  // skills are granted separately, see HOBGOBLIN_EVOLUTION_SKILLS.
  hobgoblin: [],
};
