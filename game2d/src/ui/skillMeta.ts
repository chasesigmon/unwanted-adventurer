// Skill/item display metadata shared between the action bar and the
// Skills/Inventory modals — colors, letters, descriptions, and which
// skills are "usable" (draggable into the action bar) at all.
import {
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  WAND_BOLT_SKILL,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_FIRE_RESISTANCE,
  INFRAVISION_SKILL,
  LACERATE_SKILL,
  EAT_BRAINS_SKILL,
  ENHANCED_DURABILITY_SKILL,
  BONE_FINGER_STRIKE_SKILL,
  GLARE_SKILL,
  LIGHT_SKILL,
  WATERFILL_SKILL,
  HASTE_SKILL,
  ARCANE_BOLT_SKILL,
  UNLOCK_SKILL,
  STUN_SKILL,
  DISARM_SKILL,
  AEGIS_SKILL,
  STONE_WALL_SKILL,
  ANIMATE_DEAD_SKILL,
  RECALL_SKILL,
  RECALL_MANA_COST,
  BARRIER_SKILL,
  BARRIER_MANA_COST,
  BARRIER_RADIUS_TILES,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  SHAMAN_ENHANCE_DAMAGE_MANA_COST,
  SHAMAN_ENHANCE_DAMAGE_BONUS,
  FIRE_BOLT_SKILL,
  WATER_BOLT_SKILL,
  AIR_BOLT_SKILL,
  EARTH_BOLT_SKILL,
  ELEMENTAL_BOLT_MANA_COST,
  ELEMENTAL_BOLT_DAMAGE,
  LESSER_HEAL_SKILL,
  LESSER_HEAL_MANA_COST,
  LESSER_HEAL_AMOUNT,
  ENHANCED_UNDEAD_DAMAGE_SKILL,
  ENHANCED_UNDEAD_DAMAGE_BONUS,
  LESSER_SELF_HEAL_SKILL,
  LESSER_SELF_HEAL_MANA_COST,
  LESSER_SELF_HEAL_AMOUNT,
  WISP_TRANSFORMATION_SKILL,
  WISP_TRANSFORMATION_MANA_COST,
  BATTLEMAGE_ENHANCED_ARMOR_SKILL,
  BATTLEMAGE_ENHANCED_ARMOR_BONUS,
  BATTLEMAGE_ENHANCED_DAMAGE_SKILL,
  BATTLEMAGE_ENHANCED_DAMAGE_BONUS,
  KINETIC_STRIKE_SKILL,
  KINETIC_STRIKE_MANA_COST,
  KINETIC_STRIKE_DAMAGE,
  KINETIC_STRIKE_KNOCKBACK_TILES,
  SAP_HEALTH_SKILL,
  SAP_HEALTH_BP_COST,
  SAP_HEALTH_AMOUNT,
  MONSTER_SUMMONS_SKILL,
  MONSTER_SUMMONS_MANA_COST,
  MONSTER_SUMMONS_HP_BONUS,
  MONSTER_SUMMONS_DAMAGE_BONUS,
  SUMMON_DEMON_IMP_SKILL,
  SUMMON_DEMON_IMP_MANA_COST,
  DEMON_IMP_HP,
  DEMON_IMP_DAMAGE,
  ENHANCED_HOLY_DAMAGE_SKILL,
  ENHANCED_HOLY_DAMAGE_BONUS,
  INVISIBILITY_SKILL,
  INVISIBILITY_MANA_COST,
  CREATE_DUPLICATE_SKILL,
  CREATE_DUPLICATE_MANA_COST,
  CREATE_DUPLICATE_HP_MULTIPLIER,
  DRINK_SKILL,
  POUR_SKILL,
  SKILL_COOLDOWN_MS,
  FLIGHT_SKILL,
  FLIGHT_MANA_COST,
  FLIGHT_BURST_TILES,
} from '../../shared/skills.js';
import { CANTEEN_CAPACITY, isFillableItem, isManaCrystal } from '../../shared/items.js';
import { myProfile } from '../state.js';

