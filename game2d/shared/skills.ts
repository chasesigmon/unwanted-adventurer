// Skill-name constants shared between the server (combat/formulas.ts,
// which owns the actual growth/chance mechanics) and the client (the
// Skills/Spells modals) — pure data, no server-only logic, so it lives
// here rather than being duplicated.
import type { Race, SpecializationPath } from './constants.js';

// A follow-up ask: "once a skill is learned, start it out at 10% instead
// of 1%" — applies uniformly to every skill grant in the game (starting
// kit, race-innate exceptions aside, evolution skills, teacher-taught
// spells, the bone-finger-strike bonus, ...) since they all funnel
// through this one constant. Raised to 15% by a later follow-up ask, then
// to 70% by a still-later one ("disregard the starting percentage of each
// spell/skill described so far, instead every spell/skill... should be
// learned at 70%") replacing the old podium-reading system's own learn
// chance with a flat practice-point cost instead (see
// SKILL_LEVEL_REQUIREMENT/practicePointCostFor below). A small number of
// skills explicitly stated to start at 100% (future specialization
// passives) are hardcoded to MAX_SKILL_PERCENT at their own grant site
// instead of using this constant.
export const STARTING_SKILL_PERCENT = 70;
export const MAX_SKILL_PERCENT = 100;

export function skillLevelRequirement(skill: string): number {
  return SKILL_LEVEL_REQUIREMENT[skill] ?? 1;
}

export function practicePointCostFor(skill: string): number {
  const level = skillLevelRequirement(skill);
  if (level >= 15) return 3;
  if (level >= 5) return 2;
  return 1;
}

// Shared by every ranged targeted-attack spell (augue, the wand's own
// ranged auto-attack, stupefaciunt, exarme — "the same range as augue")
// so both the server's own reach check and the client's own
// walk-into-range logic (see WorldScene's tryRangedAction) always agree
// on the figure without duplicating "7" in five different places.
export const SPELL_ATTACK_RANGE_TILES = 7;

export const PUNCH_SKILL = 'punch';
export const DODGE_SKILL = 'dodge';
export const PARRY_SKILL = 'parry';
export const SHIELD_BLOCK_SKILL = 'shield block';
export const DAGGER_SKILL = 'dagger';
export const STARTING_SKILLS = [PUNCH_SKILL, DODGE_SKILL, PARRY_SKILL, SHIELD_BLOCK_SKILL, DAGGER_SKILL];

// A follow-up ask's ranged basic attack — automatic the moment a wand is
// equipped (no podium/learning needed), the same "the weapon itself
// grants the attack" shape DAGGER_SKILL already has, just ranged (7
// tiles, see game.gateway.ts's WAND_BOLT_RANGE_TILES) instead of melee,
// and flat damage instead of the usual punch formula. Right-click arms a
// sustained session (see engageRangedAttack) resolved automatically every
// combat tick, same as any other queued attack.
export const WAND_BOLT_SKILL = 'wand bolt';

export const SECOND_ATTACK_SKILL = 'second attack';
export const THIRD_ATTACK_SKILL = 'third attack';
export const ENHANCED_DAMAGE_SKILL = 'enhanced damage';

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
export const LIGHT_SKILL = 'light';

// Learned the same way (a 10% chance per read at the Elemental Casting
// classroom's own spellbook podium, see handleReadIrrigoBook) — fills a
// targeted fillable item (a canteen today — see shared/items.ts) with
// water. Requires selecting that item as a target first (see
// WorldScene's setItemTarget), then clicking it from the action bar.
export const WATERFILL_SKILL = 'waterfill';

// A second Utilization podium's spell (a follow-up ask) — same "10%
// chance per read, STARTING_SKILL_PERCENT to start, 2% chance to grow per
// cast" shape as lucem/irrigo. While active, boosts the caster's own
// movement speed by about 10%; lasts the same real-time duration as
// lucem (see game.gateway.ts's spellDurationMs), scaling up with skill%.
export const HASTE_SKILL = 'haste';

