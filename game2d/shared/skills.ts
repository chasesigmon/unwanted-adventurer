// Skill-name constants shared between the server (combat/formulas.ts,
// which owns the actual growth/chance mechanics) and the client (the
// Skills/Spells modals) — pure data, no server-only logic, so it lives
// here rather than being duplicated.
import type { Race, SpecializationPath, MonsterKind } from './constants.js';
import { isFlyingBeastKind } from './constants.js';

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
  // Flight (a later follow-up ask) — "should cost 5 practice points to
  // learn," its own explicit figure rather than falling out of the
  // ordinary level-tiered formula below (which tops out at 3).
  if (skill === FLIGHT_SKILL) return 5;
  // Tame Beast (a later follow-up ask) — "should cost 3 practice points,"
  // its own explicit figure; the level-10 tier below would otherwise
  // give 2.
  if (skill === TAME_BEAST_SKILL) return 3;
  // Transform (a later follow-up ask) — "should cost 4 practice points to
  // learn," its own explicit figure; the level-10 tier below would
  // otherwise give 2.
  if (skill === TRANSFORM_SKILL) return 4;
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
// A later follow-up ask: "dagger should be removed as a skill" (a fresh
// character — a Viravis, in the report, but this applied to every race
// that goes through this starting kit) shouldn't already know it from
// birth — same "the weapon itself grants the skill" shape the wand's own
// WAND_BOLT_SKILL already has below, just picked up organically the
// first time a dagger is actually equipped and swung (see
// attackGrowthSkill/maybeGrowSkill's own STARTING_SKILL_PERCENT
// fallback for an unlearned skill), not handed out at creation.
export const STARTING_SKILLS = [PUNCH_SKILL, DODGE_SKILL, PARRY_SKILL, SHIELD_BLOCK_SKILL];

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
// A later follow-up ask: all "bolt" spells cost 7 mana per cast — split
// out from the generic SPELL_ATTACK_MANA_COST (game.gateway.ts), which
// item 12's mana-cost audit later split apart entirely (see
// STUPEFACIANT_MANA_COST/EXARME_MANA_COST/AEGIS_MANA_COST/
// STONE_WALL_MANA_COST below) once it became clear that flat shared
// number was covering 4 very differently-powered spells.
export const ARCANE_BOLT_MANA_COST = 7;

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
// Item 12's mana-cost audit: split out from the generic SPELL_ATTACK_MANA_COST
// (game.gateway.ts) that all 4 of these spells used to share flatly —
// stun is a full lockdown of the target (can't act at all until it wears
// off), a materially stronger effect than a plain damage bolt, so it now
// costs more than ARCANE_BOLT_MANA_COST/ELEMENTAL_BOLT_MANA_COST (7) or a
// simple debuff.
export const STUPEFACIANT_MANA_COST = 16;
export const DISARM_SKILL = 'disarm';
// Exarme doesn't just debuff — it moves the target's own weapon into the
// CASTER's inventory outright, a real (if temporary) item theft, pricier
// than a stat-only debuff would be.
export const EXARME_MANA_COST = 15;

// The Defense Classroom's own podium (a later follow-up ask) — a no-
// target toggle-like buff (always ON for its own fixed duration once
// cast, unlike lucem/celeritas which can be turned back off early) that
// shields the caster from a portion of incoming damage for a time. See
// game.gateway.ts's handleCastScutum.
export const AEGIS_SKILL = 'aegis';
// Item 12's mana-cost audit — a fixed-duration damage-absorbing shield,
// same power tier as barrier/invisibility (both 15), not the cheaper
// generic SPELL_ATTACK_MANA_COST (10) it used to share with 3 very
// differently-powered spells.
export const AEGIS_MANA_COST = 15;

// The Summoning Classroom's own podium (a later follow-up ask) — a
// click-a-tile-on-the-map targeted spell (unlike every other spell here,
// which targets a player/npc/monster/door/chest/inventory item) that
// summons a temporary, defensive stone-block ally. See
// game.gateway.ts's handleCastMurusLapideus.
export const STONE_WALL_SKILL = 'stone wall';
// Item 12's mana-cost audit — a real (if temporary/weaker) defensive
// ally, same idea as animate dead/monster summons/summon demon imp but
// noticeably less durable, so it's priced between those (15-20) and a
// plain debuff, not the flat 10 it used to share with stun/exarme/aegis.
export const STONE_WALL_MANA_COST = 12;

// The Necromancer Chamber's own teacher — a one-time practice-point spend
// (see SKILL_LEVEL_REQUIREMENT/SKILL_SPECIALIZATION_REQUIREMENT below —
// this used to be a flat 10-gold purchase, moved onto the same teacher
// click-to-learn modal every other skill now uses by a later follow-up
// ask), and a click-a-corpse targeted spell rather than a click-a-tile
// one (see game.gateway.ts's handleCastAnimateDead).
export const ANIMATE_DEAD_SKILL = 'animate dead';
// Item 12's mana-cost audit — bumped from 15 to sit alongside monster
// summons/summon demon imp/create duplicate (all 20), the other "gain a
// combat ally" spells; there was no real justification for animate dead
// being priced lower than its own peers.
export const ANIMATE_DEAD_MANA_COST = 20;
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

