// Skill-name constants shared between the server (combat/formulas.ts,
// which owns the actual growth/chance mechanics) and the client (the
// Skills modal's "Show All" preview of not-yet-acquired skills) — pure
// data, no server-only logic, so it lives here rather than being
// duplicated.
import type { Race } from './constants.js';

// A follow-up ask: "once a skill is learned, start it out at 10% instead
// of 1%" — applies uniformly to every skill grant in the game (starting
// kit, race-innate exceptions aside, evolution skills, podium-taught
// spells, the bone-finger-strike bonus, ...) since they all funnel
// through this one constant.
export const STARTING_SKILL_PERCENT = 10;
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

// The first of the wizarding-school pivot's spells to actually work
// mechanically (see shared/spells.ts for the full spell list, mostly
// still flavor text) — learned by reading the spellbook podium in the
// Utilization classroom (a 10% chance per read, see game.gateway.ts's
// handleReadLucemBook), not race-bound and not a starting skill. Once
// learned, it's a no-target toggle from the action bar (see
// isUsableSkill) that lights/extinguishes an equipped wand.
export const LUCEM_SKILL = 'lucem';

// Learned the same way (a 10% chance per read at the Elemental Casting
// classroom's own spellbook podium, see handleReadIrrigoBook) — fills a
// targeted fillable item (a canteen today — see shared/items.ts) with
// water. Requires selecting that item as a target first (see
// WorldScene's setItemTarget), then clicking it from the action bar.
export const IRRIGO_SKILL = 'irrigo';

// A second Utilization podium's spell (a follow-up ask) — same "10%
// chance per read, STARTING_SKILL_PERCENT to start, 2% chance to grow per
// cast" shape as lucem/irrigo. While active, boosts the caster's own
// movement speed by about 10%; lasts the same real-time duration as
// lucem (see game.gateway.ts's spellDurationMs), scaling up with skill%.
export const CELERITAS_SKILL = 'celeritas';

// A follow-up ask's fireball spell — learned the same podium way (10%
// chance per read, a second Offense classroom podium, see
// handleReadAugueBook), but a targeted ATTACK unlike the 3 no-target/
// item-targeted spells above: requires selecting a monster target (see
// WorldScene's targetKind/targetId — the only kind of target this game
// currently offers is a wild monster, imps included) within
// AUGUE_RANGE_TILES, deals a flat AUGUE_DAMAGE, and has its own cooldown
// (see SKILL_COOLDOWN_MS below).
export const AUGUE_SKILL = 'augue';

// Basic actions every human wizard starts knowing outright (item 7) —
// not practiced up or learned from a podium, just part of the universal
// kit (see RACE_INNATE_SKILLS.human below). Both act on a targeted
// inventory item the same way IRRIGO_SKILL does.
export const DRINK_SKILL = 'drink';
export const POUR_SKILL = 'pour out';

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
  // "A cooldown of 1 combat tick" (a follow-up ask) — same literal
  // MONSTER_TICK_INTERVAL_MS figure as Glare above, for the same reason
  // (shared/ can't import a server-only constant).
  [AUGUE_SKILL]: 1 * 3000,
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
  // Drink/pour are basic actions everyone can do from day one (item 7) —
  // spellcasting skills (lucem, irrigo, ...) are still learned separately
  // from their classroom podiums, not granted here.
  human: [DRINK_SKILL, POUR_SKILL],
};
