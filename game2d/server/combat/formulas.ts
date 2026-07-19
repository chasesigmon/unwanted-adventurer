// Pure, dependency-free combat/leveling formulas — mirrors the shape of
// the text game's own src/server/players/leveling.ts and skills.ts, sized
// down to this project's smaller scope (one active attack — punch — but
// now with equipment, resistances, and dodge/parry/shield-block ported
// from the text game).
import { isWandItem } from '../../shared/equipment.js';
import type { MonsterClass, Race } from '../../shared/constants.js';
export { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, EQUIPMENT_SLOT_FOR_ITEM, type EquipmentSlot } from '../../shared/equipment.js';
import {
  STARTING_SKILL_PERCENT,
  MAX_SKILL_PERCENT,
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_SKILLS,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_FIRE_RESISTANCE,
  RACE_INNATE_SKILLS,
  BONE_FINGER_STRIKE_SKILL,
} from '../../shared/skills.js';
export {
  STARTING_SKILL_PERCENT,
  MAX_SKILL_PERCENT,
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_SKILLS,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  RACE_INNATE_SKILLS,
  INFRAVISION_SKILL,
  LACERATE_SKILL,
  EAT_BRAINS_SKILL,
  GLARE_SKILL,
  ENHANCED_DURABILITY_SKILL,
  BONE_FINGER_STRIKE_SKILL,
  SKILL_COOLDOWN_MS,
} from '../../shared/skills.js';

export const STARTING_ATTRIBUTE = 1;
export const STARTING_VITAL = 100;
// Movement points (a later follow-up ask re-added this resource) — every
// race starts with the same value, unlike hp/mana which will vary per
// race (see RACE_STARTING_STATS). A later follow-up ask matched this to
// STARTING_VITAL (100), same as hp/mana, down from the original 200.
export const STARTING_MV = STARTING_VITAL;
// "1 point per 2 feet moved" — this project already treats "N feet" as N
// tiles everywhere else (shop/gate reach, spell ranges), so this is 0.5 mv
// per tile. Floors at 0 rather than blocking movement — mv depletes/
// regens but doesn't gate anything yet (a deliberate first-pass scope,
// same as a few other "earnable now, inert until wired to something"
// mechanics already in this project).
export const MV_COST_PER_TILE = 0.2;
export const STARTING_LEVEL = 1;
// A goblin can't level past this without evolving — matches the text
// game's own GOBLIN_MAX_LEVEL exactly. (Skeleton/zombie/dragonborn/slime
// have no such cap in this project yet — none of them has a defined 2nd
// form to evolve into.)
export const GOBLIN_MAX_LEVEL = 10;
export const STARTING_EXP = 0;
export const STARTING_GOLD = 20;

// "Increase the chance that skills can get better with usage to 5% per
// cast" (a later follow-up ask, up from 2%).
export const SKILL_GROWTH_CHANCE = 0.05;
// "Within the 5% chance that skills can increase, that also there is a
// 20% chance the skill/spell can increase by 2%" (a later follow-up ask)
// — a second, nested roll: once the ordinary growth chance above already
// hit, 20% of THOSE successes bump the skill by BIG_SKILL_GROWTH_AMOUNT
// instead of the usual 1.
export const BIG_SKILL_GROWTH_CHANCE = 0.2;
export const BIG_SKILL_GROWTH_AMOUNT = 2;