// The Utility Classroom's own level-15 spell (a later follow-up ask) —
// opens a modal listing every major point of interest the player has
// already visited (see shared/recall.ts), rather than a click-a-tile/
// click-a-corpse targeted cast. Teleports the caster's own pet/animated
// monsters along with them.
export const RECALL_SKILL = 'recall';
export const RECALL_MANA_COST = 30;
// "Recall on successful cast should have a 2 minute cooldown" (a later
// follow-up ask) — same "only starts on an actual success, a fumble
// still costs mana but doesn't lock the player out of trying again right
// away" shape every other spell's own cooldown already uses here.
export const RECALL_COOLDOWN_MS = 2 * 60 * 1000;

// The Defense Classroom's own level-10 spell (a later follow-up ask) —
// a fixed-position dome around the caster's cast location: they can't
// leave it, and monsters can't enter it or damage them while it's active
// (see game.gateway.ts's own activeBarriers registry). Recasting while
// active cancels it early, bypassing the cooldown gate entirely — only a
// FRESH barrier (cast while none is active) is cooldown-gated.
export const BARRIER_SKILL = 'barrier';
export const BARRIER_MANA_COST = 15;
export const BARRIER_DURATION_MS = 2 * 60 * 1000;
export const BARRIER_COOLDOWN_MS = 4 * 60 * 1000;
export const BARRIER_RADIUS_TILES = 3;

// The Shaman specialization's own level-15 spell (a later follow-up ask)
// — a fixed-duration self-buff adding a flat bonus to the caster's basic
// (ranged or physical) attack damage while active, same "always ON for
// its own duration, no manual toggle-off" shape as scutum. Named
// distinctly from the pre-existing ENHANCED_DAMAGE_SKILL (a Hobgoblin-
// only INNATE passive with a different string value, 'enhanced damage')
// to avoid confusion despite the near-identical names.
export const SHAMAN_ENHANCE_DAMAGE_SKILL = 'enhance damage';
export const SHAMAN_ENHANCE_DAMAGE_MANA_COST = 15;
export const SHAMAN_ENHANCE_DAMAGE_DURATION_MS = 3 * 60 * 1000;
export const SHAMAN_ENHANCE_DAMAGE_COOLDOWN_MS = 4 * 60 * 1000;
// A later follow-up ask: "update the shaman enhance damage spell to do
// increasingly more damage both as the player levels and its damage
// increase should also go up with intelligence" — was a flat +5 forever.
// Kept as a simple additive formula (not compounding, unlike spell
// damage's own scaledSpellDamage) since this is a flat bonus layered on
// top of ordinary melee damage, not a spell's own base figure — floor(level
// /4) + floor(intelligence/4) grows it gradually, landing back at exactly
// +5 for a fresh level-1/intelligence-1 shaman (unchanged starting
// experience) and reaching +5+10+3=18 by level 40 with a fully-invested
// intelligence (~12, the realistic training-point-limited ceiling — see
// scaledSpellDamage's own doc comment).
export const SHAMAN_ENHANCE_DAMAGE_BASE_BONUS = 5;
export function shamanEnhanceDamageBonusFor(level: number, intelligence: number): number {
  return SHAMAN_ENHANCE_DAMAGE_BASE_BONUS + Math.floor(level / 4) + Math.floor(intelligence / 4);
}

// The Elementalist specialization's own 4 level-15 spells (a later
// follow-up ask) — same targeted-bolt shape as Arcane Bolt (same range,
// same mana cost/damage across all 4), each with its own secondary
// effect on a successful hit: fire bolt burns (same DoT as the
// pre-existing augue/fireball mechanic, see game.gateway.ts's
// augueBurns), water bolt slows, air bolt knocks back slightly, earth
// bolt stuns briefly in place.
export const FIRE_BOLT_SKILL = 'fire bolt';
export const WATER_BOLT_SKILL = 'water bolt';
export const AIR_BOLT_SKILL = 'air bolt';
export const EARTH_BOLT_SKILL = 'earth bolt';
export const ELEMENTAL_BOLT_SKILLS = [FIRE_BOLT_SKILL, WATER_BOLT_SKILL, AIR_BOLT_SKILL, EARTH_BOLT_SKILL];
// A later follow-up ask: all "bolt" spells cost 7 mana per cast (see
// ARCANE_BOLT_MANA_COST below, the other "bolt"-named spell).
export const ELEMENTAL_BOLT_MANA_COST = 7;
export const ELEMENTAL_BOLT_DAMAGE = 10;
// "A cooldown of 1 combat tick" — same literal MONSTER_TICK_INTERVAL_MS
// reasoning as Arcane Bolt's own cooldown (shared/ can't import a
// server-only constant); these are direct siblings of that spell.
export const ELEMENTAL_BOLT_COOLDOWN_MS = 1 * 3000;
// "Create a rock formation around the target's legs for 1 combat tick" —
// earth bolt's own stun duration, deliberately shorter than
// stupefaciunt's own 2-tick STUPEFACIUNT_STUN_TICKS.
export const EARTH_BOLT_STUN_TICKS = 1;
// "Slow the monster down for 1 combat tick."
export const WATER_BOLT_SLOW_TICKS = 1;
// "Slightly push the monster or player back" — one tile, a much smaller
// nudge than Battlemage's own kinetic-strike knockback (7 feet).
export const AIR_BOLT_KNOCKBACK_TILES = 1;