// The Utility Classroom's third podium (a follow-up ask) — same "10%
// chance per read, STARTING_SKILL_PERCENT to start, 2% chance to grow per
// cast" shape as the others, but a targeted UTILITY spell rather than a
// toggle or attack: requires selecting a lockable object (the secret
// room's own door or its treasure chest — see WorldScene's lockTarget)
// and rolls the same success-chance formula for a CHANCE to unlock it,
// per-player (see game.gateway.ts's handleCastResera).
export const UNLOCK_SKILL = 'unlock';

// A follow-up ask's fireball spell — learned the same podium way (10%
// chance per read, a second Offense classroom podium, see
// handleReadAugueBook), but a targeted ATTACK unlike the 3 no-target/
// item-targeted spells above: requires selecting a monster target (see
// WorldScene's targetKind/targetId — the only kind of target this game
// currently offers is a wild monster, imps included) within
// AUGUE_RANGE_TILES, deals a flat AUGUE_DAMAGE, and has its own cooldown
// (see SKILL_COOLDOWN_MS below).
export const ARCANE_BOLT_SKILL = 'arcane bolt';

// Basic actions every human wizard starts knowing outright (item 7) —
// not practiced up or learned from a podium, just part of the universal
// kit (see RACE_INNATE_SKILLS.human below). Both act on a targeted
// inventory item the same way WATERFILL_SKILL does.
export const DRINK_SKILL = 'drink';
export const POUR_SKILL = 'pour out';

// The Offense Classroom's second and third podiums (a later follow-up
// ask) — same targeted-attack shape as augue (a monster target within
// range), but stupefaciunt stuns instead of dealing damage, and exarme
// disarms a weapon into the caster's own inventory instead. See
// game.gateway.ts's handleCastStupefaciunt/handleCastExarme.
export const STUN_SKILL = 'stun';
export const DISARM_SKILL = 'disarm';

// The Defense Classroom's own podium (a later follow-up ask) — a no-
// target toggle-like buff (always ON for its own fixed duration once
// cast, unlike lucem/celeritas which can be turned back off early) that
// shields the caster from a portion of incoming damage for a time. See
// game.gateway.ts's handleCastScutum.
export const AEGIS_SKILL = 'aegis';

// The Summoning Classroom's own podium (a later follow-up ask) — a
// click-a-tile-on-the-map targeted spell (unlike every other spell here,
// which targets a player/npc/monster/door/chest/inventory item) that
// summons a temporary, defensive stone-block ally. See
// game.gateway.ts's handleCastMurusLapideus.
export const STONE_WALL_SKILL = 'stone wall';

// The Necromancer Chamber's own teacher — a one-time practice-point spend
// (see SKILL_LEVEL_REQUIREMENT/SKILL_SPECIALIZATION_REQUIREMENT below —
// this used to be a flat 10-gold purchase, moved onto the same teacher
// click-to-learn modal every other skill now uses by a later follow-up
// ask), and a click-a-corpse targeted spell rather than a click-a-tile
// one (see game.gateway.ts's handleCastAnimateDead).
export const ANIMATE_DEAD_SKILL = 'animate dead';
export const ANIMATE_DEAD_MANA_COST = 15;
export const ANIMATE_DEAD_COOLDOWN_MS = 3 * 60 * 1000;
// "Only have 1 animated monster until they reach level 20, then they can
// have 2."
export const ANIMATE_DEAD_LEVEL_20_THRESHOLD = 20;
export const ANIMATE_DEAD_CAP_BEFORE_LEVEL_20 = 1;
export const ANIMATE_DEAD_CAP_AT_LEVEL_20 = 2;
export function animatedMonsterCapFor(level: number): number {
  return level >= ANIMATE_DEAD_LEVEL_20_THRESHOLD ? ANIMATE_DEAD_CAP_AT_LEVEL_20 : ANIMATE_DEAD_CAP_BEFORE_LEVEL_20;
}
// "The animated monster should have 2x the hp of the original monster."
export const ANIMATE_DEAD_HP_MULTIPLIER = 2;