// Every race gets the universal kit (punch/dodge/parry/shield block/
// dagger) at STARTING_SKILL_PERCENT, PLUS its own innate skill(s) (see
// RACE_INNATE_SKILLS) at MAX_SKILL_PERCENT — innate abilities are simply
// there from birth, not something practiced up from scratch.
export function startingSkills(race: Race): Record<string, number> {
  // A human wizard starts with none of the old fantasy-race skill kit at
  // all (item 7) — punch/dodge/parry/shield-block/dagger were designed
  // for the goblin-game's melee combat, and are being fully replaced by a
  // wizard-appropriate spell/skill system (not built yet). The original 5
  // races are untouched — this only changes what a brand NEW human
  // character starts with.
  if (race === 'human') return {};

  const skills = Object.fromEntries(STARTING_SKILLS.map((skill) => [skill, STARTING_SKILL_PERCENT]));
  for (const skill of RACE_INNATE_SKILLS[race] ?? []) {
    skills[skill] = MAX_SKILL_PERCENT;
  }
  return skills;
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
  // Starts at STARTING_ATTRIBUTE like every other stat — no mechanical
  // effect yet, deliberately: what it does is future work, not decided
  // yet, so nothing here should grow it (level-up/evolution bonuses are
  // intentionally NOT extended to include it).
  luck: number;
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

// --- Armor vs Physical / Armor vs Magical (a later follow-up ask split
// the old single "Armor Class" into two tracks) — every player race and
// monster starts here, on top of dodge/parry/shield-block (which fully
// negate a hit by chance) and resistance skills (their own flat reduction
// against a monster class specifically). Matches the design note this
// was modeled after: armor is deliberately the WEAKEST defense layer, a
// modest flat mitigation rather than a wall, not something that scales
// into relevance the way skills do. Each of these two numbers IS the
// final flat damage reduction directly (no further division needed by a
// caller) — Armor vs Physical mitigates melee/punch/dagger hits, Armor vs
// Magical mitigates spell damage (elemental bolts, wand bolt, augue,
// kinetic strike, sap health). ---

export const BASE_ARMOR_VS_PHYSICAL = 2;
export const BASE_ARMOR_VS_MAGICAL = 2;
// Physical armor draws on BOTH dexterity (already the dodge-chance stat)
// and strength (raw toughness) — split evenly so a str/dex-balanced
// character ends up with roughly the same total the old dex-only AC/4
// formula gave at the same stat totals.
const ARMOR_VS_PHYSICAL_PER_DEXTERITY = 10;
const ARMOR_VS_PHYSICAL_PER_STRENGTH = 10;
// Magical armor is brand new — intelligence (a spellcaster's own
// awareness of incoming magic) and wisdom (resistance to it), the same
// pairing INFRAVISION_SKILL/spell-damage formulas already lean on
// elsewhere in this file.
const ARMOR_VS_MAGICAL_PER_INTELLIGENCE = 10;
const ARMOR_VS_MAGICAL_PER_WISDOM = 10;

export function armorVsPhysicalFor(dexterity: number, strength: number, equipmentBonus: number): number {
  return BASE_ARMOR_VS_PHYSICAL + Math.floor(dexterity / ARMOR_VS_PHYSICAL_PER_DEXTERITY) + Math.floor(strength / ARMOR_VS_PHYSICAL_PER_STRENGTH) + equipmentBonus;
}

export function armorVsMagicalFor(intelligence: number, wisdom: number, equipmentBonus: number): number {
  return BASE_ARMOR_VS_MAGICAL + Math.floor(intelligence / ARMOR_VS_MAGICAL_PER_INTELLIGENCE) + Math.floor(wisdom / ARMOR_VS_MAGICAL_PER_WISDOM) + equipmentBonus;
}

// A later follow-up ask replaced the old flat "subtract armor straight off
// the damage" mitigation with a percentage-based curve — the flat version
// let a single unlucky (or just under-leveled) hit get reduced to exactly
// 0 the moment armor caught up to raw damage, an all-or-nothing cliff
// rather than a gradual "armor helps, but never trivializes a hit"
// mitigation. Also fixes a real bug the flat version had been hiding: a
// monster with its own flat `attackDamage` (see monster.ts) was bypassing
// armor reduction ENTIRELY (see game.gateway.ts's resolveMonsterCounterAttack) —
// this is the one shared helper every physical AND magical armor
// reduction now goes through, so that bug can't recur species-by-species.
// The exact constant (16) is reverse-engineered from the report that
// prompted this change: "the imp did 5 damage to a level 15 with Armor vs
// Physical of 9... should have been more like 3.2" — 5 * 16/(9+16) =
// 3.2 exactly, so ARMOR_MITIGATION_K = 16 is the one value that matches
// that worked example precisely, not an arbitrary round number.
// Deliberately left un-rounded here — the mitigation fraction itself is
// fractional by construction, and "don't show decimal points for any
// stat to a player, but keep track of it" means the ROUNDING happens once,
// at the point a number actually becomes a discrete event a player sees
// (a hit landing, a combat message) — every call site below (punchDamage,
// and each spell-damage site in game.gateway.ts) rounds its own final
// total exactly once, rather than this shared helper rounding an
// intermediate figure a caller might still be combining with other terms.
export const ARMOR_MITIGATION_K = 16;
export function armorMitigationFraction(armor: number): number {
  return armor / (armor + ARMOR_MITIGATION_K);
}
export function applyArmorMitigation(rawDamage: number, armor: number): number {
  return Math.max(0, rawDamage * (1 - armorMitigationFraction(armor)));
}

export function punchDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  punchSkillPercent: number,
  weaponBonus = 0,
  defenderArmorVsPhysical: number = BASE_ARMOR_VS_PHYSICAL
): number {
  const raw = baseDamage(attacker.strength, attacker.level) + attributeBonus(attacker, defender) + skillBonus(punchSkillPercent) + weaponBonus;
  return Math.round(applyArmorMitigation(raw, defenderArmorVsPhysical));
}

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