// The Cleric specialization's own level-15 spell (a later follow-up ask)
// — heals the caster's own "friendly target" (see game.gateway.ts's
// handleCastLesserHeal for exactly what counts), falling back to healing
// the caster themselves when no such target is selected. No cooldown of
// its own — mana cost alone gates recasting, same as recall.
export const LESSER_HEAL_SKILL = 'lesser heal';
export const LESSER_HEAL_MANA_COST = 10;
export const LESSER_HEAL_AMOUNT = 15;

// The Cleric specialization's own passive (a later follow-up ask) — a
// flat bonus added to the caster's basic (ranged or physical) attack
// damage, but ONLY against a target classified undead (a monster with
// MonsterClass 'undead', or any character — monster/NPC/player — of the
// 'skeleton' race; see game.gateway.ts's isUndeadTarget). One of the rare
// skills explicitly stated to start at MAX_SKILL_PERCENT (see
// startingPercentFor below) rather than the ordinary 70% baseline.
export const ENHANCED_UNDEAD_DAMAGE_SKILL = 'enhanced undead damage';
export const ENHANCED_UNDEAD_DAMAGE_BONUS = 5;

// The Druid specialization's own level-15 spell (a later follow-up ask)
// — no target at all, always heals the caster. A short 5-second
// cooldown (only starts on a successful cast) rather than the
// minutes-long cooldowns every other spell here uses.
export const LESSER_SELF_HEAL_SKILL = 'lesser self heal';
export const LESSER_SELF_HEAL_MANA_COST = 5;
export const LESSER_SELF_HEAL_AMOUNT = 10;
export const LESSER_SELF_HEAL_COOLDOWN_MS = 5 * 1000;

// The Druid specialization's other level-15 spell (a later follow-up
// ask) — a fixed-duration self-transformation, same "always ON for its
// own duration once cast, no manual toggle-off" shape as scutum/barrier
// (needs the same full PlayerState/world-manager threading THOSE use,
// since every nearby player needs to see the caster's sprite actually
// change — see WorldScene's own wisp-sprite swap). While active: no
// attacking (see game.gateway.ts's wispActive checks in handlePunch/
// handleUseSkill/handleEngageRangedAttack) and movement is 20% faster
// (see WorldScene's effectiveMoveCooldownMs).
export const WISP_TRANSFORMATION_SKILL = 'wisp transformation';
export const WISP_TRANSFORMATION_MANA_COST = 20;
export const WISP_TRANSFORMATION_DURATION_MS = 2 * 60 * 1000;
export const WISP_TRANSFORMATION_COOLDOWN_MS = 3 * 60 * 1000;
// "20% faster" — a move-cooldown multiplier, same shape as celeritas's
// own 0.9 factor (10% faster) in WorldScene's effectiveMoveCooldownMs.
export const WISP_MOVE_COOLDOWN_FACTOR = 0.8;

// The Druid specialization's own level-10 "Tame Beast" spell (a later
// follow-up ask) — requires a live monster classified 'beast' (see
// shared/constants.ts's MonsterClass) selected as the target first;
// converts it into a TamedBeastSnapshot in the caster's own group on a
// successful cast (see game.gateway.ts's handleCastTameBeast). "7 feet
// equivalent" matches this project's existing 1-tile-per-foot convention
// (kinetic strike's own knockback, augue's own range, ...).
export const TAME_BEAST_SKILL = 'tame beast';
export const TAME_BEAST_MANA_COST = 30;
export const TAME_BEAST_RANGE_TILES = 7;
export const TAME_BEAST_COOLDOWN_MS = 5 * 1000;
// "No more than 3 levels higher than the player" — the OTHER half ("or
// that are lower level than the player") is already implied by this same
// bound (a lower-level beast trivially satisfies "no more than 3 higher"
// too), so this single constant is the whole rule.
export const TAME_BEAST_MAX_LEVEL_ABOVE_PLAYER = 3;

