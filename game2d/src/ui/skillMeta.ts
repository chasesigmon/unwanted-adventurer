// Skill/item display metadata shared between the action bar and the
// Skills/Inventory modals — colors, letters, descriptions, and which
// skills are "usable" (draggable into the action bar) at all.
import {
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_FIRE_RESISTANCE,
  INFRAVISION_SKILL,
  LACERATE_SKILL,
  MIMIC_SKILL,
  REVERT_SKILL,
  EAT_BRAINS_SKILL,
  ENHANCED_DURABILITY_SKILL,
  BONE_FINGER_STRIKE_SKILL,
  GLARE_SKILL,
  LUCEM_SKILL,
  IRRIGO_SKILL,
  CELERITAS_SKILL,
  AUGUE_SKILL,
  RESERA_SKILL,
  STUPEFACIUNT_SKILL,
  EXARME_SKILL,
  SCUTUM_SKILL,
  MURUS_LAPIDEUS_SKILL,
  DRINK_SKILL,
  POUR_SKILL,
  SKILL_COOLDOWN_MS,
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
// it has to be deliberately queued like this. Mimic/revert are "active"
// in a different sense — no combat target at all, just a chat command
// under the hood (see actionBar.ts's useTargetedSkill wiring).
export function isUsableSkill(skillName: string): boolean {
  return (
    skillName === PUNCH_SKILL ||
    skillName === DAGGER_SKILL ||
    skillName === BONE_FINGER_STRIKE_SKILL ||
    skillName === GLARE_SKILL ||
    skillName === MIMIC_SKILL ||
    skillName === REVERT_SKILL ||
    skillName === LUCEM_SKILL ||
    skillName === IRRIGO_SKILL ||
    skillName === CELERITAS_SKILL ||
    skillName === AUGUE_SKILL ||
    skillName === RESERA_SKILL ||
    skillName === STUPEFACIUNT_SKILL ||
    skillName === EXARME_SKILL ||
    skillName === SCUTUM_SKILL ||
    skillName === MURUS_LAPIDEUS_SKILL ||
    skillName === DRINK_SKILL ||
    skillName === POUR_SKILL
  );
}

// Short mechanical/flavor blurbs for the Skills modal's name-hover
// tooltip, paired with a `cursor: help` so hovering the NAME (as opposed
// to the drag-handle icon) reads as "more info here" rather than
// "draggable".
export const SKILL_DESCRIPTIONS: Record<string, string> = {
  [PUNCH_SKILL]: 'Bare-handed melee damage. Grows with practice; used automatically whenever no weapon is equipped.',
  [DODGE_SKILL]: 'Chance to fully avoid an incoming hit by evasion. Grows whenever it triggers.',
  [PARRY_SKILL]: "Chance to fully avoid an incoming hit with your weapon. Requires a weapon equipped; grows whenever it triggers.",
  [SHIELD_BLOCK_SKILL]: 'Chance to fully avoid an incoming hit with a shield. Requires a bone shield equipped; grows on every attempt.',
  [DAGGER_SKILL]: 'Melee damage while a dagger is equipped, replacing punch. Grows with practice.',
  [SECOND_ATTACK_SKILL]: 'Hobgoblin-only: chance of an extra swing on top of your normal attack.',
  [THIRD_ATTACK_SKILL]: 'Hobgoblin-only: chance of a second extra swing on top of your normal attack.',
  [ENHANCED_DAMAGE_SKILL]: 'Hobgoblin-only: a flat bonus added to your base hit damage.',
  [LESSER_NORMAL_MONSTER_RESISTANCE]: 'Reduces damage taken from normal-class monster counter-attacks.',
  [LESSER_UNDEAD_MONSTER_RESISTANCE]: 'Reduces damage taken from undead-class monster counter-attacks.',
  [LESSER_FIRE_RESISTANCE]: 'A small chance to learn from consuming a torch. No fire-damage mechanic exists yet for it to reduce.',
  [INFRAVISION_SKILL]: 'Goblin-only: see clearly across the whole map regardless of time of day, no torch needed.',
  [LACERATE_SKILL]: 'Dragonborn-only: chance of an extra laceration attack on top of your normal attack.',
  [MIMIC_SKILL]: "Slime-only: transform into the form of any race/monster whose body part you've consumed.",
  [REVERT_SKILL]: 'Slime-only: change back to your plain slime form.',
  [EAT_BRAINS_SKILL]: 'Zombie-only: heal a portion of hp/mana/movement by eating the brains of a corpse you personally killed.',
  [GLARE_SKILL]: 'Skeleton-only: paralyze whoever you hit, blocking their counter-attack. Has its own cooldown between casts.',
  [ENHANCED_DURABILITY_SKILL]: 'Skeleton-only: passively tougher armor (future work — no armor system yet).',
  [BONE_FINGER_STRIKE_SKILL]:
    'A separate active attack, earnable by chance from consuming bone daggers. Deals 1.5x your normal hit damage, scaling further with skill percent.',
  [LUCEM_SKILL]: "No target needed — lights or extinguishes your equipped wand's tip, granting a light source like a torch would.",
  [IRRIGO_SKILL]: 'Fills a targeted container (a canteen) with water. Select it in your inventory first, then click this. Costs mana; requires a wand equipped.',
  [CELERITAS_SKILL]: 'No target needed — quickens your own footsteps by about 10% for a time. Costs mana; lasts longer the higher your skill.',
  [AUGUE_SKILL]: 'Hurls a bolt of flame at your selected target (a monster) from up to 7 tiles away. Deals 10 damage; has its own cooldown.',
  [RESERA_SKILL]: 'Unlocks a targeted door or chest. Left-click the door/chest first, then use this. Costs mana; chance of success scales with skill percent.',
  [STUPEFACIUNT_SKILL]: 'Stuns your selected target (a monster) in place for 2 combat ticks, from up to 7 tiles away. Costs 10 mana; has its own cooldown.',
  [EXARME_SKILL]: "Disarms your selected target's weapon (a monster) into your own inventory, from up to 7 tiles away. Costs 10 mana; has its own cooldown.",
  [SCUTUM_SKILL]: 'No target needed — surrounds you with a protective shield for 1 minute. Costs 10 mana; has its own cooldown.',
  [MURUS_LAPIDEUS_SKILL]:
    'Click this, then click a spot on the map within 10 feet — summons a stone block ally there that draws monster aggro and absorbs hits. Costs 10 mana; has its own cooldown.',
  [DRINK_SKILL]: 'Takes a drink from a targeted container (a canteen). Select it in your inventory first, then click this.',
  [POUR_SKILL]: 'Empties out a targeted container (a canteen). Select it in your inventory first, then click this.',
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