// A bone shield's own Armor vs Physical bonus while equipped (item 19) —
// a torch fills the same off-hand slot but isn't armor, same "only a
// real shield counts" carve-out computeShieldBlockChance already makes
// below.
export const BONE_SHIELD_ARMOR_BONUS = 2;

// Flat Armor vs Physical bonus per equipped armor piece — a later
// follow-up ask retuned these directly as final damage-reduction points
// (no more AC-then-divide-by-4 indirection): "cloth armor items... give
// Armor vs Physical + 1... studded armor items... Armor vs Physical + 3."
// Every other existing armor piece is rescaled proportionally onto this
// same small direct-reduction scale (nothing else was named explicitly).
// None of these contribute to Armor vs Magical yet — no magical-armor
// item exists in this game currently (same "earnable now, inert until
// something needs it" tradeoff this project already accepts elsewhere).
export const ARMOR_ITEM_PHYSICAL_BONUS: Record<string, number> = {
  'cloth armor': 1,
  'cloth helmet': 1,
  'cloth boots': 1,
  'cloth vambraces': 1,
  'cloth greaves': 1,
  'cloth gauntlets': 1,
  'studded armor': 3,
  'studded helmet': 3,
  // The 4 portal dungeons' own armor pieces (a later follow-up ask) —
  // one per tier, each noticeably stronger than the last, rescaled onto
  // the same direct-reduction scale as cloth/studded above.
  'chainmail vambraces': 2,
  "warlord's greaves": 4,
  'obsidian helm': 5,
  'dragon scale armor': 6,
};

// No item grants this yet — see this section's own doc comment above.
export const ARMOR_ITEM_MAGICAL_BONUS: Record<string, number> = {};

// Summed across EVERY equipped slot now (a later follow-up ask added
// several more armor pieces beyond the shield) — order-independent, one
// lookup per equipped item, 0 for anything not in ARMOR_ITEM_PHYSICAL_BONUS
// (a weapon, a torch, jewelry, ...).
export function physicalArmorEquipmentBonus(equipment: Record<string, string>): number {
  let bonus = equipment.shield === 'bone shield' ? BONE_SHIELD_ARMOR_BONUS : 0;
  for (const item of Object.values(equipment)) {
    bonus += ARMOR_ITEM_PHYSICAL_BONUS[item] ?? 0;
  }
  return bonus;
}

export function magicalArmorEquipmentBonus(equipment: Record<string, string>): number {
  let bonus = 0;
  for (const item of Object.values(equipment)) {
    bonus += ARMOR_ITEM_MAGICAL_BONUS[item] ?? 0;
  }
  return bonus;
}

// +1 dexterity per opal piece (a later follow-up ask: "opal earrings,
// necklace, and ring should grant +1 dexterity for each") — summed
// across every equipped slot the same way armorEquipmentBonus is, since
// up to 3 opal pieces (earrings, necklace, one ring) could be worn at
// once, each contributing independently. "Wand of quickness" (a later
// follow-up ask's Bramwick Weapons item, +2 dexterity) shares this same
// table/lookup — it's a weapon-slot item, not jewelry, but the bonus
// math is identical either way.
const JEWELRY_DEXTERITY_BONUS: Record<string, number> = {
  'opal earrings': 1,
  'opal ring': 1,
  'opal necklace': 1,
  'wand of quickness': 2,
  // The 4th floor's own portal-dungeon wands (a later follow-up ask) —
  // "wand of frost" (tier 1) grants dexterity; "wand of the ashen king"
  // (tier 4, the toughest dungeon) grants both dexterity AND
  // intelligence (see JEWELRY_INTELLIGENCE_BONUS below too).
  'wand of frost': 2,
  'wand of the ashen king': 2,
};