// Item 11: the Druid's own level-10 "Transform" spell — turns the caster
// into any beast kind they've ever successfully tamed (see
// shared/pets.ts's own tracking-system doc comment and game.gateway.ts's
// handleCastTransform), for a fixed duration, with a real combat-mechanic
// swap (a flat physical "beast paw" attack instead of the caster's own
// weapon/wand, plus a temporary hp/armor boost) — see
// BEAST_TRANSFORM_HP_BONUS/BEAST_TRANSFORM_ARMOR_BONUS below.
export const TRANSFORM_SKILL = 'transform';
export const TRANSFORM_MANA_COST = 40;
export const TRANSFORM_DURATION_MS = 4 * 60 * 1000;
export const TRANSFORM_COOLDOWN_MS = 5 * 60 * 1000;
// "Enhanced health and armor" — flat bonuses applied for the transform's
// own duration (see handleCastTransform/checkBeastTransformExpiry), not
// scaled per-beast (every beast kind gives the same flat bump) — simple,
// predictable, and easy to fully revert on expiry.
export const BEAST_TRANSFORM_HP_BONUS = 60;
export const BEAST_TRANSFORM_ARMOR_BONUS = 4;

// The Utility Classroom's own level-10 "identify" spell (a later
// follow-up ask) — "requires first selecting an item from the
// inventory... opens another small window with the name, stats, and
// description of the item." Available to every specialization (taught by
// the Utility teacher, no SKILL_SPECIALIZATION_REQUIREMENT entry), same
// as recall/flight.
export const IDENTIFY_SKILL = 'identify';
// Item 12's mana-cost audit — lowered from 15: identify has zero combat
// impact and zero risk (no target to fumble against, just a pure
// information readout), so it shouldn't cost as much as spells that
// actually damage/buff/debuff something. Priced below lesser heal (10).
export const IDENTIFY_MANA_COST = 8;
export const IDENTIFY_COOLDOWN_MS = 3 * 1000;

// The Battlemage specialization's own 2 level-15 passives (a later
// follow-up ask) — each a CHANCE (scaled off learned percent, same
// scaledSkillChance formula hobgoblin's second/third attack already
// uses) to grant a flat +5, rolled per-hit. Enhanced armor grows every
// hit the battlemage TAKES from a monster; enhanced damage grows every
// ranged/physical attack the battlemage MAKES (see game.gateway.ts's
// resolveMonsterCounterAttack/rollExtraAttacks). Named
// BATTLEMAGE_ENHANCED_DAMAGE_SKILL with its own distinct string value —
// the ask calls it "enhanced damage" too, same as the pre-existing
// Hobgoblin-only ENHANCED_DAMAGE_SKILL, but the two must never share a
// literal skills-record key or a Hobgoblin Battlemage's innate flat
// bonus and this chance-based learned one would corrupt each other.
export const BATTLEMAGE_ENHANCED_ARMOR_SKILL = 'enhanced armor';
export const BATTLEMAGE_ENHANCED_ARMOR_BONUS = 5;
export const BATTLEMAGE_ENHANCED_DAMAGE_SKILL = 'battlemage enhanced damage';
export const BATTLEMAGE_ENHANCED_DAMAGE_BONUS = 5;

// The Battlemage specialization's own level-15 spell (a later follow-up
// ask) — same targeted, ranged, monster/npc-only shape as the
// Elementalist's bolts (see game.gateway.ts's resolveElementalBolt,
// reused directly with this spell's own damage/mana figures), but knocks
// the target back a full 7 tiles ("7 feet equivalent") instead of
// applying a status effect. No mana cost or cooldown was specified in
// the original ask — mana matches every other targeted-attack spell
// here (SPELL_ATTACK_MANA_COST), and the cooldown matches the
// Elementalist bolts' own 1-combat-tick figure, as the closest sibling
// spell shape.
export const KINETIC_STRIKE_SKILL = 'kinetic strike';
export const KINETIC_STRIKE_MANA_COST = 10;
// A later follow-up balance pass ("examine the base damage for all
// spells... increase or decrease based on balanced judgement") bumped
// this from 5 to 8 — costing MORE mana than every elemental bolt (10 vs
// 7) while hitting for HALF their base damage (5 vs 10) wasn't justified
// by the knockback alone, which is a positioning tool, not a damage
// multiplier the way the bolts' own burn/slow/stun effects double as.
export const KINETIC_STRIKE_DAMAGE = 8;
export const KINETIC_STRIKE_KNOCKBACK_TILES = 7;
export const KINETIC_STRIKE_COOLDOWN_MS = 1 * 3000;

// The Hemomancer specialization's own resource (a later follow-up ask)
// — a flat, never-scaling max (unlike hp/mana/mv, no maxBp column at
// all — see player.entity.ts's own bp column). Granted at MAX_BP the
// moment a player becomes a Hemomancer (see game.gateway.ts's
// handleChooseSpecialization); regenerates on every stat tick like mana,
// but at BP_REGEN_MULTIPLIER the rate (see applyStatTick), and — unlike
// every other resource here — has no floor at 0: see
// SAP_HEALTH_HP_PENALTY below.
export const MAX_BP = 100;
export const BP_REGEN_MULTIPLIER = 2;