// A shared red for every "Attack" (A-icon) skill — they already collapse
// to one action-bar slot (see isAttackSkill), so grouping their color the
// same way reads as "this is the physical-attack type" at a glance, not
// just a coincidence of a hash landing on red.
const ATTACK_SKILL_COLOR = 'hsl(0, 55%, 40%)';
// A shared blue for every defensive skill — dodge/parry/shield block
// (avoid-the-hit) and the two resistance skills (reduce-the-hit), grouped
// together as "defensive" even though they work differently.
const DEFENSIVE_SKILL_COLOR = 'hsl(210, 55%, 40%)';
const DEFENSIVE_SKILLS = new Set([
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_FIRE_RESISTANCE,
]);

// Punch and dagger are the same underlying action from the player's own
// perspective — whatever's equipped, right-click just throws "an attack"
// — so they share one icon/letter and may only occupy ONE action-bar slot
// between the two of them (see the drop handler in actionBar.ts).
export function isAttackSkill(skillName: string): boolean {
  return skillName === PUNCH_SKILL || skillName === DAGGER_SKILL;
}

// A deterministic (not random) color per skill name, so the same skill
// always gets the same swatch across the Skills modal and the action bar
// without a hand-maintained color table — except the attack and
// defensive groups above, which intentionally share one color each.
export function skillIconColor(name: string): string {
  if (isAttackSkill(name)) return ATTACK_SKILL_COLOR;
  if (DEFENSIVE_SKILLS.has(name)) return DEFENSIVE_SKILL_COLOR;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 55%, 35%)`;
}

// Only a skill with a real, currently-implemented targeted action can be
// slotted — everything else in this project is a passive bonus (see
// shared/skills.ts), not something to manually fire at a target.
// Punch/dagger throw the same contact-range attack the direction
// keys/right-click already do, aimed at whichever target is currently
// selected; bone finger strike and glare are real separate active skills
// — glare no longer applies automatically on every hit a skeleton lands,
// it has to be deliberately queued like this.
export function isUsableSkill(skillName: string): boolean {
  return (
    skillName === PUNCH_SKILL ||
    skillName === DAGGER_SKILL ||
    skillName === BONE_FINGER_STRIKE_SKILL ||
    skillName === GLARE_SKILL ||
    skillName === LIGHT_SKILL ||
    skillName === WATERFILL_SKILL ||
    skillName === HASTE_SKILL ||
    skillName === ARCANE_BOLT_SKILL ||
    skillName === UNLOCK_SKILL ||
    skillName === STUN_SKILL ||
    skillName === DISARM_SKILL ||
    skillName === AEGIS_SKILL ||
    skillName === STONE_WALL_SKILL ||
    skillName === ANIMATE_DEAD_SKILL ||
    skillName === RECALL_SKILL ||
    skillName === BARRIER_SKILL ||
    skillName === SHAMAN_ENHANCE_DAMAGE_SKILL ||
    skillName === FIRE_BOLT_SKILL ||
    skillName === WATER_BOLT_SKILL ||
    skillName === AIR_BOLT_SKILL ||
    skillName === EARTH_BOLT_SKILL ||
    skillName === LESSER_HEAL_SKILL ||
    skillName === LESSER_SELF_HEAL_SKILL ||
    skillName === WISP_TRANSFORMATION_SKILL ||
    skillName === KINETIC_STRIKE_SKILL ||
    skillName === SAP_HEALTH_SKILL ||
    skillName === MONSTER_SUMMONS_SKILL ||
    skillName === SUMMON_DEMON_IMP_SKILL ||
    skillName === INVISIBILITY_SKILL ||
    skillName === CREATE_DUPLICATE_SKILL ||
    skillName === DRINK_SKILL ||
    skillName === POUR_SKILL ||
    skillName === FLIGHT_SKILL
  );
}

// Short mechanical/flavor blurbs for the Skills modal's name-hover
// tooltip, paired with a `cursor: help` so hovering the NAME (as opposed
// to the drag-handle icon) reads as "more info here" rather than
// "draggable".
export const SKILL_DESCRIPTIONS: Record<string, string> = {
  [PUNCH_SKILL]: 'Bare-handed melee damage. Grows with practice; used automatically whenever no weapon is equipped.',
  [DODGE_SKILL]: 'Passive: chance to fully avoid an incoming hit by evasion. Grows whenever it triggers.',
  [PARRY_SKILL]:
    "Passive: chance to fully avoid an incoming hit with your weapon. Requires a weapon equipped; a wand can only parry another attack from a wand, while a physical weapon can parry attacks from physical or ranged weapons (including wands). Grows whenever it triggers.",
  [SHIELD_BLOCK_SKILL]: 'Passive: chance to fully avoid an incoming hit with a shield. Requires a shield equipped; grows on every attempt.',
  [DAGGER_SKILL]: 'Melee damage while a dagger is equipped, replacing punch. Grows with practice.',
  [SECOND_ATTACK_SKILL]: 'Hobgoblin-only: chance of an extra swing on top of your normal attack.',
  [THIRD_ATTACK_SKILL]: 'Hobgoblin-only: chance of a second extra swing on top of your normal attack.',
  [ENHANCED_DAMAGE_SKILL]: 'Hobgoblin-only: a flat bonus added to your base hit damage.',
  [LESSER_NORMAL_MONSTER_RESISTANCE]: 'Reduces damage taken from normal-class monster counter-attacks.',
  [LESSER_UNDEAD_MONSTER_RESISTANCE]: 'Reduces damage taken from undead-class monster counter-attacks.',
  [LESSER_FIRE_RESISTANCE]: 'A small chance to learn from consuming a torch. No fire-damage mechanic exists yet for it to reduce.',
  [INFRAVISION_SKILL]: 'Goblin-only: see clearly across the whole map regardless of time of day, no torch needed.',
  [LACERATE_SKILL]: 'Dragonborn-only: chance of an extra laceration attack on top of your normal attack.',
  [EAT_BRAINS_SKILL]: 'Zombie-only: heal a portion of hp/mana/movement by eating the brains of a corpse you personally killed.',
  [GLARE_SKILL]: 'Skeleton-only: paralyze whoever you hit, blocking their counter-attack. Has its own cooldown between casts.',
  [ENHANCED_DURABILITY_SKILL]: 'Skeleton-only: passively tougher armor (future work — no armor system yet).',
  [BONE_FINGER_STRIKE_SKILL]:
    'A separate active attack, earnable by chance from consuming bone daggers. Deals 1.5x your normal hit damage, scaling further with skill percent.',
  [LIGHT_SKILL]:
    "No target needed — lights or extinguishes your equipped wand's tip, granting a light source like a torch would. Success chance scales with skill percent, intelligence, and luck.",
  [WATERFILL_SKILL]:
    'Fills a targeted container (a canteen) with water. Select it in your inventory first, then click this. Costs mana; requires a wand equipped. Success chance scales with skill percent, intelligence, and luck.',
  [HASTE_SKILL]:
    'No target needed — quickens your own footsteps by about 10% for a time, plus a little more for every point of dexterity. Costs mana; lasts longer the higher your skill. Success chance scales with skill percent, intelligence, and luck.',
  [ARCANE_BOLT_SKILL]:
    'Hurls a bolt of flame at your selected target (a monster) from up to 7 tiles away. Deals 20 base damage, compounding +10% per point of intelligence; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.',
  [UNLOCK_SKILL]:
    'Unlocks a targeted door or chest. Left-click the door/chest first, then use this. Costs mana; success chance scales with skill percent, intelligence, and luck.',
  [STUN_SKILL]:
    'Stuns your selected target (a monster) in place for 2 combat ticks, from up to 7 tiles away. Costs 10 mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.',
  [DISARM_SKILL]:
    "Disarms your selected target's weapon (a monster) into your own inventory, from up to 7 tiles away. Costs 10 mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.",
  [AEGIS_SKILL]:
    'No target needed — surrounds you with a protective shield that reduces all damage by 3 for 1 minute. Costs 10 mana; success chance scales with skill percent, intelligence, and luck — its own 2-minute cooldown only starts on a successful cast.',
  [STONE_WALL_SKILL]:
    'Click this, then click a spot on the map within 10 feet — summons a stone block ally there for 30 seconds (or until destroyed) that draws monster aggro and absorbs hits. Costs 10 mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.',
  [ANIMATE_DEAD_SKILL]:
    "Necromancer-only. Requires a monster's corpse selected first (left-click it — not a player's corpse), then use this to raise it from up to 7 feet away — an animated ally under your command (follow/stay/sleep/attack), with 2x its hp when alive and the same attack. Lasts until it's slain or you log off; limited to 1 at a time (2 at level 20+). Costs 15 mana; has its own 3-minute cooldown. Success chance scales with skill percent, intelligence, and luck.",
  [RECALL_SKILL]: `Opens a list of every major point of interest you've already visited — click one to teleport there instantly, along with your pet/animated monsters. Costs ${RECALL_MANA_COST} mana; a successful cast has its own 2-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [BARRIER_SKILL]: `No target needed — summons a ${BARRIER_RADIUS_TILES}-tile-radius dome centered on you that fully blocks monster attacks and confines your own movement to its edge for 2 minutes. Cast again anytime (even on cooldown) to cancel it early for free. Costs ${BARRIER_MANA_COST} mana; a fresh cast has its own 4-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: `Shaman-only. No target needed — adds +${SHAMAN_ENHANCE_DAMAGE_BONUS} to your basic ranged/physical attack damage for 3 minutes. Costs ${SHAMAN_ENHANCE_DAMAGE_MANA_COST} mana; a fresh cast has its own 4-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [FIRE_BOLT_SKILL]: `Elementalist-only. Hurls a bolt of fire at your selected target (a monster) from up to 7 tiles away, dealing ${ELEMENTAL_BOLT_DAMAGE} base damage (compounding +10% per point of intelligence) plus a couple ticks of lingering burn damage. Costs ${ELEMENTAL_BOLT_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [WATER_BOLT_SKILL]: `Elementalist-only. Hurls a bolt of water at your selected target (a monster) from up to 7 tiles away, dealing ${ELEMENTAL_BOLT_DAMAGE} base damage (compounding +10% per point of intelligence) and slowing it for a combat tick. Costs ${ELEMENTAL_BOLT_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [AIR_BOLT_SKILL]: `Elementalist-only. Hurls a bolt of wind at your selected target (a monster) from up to 7 tiles away, dealing ${ELEMENTAL_BOLT_DAMAGE} base damage (compounding +10% per point of intelligence) and pushing it back a step. Costs ${ELEMENTAL_BOLT_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [EARTH_BOLT_SKILL]: `Elementalist-only. Hurls a bolt of stone at your selected target (a monster) from up to 7 tiles away, dealing ${ELEMENTAL_BOLT_DAMAGE} base damage (compounding +10% per point of intelligence) and rooting it in place for a combat tick. Costs ${ELEMENTAL_BOLT_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [LESSER_HEAL_SKILL]: `Cleric-only. Heals your selected friendly target (another player, as long as they aren't currently attacking you) for ${LESSER_HEAL_AMOUNT} hp, or yourself if no such target is selected. Costs ${LESSER_HEAL_MANA_COST} mana. Success chance scales with skill percent, intelligence, and luck.`,
  [ENHANCED_UNDEAD_DAMAGE_SKILL]: `Cleric-only: a flat +${ENHANCED_UNDEAD_DAMAGE_BONUS} bonus added to your ranged/physical attacks against anything classified undead (wild skeletons, and any skeleton-race player).`,
  [LESSER_SELF_HEAL_SKILL]: `Druid-only. No target needed — heals yourself for ${LESSER_SELF_HEAL_AMOUNT} hp. Costs ${LESSER_SELF_HEAL_MANA_COST} mana; a successful cast has its own 5-second cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [WISP_TRANSFORMATION_SKILL]: `Druid-only. No target needed — transforms you into a shimmering wisp of light for 2 minutes: you can't attack while transformed, but move 20% faster. Costs ${WISP_TRANSFORMATION_MANA_COST} mana; a successful cast has its own 3-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [BATTLEMAGE_ENHANCED_ARMOR_SKILL]: `Battlemage-only: a chance (scaling with skill percent) to reduce a hit you take from a monster by ${BATTLEMAGE_ENHANCED_ARMOR_BONUS}. Grows every hit you take, landed or avoided.`,
  [BATTLEMAGE_ENHANCED_DAMAGE_SKILL]: `Battlemage-only: a chance (scaling with skill percent) to add +${BATTLEMAGE_ENHANCED_DAMAGE_BONUS} to a ranged/physical attack you make. Grows every attack you make, hit or miss.`,
  [KINETIC_STRIKE_SKILL]: `Battlemage-only. Strikes your selected target (a monster) from up to 7 tiles away for ${KINETIC_STRIKE_DAMAGE} base damage (compounding +10% per point of intelligence) and knocks it back ${KINETIC_STRIKE_KNOCKBACK_TILES} tiles. Costs ${KINETIC_STRIKE_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [SAP_HEALTH_SKILL]: `Hemomancer-only. Drains your selected target (a monster) from up to 7 tiles away for ${SAP_HEALTH_AMOUNT} base damage (compounding +10% per point of intelligence) and heals you for the same amount. Costs ${SAP_HEALTH_BP_COST} bp instead of mana — bp can go below 0, but casting again while it's already negative also costs you hp. Has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [MONSTER_SUMMONS_SKILL]: `Summoner-only. Opens a list of every unique monster you've killed since specializing — pick one to summon it as an ally with +${MONSTER_SUMMONS_HP_BONUS} hp and +${MONSTER_SUMMONS_DAMAGE_BONUS} damage over the original. Costs ${MONSTER_SUMMONS_MANA_COST} mana. Success chance scales with skill percent, intelligence, and luck.`,
  [SUMMON_DEMON_IMP_SKILL]: `Diabolist-only. No target needed — summons a demon imp ally with ${DEMON_IMP_HP} hp and ${DEMON_IMP_DAMAGE} damage per hit, which draws the aggro of any monster you attack while it's alive. Costs ${SUMMON_DEMON_IMP_MANA_COST} mana; has its own cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [ENHANCED_HOLY_DAMAGE_SKILL]: `Diabolist-only: a flat +${ENHANCED_HOLY_DAMAGE_BONUS} bonus added to your ranged/physical attacks against anything classified holy. (No monster or race in the game is classified holy yet.)`,
  [INVISIBILITY_SKILL]: `Illusionist-only. No target needed — turns you invisible to monsters and other players for 1 minute (your own sprite just looks faded to you). Attacking breaks it early. Costs ${INVISIBILITY_MANA_COST} mana; a successful cast has its own 2-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [CREATE_DUPLICATE_SKILL]: `Illusionist-only. No target needed — creates a duplicate of yourself with ${Math.round(CREATE_DUPLICATE_HP_MULTIPLIER * 100)}% of your hp, lasting 5 minutes. Costs ${CREATE_DUPLICATE_MANA_COST} mana; a successful cast has its own 6-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
  [DRINK_SKILL]: 'Takes a drink from a targeted container (a canteen). Select it in your inventory first, then click this.',
  [POUR_SKILL]: 'Empties out a targeted container (a canteen). Select it in your inventory first, then click this.',
  [FLIGHT_SKILL]: `Available to every specialization. No target needed — take to the air for 3 minutes, floating instead of walking, moving faster, and able to cross water. Press spacebar while flying for a ${FLIGHT_BURST_TILES}-foot forward burst (its own 10-second cooldown). Costs ${FLIGHT_MANA_COST} mana; a successful cast has its own 4-minute cooldown. Success chance scales with skill percent, intelligence, and luck.`,
};

// Item-hover tooltip text — native `title` attribute replaced by
// tooltip.ts's custom component, same descriptions as before.
export const ITEM_DESCRIPTIONS: Record<string, string> = {
  'bone dagger': 'A crude blade carved from bone. Equip it as a weapon for bonus damage and the dagger skill.',
  'bone shield': 'A plated bone shield. Equip it for a chance to block incoming hits.',
  torch: 'A carried light source. Equip it in place of a shield to see in the dark — burns out after 15 minutes of equipped use.',
  wand: "A basic wooden wand. Equip it in place of a weapon to cast spells — for now, just lucem (learnable in the Utility Classroom).",
  'wild goblin ear': "A wild goblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'goblin ear': "A goblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'hobgoblin ear': "A hobgoblin's ear. Consume it for exp and a small chance of learning normal-monster resistance.",
  'wild skeleton bone': "A wild skeleton's bone. Consume it for exp and a higher chance of learning undead-monster resistance.",
  'skeleton bone': "A skeleton's bone. Consume it for exp and a higher chance of learning undead-monster resistance.",
  'zombie finger': "A zombie's severed finger. Consume it for exp.",
  'dragonborn scale': "A dragonborn's scale. Consume it for exp.",
  'slime residue': "A slime's residue. Consume it for exp.",
  canteen: `Holds up to ${CANTEEN_CAPACITY} drinks of water. Click to target it, then use drink, pour out, or irrigo from your action bar.`,
  'lesser mana crystal': 'A dim, roughly-cut crystal — a monster\'s drop, replacing body parts (a follow-up ask). No use yet; hold onto it.',
  'minor mana crystal': 'A faintly glowing crystal, a step up from the lesser tier. No use yet; hold onto it.',
  'mana crystal': 'A steadily glowing crystal. No use yet; hold onto it.',
  'greater mana crystal': 'A brightly glowing crystal, dense with power. No use yet; hold onto it.',
  'superior mana crystal': 'A brilliant, near-blinding crystal — the rarest tier. No use yet; hold onto it.',
};

export function itemTooltip(item: string): string {
  const description = ITEM_DESCRIPTIONS[item];
  if (isFillableItem(item)) return description ?? 'Click to target it, then act on it from your action bar.';
  if (isManaCrystal(item)) return description ?? 'No use yet; hold onto it.';
  return description ? `${description}\n\nClick to use, right-click to consume.` : 'Click to use, right-click to consume.';
}

// ---------- Cooldown visualization — shared between the Skills modal's
// icons and the action bar's slots — a dark radial "clock wipe" overlay
// that shrinks from a full circle down to nothing as the cooldown
// elapses. Purely wall-clock driven (see SKILL_COOLDOWN_MS/
// PlayerSnapshot.skillCooldowns), refreshed on a timer rather than tied
// to any server push (besides the sync nudge game.gateway.ts now sends
// the instant a cooldown actually starts). ----------

export function cooldownFraction(skillName: string): number {
  if (!myProfile) return 0;
  const readyAt = myProfile.skillCooldowns[skillName];
  const totalMs = SKILL_COOLDOWN_MS[skillName];
  if (readyAt === undefined || totalMs === undefined) return 0;
  const remaining = readyAt - Date.now();
  if (remaining <= 0) return 0;
  return Math.min(1, remaining / totalMs);
}

export function createCooldownOverlay(skillName: string): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'cooldown-overlay';
  overlay.dataset.skill = skillName;
  return overlay;
}

// Shared by the Skills modal/action bar (wall-clock skill cooldowns) AND
// the Eat Brains button (world-tick cooldown) — anything that can
// express "how much of the cooldown is left, 0 to 1" gets the same dark
// radial wipe.
export function applyCooldownOverlayFraction(overlay: HTMLElement, fraction: number): void {
  if (fraction <= 0) {
    overlay.style.background = 'transparent';
    return;
  }
  const deg = (Math.min(1, fraction) * 360).toFixed(1);
  overlay.style.background = `conic-gradient(rgba(0, 0, 0, 0.75) ${deg}deg, transparent ${deg}deg)`;
}

export function updateCooldownOverlay(overlay: HTMLElement): void {
  const skillName = overlay.dataset.skill;
  applyCooldownOverlayFraction(overlay, skillName ? cooldownFraction(skillName) : 0);
}

// A periodic sweep (rather than tracking element references) — finds
// whatever cooldown overlays currently exist in the DOM (action-bar slots
// always; Skills modal icons only while it's open) and updates each from
// its own `data-skill` tag. Scoped to `[data-skill]` specifically so it
// never touches the Eat Brains button's own overlay — that one's
// world-tick-based, not a SKILL_COOLDOWN_MS entry.
export function refreshCooldownOverlays(): void {
  document.querySelectorAll<HTMLElement>('.cooldown-overlay[data-skill]').forEach(updateCooldownOverlay);
}

// A follow-up ask: "separate each skill by category like Offense,
// Defense, Utility, Summoning, Elemental" — the same 5 subjects the
// castle's own classrooms are named after (see shared/constants.ts's
// CLASSROOM_MAPS), which every REAL spell already maps onto cleanly;
// every other (non-spell) skill slots in wherever it reads most
// naturally — a bare-handed/weapon attack skill under Offense, an
// avoid-or-reduce-the-hit skill under Defense, everything else
// (race-innate utility skills, canteen actions) under Utility. Order
// here is also the section order in the Skills modal (see
// skillsPanel.ts's renderSkills) — the exact order the request listed
// the 5 categories in, not alphabetical (only the skills WITHIN each
// category are alphabetized).
export const SKILL_CATEGORIES = ['Offense', 'Defense', 'Utility', 'Summoning', 'Elemental'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

const SKILL_CATEGORY_MAP: Record<string, SkillCategory> = {
  [PUNCH_SKILL]: 'Offense',
  [DAGGER_SKILL]: 'Offense',
  [WAND_BOLT_SKILL]: 'Offense',
  [SECOND_ATTACK_SKILL]: 'Offense',
  [THIRD_ATTACK_SKILL]: 'Offense',
  [ENHANCED_DAMAGE_SKILL]: 'Offense',
  [LACERATE_SKILL]: 'Offense',
  [BONE_FINGER_STRIKE_SKILL]: 'Offense',
  [GLARE_SKILL]: 'Offense',
  [ARCANE_BOLT_SKILL]: 'Offense',
  [STUN_SKILL]: 'Offense',
  [DISARM_SKILL]: 'Offense',
  [DODGE_SKILL]: 'Defense',
  [PARRY_SKILL]: 'Defense',
  [SHIELD_BLOCK_SKILL]: 'Defense',
  [LESSER_NORMAL_MONSTER_RESISTANCE]: 'Defense',
  [LESSER_UNDEAD_MONSTER_RESISTANCE]: 'Defense',
  [LESSER_FIRE_RESISTANCE]: 'Defense',
  [ENHANCED_DURABILITY_SKILL]: 'Defense',
  [AEGIS_SKILL]: 'Defense',
  [BARRIER_SKILL]: 'Defense',
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: 'Offense',
  [FIRE_BOLT_SKILL]: 'Offense',
  [WATER_BOLT_SKILL]: 'Offense',
  [AIR_BOLT_SKILL]: 'Offense',
  [EARTH_BOLT_SKILL]: 'Offense',
  [LESSER_HEAL_SKILL]: 'Utility',
  [LESSER_SELF_HEAL_SKILL]: 'Utility',
  [WISP_TRANSFORMATION_SKILL]: 'Utility',
  [BATTLEMAGE_ENHANCED_ARMOR_SKILL]: 'Defense',
  [BATTLEMAGE_ENHANCED_DAMAGE_SKILL]: 'Offense',
  [KINETIC_STRIKE_SKILL]: 'Offense',
  [SAP_HEALTH_SKILL]: 'Offense',
  [MONSTER_SUMMONS_SKILL]: 'Summoning',
  [SUMMON_DEMON_IMP_SKILL]: 'Summoning',
  [ENHANCED_HOLY_DAMAGE_SKILL]: 'Offense',
  [INVISIBILITY_SKILL]: 'Utility',
  [CREATE_DUPLICATE_SKILL]: 'Summoning',
  [ENHANCED_UNDEAD_DAMAGE_SKILL]: 'Offense',
  [LIGHT_SKILL]: 'Utility',
  [HASTE_SKILL]: 'Utility',
  [UNLOCK_SKILL]: 'Utility',
  [RECALL_SKILL]: 'Utility',
  [DRINK_SKILL]: 'Utility',
  [POUR_SKILL]: 'Utility',
  [INFRAVISION_SKILL]: 'Utility',
  [EAT_BRAINS_SKILL]: 'Utility',
  [STONE_WALL_SKILL]: 'Summoning',
  [ANIMATE_DEAD_SKILL]: 'Summoning',
  [WATERFILL_SKILL]: 'Elemental',
  [FLIGHT_SKILL]: 'Utility',
};

// Falls back to Utility for anything not explicitly listed above (a
// future skill added here without a category entry lands somewhere
// visible rather than silently vanishing from the modal).
export function skillCategory(skillName: string): SkillCategory {
  return SKILL_CATEGORY_MAP[skillName] ?? 'Utility';
}