export function dexterityEquipmentBonus(equipment: Record<string, string>): number {
  let bonus = 0;
  for (const item of Object.values(equipment)) {
    bonus += JEWELRY_DEXTERITY_BONUS[item] ?? 0;
  }
  return bonus;
}

// +1 intelligence per bone ring (a later follow-up ask) — a player can
// only ever wear one (see isRingItem/resolveRingSlot's own 2-ring cap),
// but this stays a sum (not a boolean check) for the same "shape matches
// dexterityEquipmentBonus" consistency, in case a future ring stacks.
// "Wand of intelligence" (a later follow-up ask's Bramwick Weapons item,
// +1 intelligence) shares this same table — a weapon-slot item, not
// jewelry, same reasoning as wand of quickness above.
const JEWELRY_INTELLIGENCE_BONUS: Record<string, number> = {
  'bone ring': 1,
  'wand of intelligence': 1,
  // The 4th floor's own portal-dungeon wands (a later follow-up ask) —
  // "wand of embers" (tier 2) and "wand of shadows" (tier 3) grant
  // intelligence; "wand of the ashen king" (tier 4) grants the most.
  'wand of embers': 2,
  'wand of shadows': 3,
  'wand of the ashen king': 4,
};

export function intelligenceEquipmentBonus(equipment: Record<string, string>): number {
  let bonus = 0;
  for (const item of Object.values(equipment)) {
    bonus += JEWELRY_INTELLIGENCE_BONUS[item] ?? 0;
  }
  return bonus;
}

// A later follow-up ask: "if a player is wearing a ring on one hand then
// tries to wear another ring, put it on the other hand; if the player is
// wearing two rings already... replace the leftRing; put the first ring
// if no rings are equipped onto the rightRing." Any item name ending in
// "ring" (not "earrings" — see the .endsWith check, not .includes) is a
// ring for this purpose.
export function isRingItem(item: string): boolean {
  return item.toLowerCase().endsWith('ring');
}