// The Hemomancer specialization's own level-15 spell (a later follow-up
// ask) — the first spell in the game costed in BP instead of mana. Same
// targeted, ranged, monster/npc-only shape as the Elementalist's bolts,
// but drains the damage dealt back to the caster as healing (the ask's
// own "blood flowing from the target into the player" animation cue).
// "The player should be able to continue using BP even when they reach
// 0 or below" — casting never fails for lack of BP, it just goes
// negative; but "once the player STARTS USING BP BELOW 0" (i.e. BP is
// ALREADY negative at the moment of a fresh cast) "it should cost them
// half the spell cost... in health per cast" — see
// game.gateway.ts's handleCastSapHealth for exactly where that check
// happens (BEFORE this cast's own deduction, not after).
export const SAP_HEALTH_SKILL = 'sap health';
export const SAP_HEALTH_BP_COST = 10;
export const SAP_HEALTH_AMOUNT = 10;
export const SAP_HEALTH_HP_PENALTY = Math.floor(SAP_HEALTH_BP_COST / 2);
export const SAP_HEALTH_COOLDOWN_MS = 1 * 3000;

// The Summoner specialization's own level-15 spell (a later follow-up
// ask) — "similar mechanics to animate dead or pets," so it reuses
// AnimatedMonsterManagerService.animate() directly (same
// animatedMonsterCapFor cap: 1 at level 15, 2 at level 20 — identical
// numbers to animate dead's own cap, not a coincidence) rather than a
// new manager service. Clicking/hotkeying it opens a modal (client-side)
// listing every unique monster kind this Summoner has ever killed (see
// game.gateway.ts's recordMonsterKill, gated on specialization ===
// 'summoner'); picking one from that modal is the actual cast, costing
// mana and rolling success like any other spell. The summoned monster's
// stats are the killed species' own base maxHp/attackDamage (see
// MONSTER_SPECIES) plus these flat bonuses.
export const MONSTER_SUMMONS_SKILL = 'monster summons';
export const MONSTER_SUMMONS_MANA_COST = 20;
// No cooldown was specified in the original ask — matches
// ANIMATE_DEAD_COOLDOWN_MS exactly, the closest sibling spell (both
// summon a persistent ally through the same manager service).
export const MONSTER_SUMMONS_COOLDOWN_MS = ANIMATE_DEAD_COOLDOWN_MS;
export const MONSTER_SUMMONS_HP_BONUS = 100;
export const MONSTER_SUMMONS_DAMAGE_BONUS = 5;

// The Diabolist specialization's own level-15 spell (a later follow-up
// ask) — "similar mechanics to animate dead or pets" (same cap, same
// command/remove infrastructure), but a FIXED summon rather than
// choosing from a killed-monster list: always the same new,
// Diabolist-only MonsterKind with its own fixed stats, never a wild
// spawn (no MONSTER_SPECIES entry, no corpse). "Draw the aggro of
// monsters the player is attacking" is handled server-side in
// MonsterManagerService's own setAggro/setDemonImpCallbacks.
export const DEMON_IMP_KIND: MonsterKind = 'demon imp';
export const SUMMON_DEMON_IMP_SKILL = 'summon demon imp';
export const SUMMON_DEMON_IMP_MANA_COST = 20;
export const DEMON_IMP_HP = 200;
export const DEMON_IMP_DAMAGE = 10;
// No cooldown was specified in the original ask — matches
// ANIMATE_DEAD_COOLDOWN_MS exactly, the closest sibling spell (both
// summon a persistent ally through the same manager service).
export const SUMMON_DEMON_IMP_COOLDOWN_MS = 3 * 60 * 1000;

// The Diabolist specialization's other level-15 skill (a later follow-up
// ask) — same "+5 vs a classified target" shape as Cleric's enhanced
// undead damage, but for a 'holy' classification that doesn't exist
// anywhere in this game yet (MonsterClass is only 'normal' | 'undead' —
// see shared/constants.ts). Deliberately NOT wired into any damage
// calculation (would just be permanently-dead code always checking
// false) — learnable and described like every other skill, but stays
// mechanically inert until some future monster/race is actually
// classified holy.
export const ENHANCED_HOLY_DAMAGE_SKILL = 'enhanced holy damage';
export const ENHANCED_HOLY_DAMAGE_BONUS = 5;