// Which level a skill/spell becomes learnable at (a later follow-up ask
// replaced the old podium-reading system with a teacher click-to-learn
// modal: "stupefaciunt, murus lapideus, celeritas, and exarme should
// become available at level 5, the others are available at level 1").
// Every skill not listed here defaults to level 1 (see
// skillLevelRequirement above) — the starting kit/race-innate skills are
// granted outright and never appear in a teacher's own offering list.
export const SKILL_LEVEL_REQUIREMENT: Record<string, number> = {
  [HASTE_SKILL]: 5,
  [STUN_SKILL]: 5,
  [DISARM_SKILL]: 5,
  [STONE_WALL_SKILL]: 5,
  [ANIMATE_DEAD_SKILL]: 15,
};

// A skill/spell that also requires a specific chosen specialization to
// learn at all, on top of its own level requirement (undefined = no
// specialization restriction, learnable at any classroom teacher once the
// level is met).
export const SKILL_SPECIALIZATION_REQUIREMENT: Partial<Record<string, SpecializationPath>> = {
  [ANIMATE_DEAD_SKILL]: 'necromancer',
};

// Every skill a teacher can actually offer through the click-to-learn
// modal (see game.gateway.ts's handleLearnSkill, which rejects any other
// skill name outright) — the starting kit/race-innate skills are granted
// directly at character creation and never appear here.
export const LEARNABLE_SKILLS = [
  LIGHT_SKILL,
  WATERFILL_SKILL,
  UNLOCK_SKILL,
  ARCANE_BOLT_SKILL,
  AEGIS_SKILL,
  HASTE_SKILL,
  STUN_SKILL,
  DISARM_SKILL,
  STONE_WALL_SKILL,
  ANIMATE_DEAD_SKILL,
];

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
  [ARCANE_BOLT_SKILL]: 1 * 3000,
  // "Both spells should have a 3 combat tick cooldown" (a later follow-up
  // ask) — same literal-MONSTER_TICK_INTERVAL_MS reasoning as above.
  [STUN_SKILL]: 3 * 3000,
  [DISARM_SKILL]: 3 * 3000,
  // "A cooldown of 2 minutes" (a later follow-up ask).
  [AEGIS_SKILL]: 2 * 60 * 1000,
  // "The cooldown to 1 minute" (a later follow-up ask, up from 40s).
  [STONE_WALL_SKILL]: 60 * 1000,
  // "Both celeritas and lucem should have 5 minute cooldowns" (a later
  // follow-up ask) — only gates turning the toggle back ON (see
  // game.gateway.ts's handleLucemCommand/handleCeleritasCommand).
  [LIGHT_SKILL]: 5 * 60 * 1000,
  [HASTE_SKILL]: 5 * 60 * 1000,
  // "A 3 minute cooldown" (a later follow-up ask, for animate dead).
  [ANIMATE_DEAD_SKILL]: ANIMATE_DEAD_COOLDOWN_MS,
};

export const RACE_INNATE_SKILLS: Record<Race, string[]> = {
  goblin: [INFRAVISION_SKILL],
  skeleton: [GLARE_SKILL, ENHANCED_DURABILITY_SKILL],
  zombie: [EAT_BRAINS_SKILL],
  dragonborn: [LACERATE_SKILL],
  slime: [MIMIC_SKILL, REVERT_SKILL],
  // Hobgoblin is evolution-only (never a starting race).
  hobgoblin: [],
  // Drink/pour are basic actions everyone can do from day one (item 7) —
  // spellcasting skills (light, waterfill, ...) are still learned
  // separately from their classroom teachers, not granted here. A later
  // follow-up ask made 4 more races playable alongside human — same
  // universal starting kit, no bespoke racial ability for any of them.
  human: [DRINK_SKILL, POUR_SKILL],
  elf: [DRINK_SKILL, POUR_SKILL],
  'half-elf': [DRINK_SKILL, POUR_SKILL],
  viravis: [DRINK_SKILL, POUR_SKILL],
  pixie: [DRINK_SKILL, POUR_SKILL],
};