export function resolveRingSlot(equipment: Record<string, string>): 'leftRing' | 'rightRing' {
  if (!equipment.leftRing && !equipment.rightRing) return 'rightRing';
  if (!equipment.leftRing) return 'leftRing';
  if (!equipment.rightRing) return 'rightRing';
  return 'leftRing';
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
// A later follow-up ask refined this: "a wand can only parry another
// attack from a wand; a physical weapon can parry attacks from physical
// or ranged weapons including wands." Every attack that actually reaches
// resolveDefense today is a melee punch/dagger swing — the ranged
// wand-bolt path skips defense resolution entirely (see
// resolveRangedAutoAttack's own doc comment) and never targets a player
// anyway — so a wand-wielding defender never has anything valid to
// parry against right now; a physical-weapon defender is unaffected
// (already unconditional below, since "physical or ranged" covers
// everything that can reach this check).
export function computeParryChance(
  defender: CombatantStats,
  defenderSkills: Record<string, number>,
  defenderEquipment: Record<string, string>,
  attacker: CombatantStats
): number {
  if (!defenderEquipment.weapon) return 0;
  if (isWandItem(defenderEquipment.weapon)) return 0;
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
// Requires an actual "bone shield" in the slot — a torch fills the same
// slot (see EQUIPMENT_SLOT_FOR_ITEM) but isn't a shield and shouldn't
// grant a block chance. Constitution nudges it a little further (item
// 22) — a steadier stance holds a shield up more reliably — on top of
// the skill-driven base chance.
const SHIELD_BLOCK_CONSTITUTION_DIVISOR = 5;

export function computeShieldBlockChance(
  defenderSkills: Record<string, number>,
  defenderEquipment: Record<string, string>,
  defenderConstitution: number
): number {
  if (defenderEquipment.shield !== 'bone shield') return 0;
  const constitutionBonus = Math.floor(defenderConstitution / SHIELD_BLOCK_CONSTITUTION_DIVISOR) / 100;
  return Math.min(SCALED_SKILL_MAX_CHANCE, scaledSkillChance(defenderSkills[SHIELD_BLOCK_SKILL] ?? 0) + constitutionBonus);
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

// --- Dragonborn-only: lacerate (an extra "laceration" swing per attack,
// rolled independently of anything else) — a 60% base chance scaling up
// to 90% at 100% learned, a noticeably higher/narrower band than the
// generic scaledSkillChance shape above (granted innately at
// MAX_SKILL_PERCENT, so in practice it's always rolled at 90%). ---

const LACERATE_BASE_CHANCE = 0.6;
const LACERATE_MAX_CHANCE = 0.9;

export function computeLacerateChance(skillPercent: number): number {
  const bonus = (LACERATE_MAX_CHANCE - LACERATE_BASE_CHANCE) * (skillPercent / MAX_SKILL_PERCENT);
  return Math.min(LACERATE_MAX_CHANCE, LACERATE_BASE_CHANCE + bonus);
}

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
  // Consuming (not equipping) a torch — right-click "force consume" in
  // the inventory modal, since a torch is normally equippable — has a
  // small 1% chance of teaching lesser fire resistance (item 9).
  torch: { skill: LESSER_FIRE_RESISTANCE, chance: 0.01 },
};

export function resistanceGrantForItem(item: string): ResistanceGrant | undefined {
  return RESISTANCE_FOR_ITEM[item];
}

// --- "Bone finger strike" — a real active attack (unlike the passive
// resistance skills above), with a small chance of being picked up the
// first time a bone dagger is eaten. Starts at STARTING_SKILL_PERCENT and
// grows the same 2%-per-use way as every other skill. ---

export const BONE_FINGER_STRIKE_GRANT_CHANCE = 0.05;
// Base multiplier over the player's own ordinary attack damage (their
// real punchDamage() roll — same strength/level/weapon bonus a normal hit
// uses), per the exact spec: "the damage should be player damage x 1.5".
export const BONE_FINGER_STRIKE_DAMAGE_MULTIPLIER = 1.5;
// "Slightly" scales the multiplier up further with skill percent — +0.2%
// on top of the 1.5x per percent learned, so a maxed-out 100% skill hits
// noticeably harder than a fresh 1% one.
const BONE_FINGER_STRIKE_DAMAGE_PER_PERCENT = 0.002;

export function computeBoneFingerStrikeDamage(basePunchDamage: number, skillPercent: number): number {
  const multiplier = BONE_FINGER_STRIKE_DAMAGE_MULTIPLIER + skillPercent * BONE_FINGER_STRIKE_DAMAGE_PER_PERCENT;
  return Math.round(basePunchDamage * multiplier);
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

// A later follow-up ask: "the experience needed to level up... I think is
// not balanced. Examine the experience gained from monsters and come up
// with a formula for how much experience is needed at each level." The
// old level*100 curve was tuned against a monster roster whose own exp
// rewards hadn't been rescaled consistently as species were leveled up
// (see MONSTER_EXP_REWARD_PER_LEVEL in monster.ts) — once that's fixed,
// a same-level kill is worth roughly EXP_RATIO_MULTIPLIER *
// MONSTER_EXP_REWARD_PER_LEVEL * level exp (see expGainFor below), which
// scales linearly with level exactly the way this curve does — so the
// curve SHAPE (linear in level) stays the same as before, just at a
// bigger per-level constant, which keeps "roughly how many kills to reach
// the next level" constant across the whole 1-40 range instead of
// leveling trivially fast early and grinding to a crawl late (or vice
// versa). TNL_PER_LEVEL(250) is chosen so a level fighting same-level
// monsters takes on the order of 8 kills — see tests/verify-balance-sim.mjs
// for the simulated 1-10 grind this was tuned against.
const TNL_PER_LEVEL = 250;
export function maxTnlForLevel(level: number): number {
  return level * TNL_PER_LEVEL;
}

// A later follow-up ask: "the max player level right now should be 40" —
// a hard overall cap (on top of, not instead of, a goblin's own separate
// GOBLIN_MAX_LEVEL(10) — a goblin still has to evolve into a Hobgoblin to
// keep growing at all, same as before, it just now has this same ceiling
// too once it does). No level ever exceeds this regardless of exp
// gained; exp is discarded rather than banked once maxed.
export const MAX_PLAYER_LEVEL = 40;

export interface LevelState {
  level: number;
  exp: number;
}

// `maxLevel` defaults to the player's own MAX_PLAYER_LEVEL — a follow-up
// ask gave pets their own separate, lower cap ("Pets should be able to
// level up, max level 20") via PetManagerService's own call passing
// PET_MAX_LEVEL here instead, reusing this exact same curve/shape rather
// than a parallel leveling formula.
export function applyExpGain(state: LevelState, gained: number, maxLevel: number = MAX_PLAYER_LEVEL): LevelState {
  let { level, exp } = state;
  if (level >= maxLevel) return { level: maxLevel, exp: 0 };
  exp += gained;
  let maxTnl = maxTnlForLevel(level);
  while (exp >= maxTnl) {
    exp -= maxTnl;
    level += 1;
    if (level >= maxLevel) {
      level = maxLevel;
      exp = 0;
      break;
    }
    maxTnl = maxTnlForLevel(level);
  }
  return { level, exp };
}

// A later follow-up ask replaced the old "every level automatically
// grants +1 to every attribute" system entirely: leveling up grants
// "training points" (stacking if unspent) the player allocates themselves,
// one at a time, to whichever attribute(s) they choose (see
// game.gateway.ts's handleAllocateStatPoint) — a still-later follow-up ask
// changed the cadence from every level to every 5th ("training points are
// allowed to be allocated to stats... every 5 levels a player should get a
// training point"). hp/mana still fully refill on a level-up itself as a
// bonus, same as before.
export const TRAINING_POINTS_PER_5_LEVELS = 1;
export const TRAINING_POINT_LEVEL_INTERVAL = 5;
// "Every level a player should gain 3 practice points" — spent at a
// teacher's own click-to-learn modal (see game.gateway.ts's
// handleLearnSkill), replacing the old podium-reading skill system.
export const PRACTICE_POINTS_PER_LEVEL = 3;
// "New players upon creation should start with 3 trains and 5 practices"
// (a later follow-up ask) — granted once, at character creation (see
// auth.service.ts's createCharacter), on top of whatever the per-level
// formulas above grant afterward as the character actually levels up.
export const STARTING_TRAINING_POINTS = 3;
export const STARTING_PRACTICE_POINTS = 5;
// Constitution's own contribution to max hp (a later follow-up ask: "con
// x 20") — applied incrementally, +HP_PER_CONSTITUTION every time a stat
// point actually goes into constitution (or subtracted by condeath's own
// CON penalty, item 23), so max hp always reflects points actually spent
// rather than being baked in once.
export const HP_PER_CONSTITUTION = 20;
// Intelligence's own contribution to max mana (a later follow-up ask:
// "increase mana by int x 10") — same incremental-on-allocation shape as
// HP_PER_CONSTITUTION above.
export const MANA_PER_INTELLIGENCE = 10;

// A later follow-up ask: "hp and mp should grow by a random amount PER
// LEVEL of 7 to 15 depending on the intelligence and constitution stats" —
// on top of (not instead of) the deliberate HP_PER_CONSTITUTION/
// MANA_PER_INTELLIGENCE bump above. A genuine random roll each level, but
// biased toward the top of the range by the driving stat (constitution for
// hp, intelligence for mana) so a higher stat reliably lands closer to 15
// while a low one stays closer to 7.
export const PER_LEVEL_VITAL_GAIN_MIN = 7;
export const PER_LEVEL_VITAL_GAIN_MAX = 15;
export function perLevelVitalGain(drivingStat: number): number {
  const raw = PER_LEVEL_VITAL_GAIN_MIN + Math.random() * (PER_LEVEL_VITAL_GAIN_MAX - PER_LEVEL_VITAL_GAIN_MIN) + (drivingStat - 1) * 0.3;
  return Math.min(PER_LEVEL_VITAL_GAIN_MAX, Math.max(PER_LEVEL_VITAL_GAIN_MIN, Math.round(raw)));
}

// --- Spellcasting: intelligence/luck bonuses (a later follow-up ask) ---

// "Every point of intelligence should be considered an extra learned
// percent when casting any spell — 10 intelligence would grant +10%
// chance." A flat 1 percentage point per point, added directly to the
// caster's own successChance before the roll (see game.gateway.ts's
// rollSpellSuccess).
export function intelligenceSpellBonus(intelligence: number): number {
  return intelligence;
}

// "The base damage that I have given for all offensive spells should
// increase by 10% of its max for every point of intelligence. So a spell
// with base damage of 20 for the first point of intelligence goes up to
// 22 damage, and then weigh in the next point of intelligence, which
// would b[r]ing the max to 24.2, and then the next point of intelligence
// is weighed against that new max of 24.2 on and on" (a later follow-up
// ask) — a COMPOUNDING multiplier (baseDamage * 1.1^intelligence), not a
// flat per-point bonus (20 + 2 + 2.2 + ... would NOT match "weighed
// against the NEW max" each time).
//
// A still-later follow-up ask ("make it so that all spells do increased
// damage with player level AND with intelligence") layers a second, LINEAR
// multiplier on top for level — kept linear (not also compounding)
// deliberately: the training-point economy caps how much intelligence a
// character can realistically stack (a level-40 character has earned only
// ~11 lifetime training points total — see TRAINING_POINTS_PER_5_LEVELS —
// so effective intelligence rarely exceeds the low teens even fully
// invested), which already keeps the existing compounding factor tame in
// practice (1.1^12 ≈ 3.1x); layering a SECOND compounding factor on top of
// that for level would blow the two up together into a wildly swingy
// total multiplier by level 40, when what was actually asked for is
// simply "consistently stronger over time," not another exponential. 2%
// per level (LEVEL_SPELL_DAMAGE_PERCENT_PER_LEVEL) adds up to +80% at the
// level cap — a meaningful, steady payoff for leveling without dwarfing
// the intelligence term.
//
// Applied to every damage-dealing spell's own base figure (arcane bolt,
// the 4 elemental bolts, kinetic strike, sap health, the wand's own basic
// ranged bolt — see each of their own call sites in game.gateway.ts) —
// deliberately NOT melee punch/counter-attack damage, which isn't
// spellcasting. Uses the caster's TOTAL effective intelligence (base +
// equipment, same intelligenceEquipmentBonus every other intelligence-
// driven formula here already folds in), rounded once at the very end
// rather than at each step.
export const LEVEL_SPELL_DAMAGE_PERCENT_PER_LEVEL = 0.02;
export function scaledSpellDamage(baseDamage: number, level: number, intelligence: number): number {
  const levelMultiplier = 1 + level * LEVEL_SPELL_DAMAGE_PERCENT_PER_LEVEL;
  return baseDamage * Math.pow(1.1, intelligence) * levelMultiplier;
}

// "Luck should give a player extra chance to succeed at casting. Luck x
// 10 is the chance that any spell being cast has an extra 10% chance to
// succeed." A nested roll, not a flat bonus: luck*10 is itself a percent
// chance (0-100) that, when it hits, adds LUCK_BONUS_SUCCESS_PERCENT to
// the spell's own success chance for this one cast — so low luck only
// occasionally helps at all, while high luck (10+) triggers it every time.
export const LUCK_BONUS_TRIGGER_PERCENT_PER_POINT = 10;
export const LUCK_BONUS_SUCCESS_PERCENT = 10;
export function rollLuckSpellSuccessBonus(luck: number): number {
  const triggerChance = Math.min(100, luck * LUCK_BONUS_TRIGGER_PERCENT_PER_POINT);
  return Math.random() * 100 < triggerChance ? LUCK_BONUS_SUCCESS_PERCENT : 0;
}

// "When casting a spell add between luck / 2 and luck x 5 chance to the
// player's chance of getting better at a spell/skill" — a random bonus
// (percentage points), uniformly between these two bounds, layered on
// top of the ordinary SKILL_GROWTH_CHANCE roll — spell casts only (see
// game.gateway.ts's maybeGrowSpellSkill), not every skill use.
export function rollLuckGrowthBonus(luck: number): number {
  const min = luck / 2;
  const max = luck * 5;
  return min + Math.random() * (max - min);
}

// --- Experience rewards ---

// One shared ratio formula for both monster and player kills: the higher
// the killer's level is above the victim's, the less experience it's
// worth (diminishing returns for stomping something far weaker); the
// lower the killer's level, the more it's worth (risk vs. reward for
// punching above your weight). Player kills just use a bigger base
// reward than a monster kill (see PLAYER_KILL_EXP_REWARD) — since it's a
// straight multiple fed through this SAME formula, the ratio between
// them holds at any level pairing, not just when levels happen to match.
//
// The reference ratio (victimLevel x RATIO_MULTIPLIER / killerLevel) was
// originally *10, a direct port of the text game's own formula — but at
// a matching level pairing that means baseReward x 10 per kill, which
// against maxTnlForLevel's level x 100 requirement is only ~2 wild
// goblins to reach level 2 (barely a fight, let alone a grind). Lowered
// to *2.5 (item 21) so an early level takes a deliberate handful of
// kills instead of being over almost immediately, while keeping the same
// relative shape (still worth proportionally more/less as the level gap
// changes).
const EXP_RATIO_MULTIPLIER = 2.5;

export function expGainFor(baseReward: number, killerLevel: number, victimLevel: number): number {
  const ratio = (victimLevel * EXP_RATIO_MULTIPLIER) / killerLevel;
  return Math.max(1, Math.round(baseReward * ratio));
}

// A later follow-up ask: "examine all of the monsters created so far...
// make it so monsters have base stats for that level" — auditing every
// species' own hand-set expReward turned up a real, unintentional bug:
// several species (wild-skeleton-grounds, wild-goblin-grounds) had been
// LEVELED UP in a past session (from their original level-1 baseline to
// 5/7) without their expReward ever being rescaled to match, so a level-5
// "tougher" monster was still only worth a level-1 amount of exp. The
// project's OWN higher-level dungeon tiers (level 12/17/20/25/35) turn out
// to already fit a clean ~13-exp-per-level line almost exactly (150/12 ≈
// 12.5, 220/17 ≈ 12.9, 260/20 = 13, 320/25 = 12.8, 450/35 ≈ 12.9) — this
// formalizes that already-implicit constant and applies it uniformly to
// EVERY species (see monster.ts), superseding the old species-by-species
// hand-set numbers (including the imp's own deliberate level-1 bump from
// an earlier ask — with a coherent per-level curve now driving both sides
// of the ratio, that one-off boost is no longer needed to keep early
// leveling from crawling; see maxTnlForLevel's own doc comment).
export const MONSTER_EXP_REWARD_PER_LEVEL = 13;
export function monsterExpRewardForLevel(level: number): number {
  return Math.round(MONSTER_EXP_REWARD_PER_LEVEL * level);
}

// A "rare" monster (see monster.ts's own isRare) is meant to be a real
// step up from an ordinary same-level encounter — tougher AND more
// rewarding — without the runaway compounding a past session's own
// per-level-squared math produced (one rare's hp/damage had crept well
// past even the level-35 endgame tier despite being level 7). A flat,
// modest multiplier on top of the ordinary per-level formulas keeps "a
// rare is a notable step up" true without that blowup.
export const RARE_MONSTER_STAT_MULTIPLIER = 1.5;
export const RARE_MONSTER_HP_MULTIPLIER = 1.8;

// Same reasoning as monsterExpRewardForLevel above, fit to the same
// well-tuned dungeon-tier anchors (12/180hp, 17/250hp, 25/350hp, 35/500hp
// all land within a point or two of 14.5/level).
export const MONSTER_HP_PER_LEVEL = 14.5;
export function monsterHpForLevel(level: number): number {
  return Math.round(MONSTER_HP_PER_LEVEL * level);
}

// Same reasoning again, fit to the same anchors' own attackDamage figures
// (12/20, 17/28, 25/38, 35/50 all land close to this line).
export function monsterAttackDamageForLevel(level: number): number {
  return Math.round(1.5 * level + 3);
}

// Every monster's own CombatantStats attributes (strength/dexterity/
// intelligence/wisdom/constitution/luck) used to be pinned at
// MONSTER_BASE_ATTRIBUTE(1, see monster.ts — duplicated here as a literal
// rather than imported, since this file is deliberately dependency-free)
// forever regardless of level — meaning armorVsPhysicalFor/
// armorVsMagicalFor (both driven by these same attributes) computed the
// exact same tiny flat armor value for a level-1 imp and a level-35
// endgame goblin alike. A later follow-up ask ("monsters also have armor
// vs physical & armor vs magical depending on equipment and stats... give
// monsters at different levels base stats for that level") fixes this by
// growing every attribute 1:1 with the monster's own level — reusing the
// exact same armor formulas a player already has, no new mechanism
// needed, just no-longer-frozen inputs.
const MONSTER_BASE_ATTRIBUTE_FOR_SCALING = 1;
export function monsterAttributeForLevel(level: number): number {
  return MONSTER_BASE_ATTRIBUTE_FOR_SCALING + level;
}

export const WILD_GOBLIN_EXP_REWARD = monsterExpRewardForLevel(1);
export const WILD_SKELETON_EXP_REWARD = monsterExpRewardForLevel(1);
// ~7x a wild goblin kill (the monster this project actually spawns) at
// any matching level pairing — see expGainFor's doc comment above.
export const PLAYER_KILL_EXP_REWARD = WILD_GOBLIN_EXP_REWARD * 7;