// The Illusionist specialization's own level-15 spell (a later follow-up
// ask) — a fixed-duration self-buff like scutum, but with an extra early-
// cancel condition scutum doesn't have: "if the player attacks while
// invisible then the effect should go away" (see game.gateway.ts's
// breakInvisibilityIfActive, checked at the same basic-attack entry
// points wisp's own no-attack rule uses). Two conflicting mana figures
// appeared in the original ask (10, then 15) — going with 15, the more
// specific one (mentioned alongside the spell's own cooldown). "Monsters
// and players cannot see the player" is handled server-side (clears/
// blocks monster aggro — see MonsterManagerService's own
// setInvisibilityChecker) and client-side (bystanders skip rendering
// this player's sprite entirely — see WorldScene's applyMapState; the
// CASTER's own client instead fades their own sprite, per "make the
// player's sprite slightly faded").
export const INVISIBILITY_SKILL = 'invisibility';
export const INVISIBILITY_MANA_COST = 15;
export const INVISIBILITY_DURATION_MS = 1 * 60 * 1000;
export const INVISIBILITY_COOLDOWN_MS = 2 * 60 * 1000;

// The Illusionist specialization's other level-15 spell (a later follow-
// up ask) — "similar mechanics to animate dead or pets" (same cap, same
// command/remove infrastructure) but a FIXED 5-minute lifespan (unlike
// every other animated ally here, which lasts until logged out or
// killed) — see game.gateway.ts's own activeDuplicates registry/
// checkDuplicateExpiry. Renders as an exact copy of the caster's own
// sprite (their Race — see AnimatedMonsterSnapshot's own widened
// monsterKind type) rather than a MonsterKind. "Should do ranged or
// physical damage depending on what is equipped" is captured as a single
// damage-figure SNAPSHOT taken at cast time (see
// game.gateway.ts's duplicateDamageFor) — no animated monster/pet in
// this game has live equipment-aware combat AI yet ('attack' mode is
// still just a stored command, not yet resolved into actual damage, for
// every summon type built so far), so this matches that same existing
// scope boundary rather than inventing one just for the duplicate.
export const CREATE_DUPLICATE_SKILL = 'create duplicate';
export const CREATE_DUPLICATE_MANA_COST = 20;
export const CREATE_DUPLICATE_HP_MULTIPLIER = 0.75;
export const CREATE_DUPLICATE_DURATION_MS = 5 * 60 * 1000;
export const CREATE_DUPLICATE_COOLDOWN_MS = 6 * 60 * 1000;

// A later follow-up ask: "add a 'flight' spell available to every
// specialization at level 25" — unlike every level-15 spell above, this
// has NO SKILL_SPECIALIZATION_REQUIREMENT entry at all (undefined = any
// specialization, or none), taught from the Utility Classroom alongside
// haste/recall (see teachers.ts) rather than any one chamber. Same
// "always ON for its own fixed duration once cast, no manual toggle-off"
// shape as scutum/barrier/wisp — flying over water (the moat) and the
// move-speed bonus are handled where movement itself is resolved (see
// world-manager.service.ts's isOccupied `flying` param and WorldScene's
// effectiveMoveCooldownMs), not here. "10 feet equivalent" for the
// spacebar burst matches this project's existing 1-tile-per-foot
// convention (KINETIC_STRIKE_KNOCKBACK_TILES's own "7 feet", etc.).
export const FLIGHT_SKILL = 'flight';
export const FLIGHT_MANA_COST = 30;
export const FLIGHT_DURATION_MS = 3 * 60 * 1000;
export const FLIGHT_COOLDOWN_MS = 4 * 60 * 1000;
// "Increase the player's movement speed similar to the speed of wisp
// transformation" — reuses wisp's own 20%-faster factor exactly.
export const FLIGHT_MOVE_COOLDOWN_FACTOR = WISP_MOVE_COOLDOWN_FACTOR;
export const FLIGHT_BURST_TILES = 10;
export const FLIGHT_BURST_COOLDOWN_MS = 10 * 1000;

// A later follow-up ask: "followers should move as fast as the player,
// even with speed enhancements active" — followers used to step on a
// flat FOLLOWER_STEP_MS server tick (server/game-gateway/game.gateway.ts)
// completely unaware of any of the owner's own speed buffs, so a
// celeritas/wisp/flight/boots-of-quickness-buffed player quickly outran
// them. This mirrors WorldScene's own client-side effectiveMoveCooldownMs
// formula EXACTLY (same base, same stacking multipliers, same order) so
// the server can compute the SAME number for a follower's owner and use
// it to decide how many steps that follower should take per tick — kept
// as a deliberate duplicate (that client method stays client-only/
// untouched, same "shared/ can't import a server-only or client-only
// module" tradeoff shared/equipment.ts's own EQUIPMENT_ITEM_BONUS_LABEL
// doc comment already accepts) rather than risking a refactor of a
// delicate, already-working player-movement function just to share it.
export const BASE_MOVE_COOLDOWN_MS = 220;
const DEX_MOVE_SPEED_PERCENT_PER_POINT = 0.015;
const MIN_MOVE_COOLDOWN_FACTOR = 0.4;

export interface MoveSpeedState {
  celeritasActive: boolean;
  wispActive: boolean;
  flightActive: boolean;
  beastTransformActive: boolean;
  beastTransformKind: MonsterKind | null;
  dexterity: number;
  bootsItem: string | undefined;
}

export function effectiveMoveCooldownMs(state: MoveSpeedState): number {
  let base = state.celeritasActive ? Math.round(BASE_MOVE_COOLDOWN_MS * 0.9) : BASE_MOVE_COOLDOWN_MS;
  if (state.bootsItem === 'boots of quickness') base = Math.round(base * 0.9);
  if (state.wispActive) base = Math.round(base * WISP_MOVE_COOLDOWN_FACTOR);
  if (state.flightActive || (state.beastTransformActive && isFlyingBeastKind(state.beastTransformKind))) {
    base = Math.round(base * FLIGHT_MOVE_COOLDOWN_FACTOR);
  }
  if (state.beastTransformActive) base = Math.round(base * 0.9);
  const dexReduction = Math.max(0, state.dexterity - 1) * DEX_MOVE_SPEED_PERCENT_PER_POINT;
  return Math.round(base * Math.max(MIN_MOVE_COOLDOWN_FACTOR, 1 - dexReduction));
}

// The small number of skills explicitly stated to start at 100% instead
// of the ordinary 70% baseline (see STARTING_SKILL_PERCENT above) — both
// are passive "extra damage vs a classified target" skills belonging to
// specializations whose own flavor is built around already being
// experts at it (Cleric vs undead here; Diabolist vs holy, still to come).
export const FULLY_LEARNED_SKILLS = [ENHANCED_UNDEAD_DAMAGE_SKILL, ENHANCED_HOLY_DAMAGE_SKILL];
export function startingPercentFor(skill: string): number {
  return FULLY_LEARNED_SKILLS.includes(skill) ? MAX_SKILL_PERCENT : STARTING_SKILL_PERCENT;
}

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
  // A later follow-up ask lowered the specialization-choice level from 15
  // to 10 (see SPECIALIZATION_LEVEL_REQUIREMENT in shared/constants.ts) and
  // asked that every specialization's own spell follow suit — every entry
  // below that also appears in SKILL_SPECIALIZATION_REQUIREMENT dropped
  // from 15 to 10 to match. RECALL_SKILL stays at 15: it has no
  // specialization restriction, so it wasn't part of that ask.
  [ANIMATE_DEAD_SKILL]: 10,
  [RECALL_SKILL]: 15,
  [BARRIER_SKILL]: 10,
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: 10,
  [FIRE_BOLT_SKILL]: 10,
  [WATER_BOLT_SKILL]: 10,
  [AIR_BOLT_SKILL]: 10,
  [EARTH_BOLT_SKILL]: 10,
  [LESSER_HEAL_SKILL]: 10,
  [ENHANCED_UNDEAD_DAMAGE_SKILL]: 10,
  [LESSER_SELF_HEAL_SKILL]: 10,
  [WISP_TRANSFORMATION_SKILL]: 10,
  [TAME_BEAST_SKILL]: 10,
  [TRANSFORM_SKILL]: 10,
  [IDENTIFY_SKILL]: 10,
  [BATTLEMAGE_ENHANCED_ARMOR_SKILL]: 10,
  [BATTLEMAGE_ENHANCED_DAMAGE_SKILL]: 10,
  [KINETIC_STRIKE_SKILL]: 10,
  [SAP_HEALTH_SKILL]: 10,
  [MONSTER_SUMMONS_SKILL]: 10,
  [SUMMON_DEMON_IMP_SKILL]: 10,
  [ENHANCED_HOLY_DAMAGE_SKILL]: 10,
  [INVISIBILITY_SKILL]: 10,
  [CREATE_DUPLICATE_SKILL]: 10,
  [FLIGHT_SKILL]: 25,
};

// A skill/spell that also requires a specific chosen specialization to
// learn at all, on top of its own level requirement (undefined = no
// specialization restriction, learnable at any classroom teacher once the
// level is met).
export const SKILL_SPECIALIZATION_REQUIREMENT: Partial<Record<string, SpecializationPath>> = {
  [ANIMATE_DEAD_SKILL]: 'necromancer',
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: 'shaman',
  [FIRE_BOLT_SKILL]: 'elementalist',
  [WATER_BOLT_SKILL]: 'elementalist',
  [AIR_BOLT_SKILL]: 'elementalist',
  [EARTH_BOLT_SKILL]: 'elementalist',
  [LESSER_HEAL_SKILL]: 'cleric',
  [ENHANCED_UNDEAD_DAMAGE_SKILL]: 'cleric',
  [LESSER_SELF_HEAL_SKILL]: 'druid',
  [WISP_TRANSFORMATION_SKILL]: 'druid',
  [TAME_BEAST_SKILL]: 'druid',
  [TRANSFORM_SKILL]: 'druid',
  [BATTLEMAGE_ENHANCED_ARMOR_SKILL]: 'battlemage',
  [BATTLEMAGE_ENHANCED_DAMAGE_SKILL]: 'battlemage',
  [KINETIC_STRIKE_SKILL]: 'battlemage',
  [SAP_HEALTH_SKILL]: 'hemomancer',
  [MONSTER_SUMMONS_SKILL]: 'summoner',
  [SUMMON_DEMON_IMP_SKILL]: 'diabolist',
  [ENHANCED_HOLY_DAMAGE_SKILL]: 'diabolist',
  [INVISIBILITY_SKILL]: 'illusionist',
  [CREATE_DUPLICATE_SKILL]: 'illusionist',
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
  RECALL_SKILL,
  BARRIER_SKILL,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  FIRE_BOLT_SKILL,
  WATER_BOLT_SKILL,
  AIR_BOLT_SKILL,
  EARTH_BOLT_SKILL,
  LESSER_HEAL_SKILL,
  ENHANCED_UNDEAD_DAMAGE_SKILL,
  LESSER_SELF_HEAL_SKILL,
  WISP_TRANSFORMATION_SKILL,
  TAME_BEAST_SKILL,
  TRANSFORM_SKILL,
  IDENTIFY_SKILL,
  BATTLEMAGE_ENHANCED_ARMOR_SKILL,
  BATTLEMAGE_ENHANCED_DAMAGE_SKILL,
  KINETIC_STRIKE_SKILL,
  SAP_HEALTH_SKILL,
  MONSTER_SUMMONS_SKILL,
  SUMMON_DEMON_IMP_SKILL,
  ENHANCED_HOLY_DAMAGE_SKILL,
  INVISIBILITY_SKILL,
  CREATE_DUPLICATE_SKILL,
  FLIGHT_SKILL,
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
  // "A cooldown of 4 minutes" (a later follow-up ask, for barrier) — only
  // gates starting a FRESH barrier; recasting while one is already active
  // cancels it instead, bypassing this entirely (see
  // game.gateway.ts's handleCastBarrier).
  [BARRIER_SKILL]: BARRIER_COOLDOWN_MS,
  // "A 4 minute cooldown" (a later follow-up ask, for Shaman's enhance
  // damage) — only starts on a successful cast, same as every other timed
  // self-buff here.
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: SHAMAN_ENHANCE_DAMAGE_COOLDOWN_MS,
  [FIRE_BOLT_SKILL]: ELEMENTAL_BOLT_COOLDOWN_MS,
  [WATER_BOLT_SKILL]: ELEMENTAL_BOLT_COOLDOWN_MS,
  [AIR_BOLT_SKILL]: ELEMENTAL_BOLT_COOLDOWN_MS,
  [EARTH_BOLT_SKILL]: ELEMENTAL_BOLT_COOLDOWN_MS,
  // "5 second cooldown on success" (a later follow-up ask, for Druid's
  // lesser self heal) — only starts on a successful cast, same as every
  // other timed spell/self-buff here.
  [LESSER_SELF_HEAL_SKILL]: LESSER_SELF_HEAL_COOLDOWN_MS,
  // "A 3 minute cooldown on success" (a later follow-up ask, for wisp
  // transformation).
  [WISP_TRANSFORMATION_SKILL]: WISP_TRANSFORMATION_COOLDOWN_MS,
  [TAME_BEAST_SKILL]: TAME_BEAST_COOLDOWN_MS,
  [TRANSFORM_SKILL]: TRANSFORM_COOLDOWN_MS,
  [IDENTIFY_SKILL]: IDENTIFY_COOLDOWN_MS,
  [KINETIC_STRIKE_SKILL]: KINETIC_STRIKE_COOLDOWN_MS,
  [SAP_HEALTH_SKILL]: SAP_HEALTH_COOLDOWN_MS,
  [MONSTER_SUMMONS_SKILL]: MONSTER_SUMMONS_COOLDOWN_MS,
  [SUMMON_DEMON_IMP_SKILL]: SUMMON_DEMON_IMP_COOLDOWN_MS,
  [INVISIBILITY_SKILL]: INVISIBILITY_COOLDOWN_MS,
  [CREATE_DUPLICATE_SKILL]: CREATE_DUPLICATE_COOLDOWN_MS,
  [FLIGHT_SKILL]: FLIGHT_COOLDOWN_MS,
  [RECALL_SKILL]: RECALL_COOLDOWN_MS,
};

export const RACE_INNATE_SKILLS: Record<Race, string[]> = {
  goblin: [INFRAVISION_SKILL],
  skeleton: [GLARE_SKILL, ENHANCED_DURABILITY_SKILL],
  zombie: [EAT_BRAINS_SKILL],
  dragonborn: [LACERATE_SKILL],
  // A follow-up ask removed the /mimic and /revert commands entirely — a
  // slime has no innate skill of its own now.
  slime: [],
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
