import {
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  BODY_PART_SKILL_STARTING_PERCENT,
  lesserRaceResistanceName,
} from '../players/skills.js';
import { ALL_RACES, type Race } from '../../shared/constants.js';
import type { ItemSkillReward } from './dropped-item.js';

// Static lookup of what a known item name teaches when consumed, if
// anything — the single source of truth for this, consulted both when a
// monster drops one (MonsterManagerService.getDeathDrops) and when a
// player drops one back onto the ground from their inventory
// (GameGateway.handleDrop). Player inventory only stores item names
// (Player.inventory: string[]), not full item data, so this is also what
// lets a dropped-from-inventory item regain its original skill properties
// instead of becoming an inert copy.
//
// "bone dagger" used to also teach a skill here ("bone finger dagger
// strike", a placeholder with no mechanical effect) — retired now that
// wielding a dagger has a real, always-available effect via the goblin
// starting "dagger" skill (see GameGateway.weaponAttack), which makes a
// second, redundant skill from consuming one pointless.
const BODY_PART_SKILL: ItemSkillReward = { reward: LESSER_UNDEAD_MONSTER_RESISTANCE, chance: 0.2 };

// Bare "leg"/"arm"/etc — no monster/race ever drops these anymore (every
// current drop is named "<source> <part>", see MONSTER_BODY_PART_SOURCES/
// raceBodyPartSkill below), but kept as an inert fallback for any item
// already sitting in an existing inventory from before that was true.
const ITEM_DEFINITIONS: Record<string, ItemSkillReward> = {
  leg: BODY_PART_SKILL,
  arm: BODY_PART_SKILL,
  hand: BODY_PART_SKILL,
  skull: BODY_PART_SKILL,
  rib: BODY_PART_SKILL,
};

// A monster's body part is named "<monster kind> <part>" (e.g. "wild
// goblin leg", "wild skeleton arm") — every monster kind drops its own
// prefix so the source is always recoverable from the item name alone
// (see bodyPartSourceName), the same reasoning as the player-race
// "<race> <part>" convention (see raceBodyPartSkill). Keyed by monster
// kind here rather than listed item-by-item, since it's every
// MonsterKind x body-part combination.
const MONSTER_BODY_PART_SOURCES: Record<string, ItemSkillReward> = {
  'wild skeleton': BODY_PART_SKILL,
  'wild goblin': { reward: LESSER_NORMAL_MONSTER_RESISTANCE, chance: 0.1 },
};

// The canonical "these are body parts" list — used by GameGateway
// .resolveAttackExchange/.handlePlayerLikeDeath to route death drops: body
// parts always land loose on the ground, while anything else (e.g. "bone
// dagger") goes into a corpse container instead. Also the suffix checked
// for a "<source> <part>" name (see isBodyPart).
const BODY_PARTS = ['leg', 'arm', 'hand', 'skull', 'rib'];

// A player corpse's dropped body part (see GameGateway.handlePlayerLikeDeath)
// picks one of these at random, same pool a wild skeleton draws from.
export function randomBodyPartName(): string {
  return BODY_PARTS[Math.floor(Math.random() * BODY_PARTS.length)] ?? 'bone';
}

export function isBodyPart(name: string): boolean {
  const lower = name.toLowerCase();
  if (BODY_PARTS.includes(lower)) return true;
  const spaceIdx = lower.lastIndexOf(' ');
  return spaceIdx !== -1 && BODY_PARTS.includes(lower.slice(spaceIdx + 1));
}

// A body part dropped from a *player's* corpse is named "<race> <part>"
// (e.g. "goblin leg" — see GameGateway.handlePlayerLikeDeath), so the same
// item name can teach a different skill depending on context, without
// inventory needing to store anything beyond the bare name. Recognized
// dynamically here rather than listed item-by-item, since it's every
// Race x body-part combination.
function raceBodyPartSource(name: string): { source: string; skill: ItemSkillReward } | undefined {
  const lower = name.toLowerCase();
  const spaceIdx = lower.lastIndexOf(' ');
  if (spaceIdx === -1) return undefined;
  const racePart = lower.slice(0, spaceIdx);
  const bodyPart = lower.slice(spaceIdx + 1);
  if (!BODY_PARTS.includes(bodyPart) || !ALL_RACES.includes(racePart as Race)) return undefined;
  return { source: racePart, skill: { reward: lesserRaceResistanceName(racePart as Race), chance: 0.1 } };
}

// "wild goblin leg"/"wild skeleton arm"/etc — see MONSTER_BODY_PART_SOURCES.
function monsterBodyPartSource(name: string): { source: string; skill: ItemSkillReward } | undefined {
  const lower = name.toLowerCase();
  for (const [source, skill] of Object.entries(MONSTER_BODY_PART_SOURCES)) {
    if (lower.startsWith(`${source} `) && BODY_PARTS.includes(lower.slice(source.length + 1))) {
      return { source, skill };
    }
  }
  return undefined;
}

export function skillForItemName(name: string): ItemSkillReward | undefined {
  return ITEM_DEFINITIONS[name.toLowerCase()] ?? monsterBodyPartSource(name)?.skill ?? raceBodyPartSource(name)?.skill;
}

// The race or monster kind a body part came from (e.g. "wild skeleton",
// "wild goblin", "goblin", "hobgoblin") — undefined for a non-body-part
// item or a legacy bare body part with no recoverable source. This is
// what a slime's "mimic" collection tracks (see GameGateway
// .consumeBodyPart/handleMimic): consuming a body part with a source adds
// that source to the slime's permanent mimicForms list.
export function bodyPartSourceName(name: string): string | undefined {
  return monsterBodyPartSource(name)?.source ?? raceBodyPartSource(name)?.source;
}

// Every slot a player can equip something into. Body parts come in pairs
// (ear/forearm/ring/shin) with distinct left/right slots; everything else
// is a single slot. "for now" per the request — only 'weapon' actually has
// an item mapped to it below, the rest exist so future armor/rings/
// necklaces/earrings have somewhere to go without another schema change.
export type EquipmentSlot =
  | 'head'
  | 'mask'
  | 'leftEar'
  | 'rightEar'
  | 'torso'
  | 'leftArm'
  | 'rightArm'
  | 'gauntlets'
  | 'shield'
  | 'weapon'
  | 'leftRing'
  | 'rightRing'
  | 'necklace'
  | 'leftLeg'
  | 'rightLeg'
  | 'boots';

// Broad item family — currently only used for the "weapon" case (which
// wires up an attack bonus/verb below), but named generically since
// armor/ring/necklace/earring items will need the same shape later.
export type ItemCategory = 'weapon' | 'armor' | 'ring' | 'necklace' | 'earring';

export interface EquipmentDefinition {
  slot: EquipmentSlot;
  category: ItemCategory;
  // Weapon-only, so far: added to PLAYER_ATTACK_DAMAGE, and swaps the
  // attack line's verb ("You hit" -> "You stab") while equipped — see
  // GameGateway.resolveAttackExchange.
  attackBonus?: number;
  attackVerb?: string;
}

const BONE_DAGGER_EQUIPMENT: EquipmentDefinition = {
  slot: 'weapon',
  category: 'weapon',
  attackBonus: 2,
  attackVerb: 'stab',
};

// No attackBonus/attackVerb — a shield's only effect is enabling "shield
// block" (see players/skills.ts's SHIELD_BLOCK/GameGateway
// .computeShieldBlockChance), not a weapon-style damage/verb swap.
const BONE_SHIELD_EQUIPMENT: EquipmentDefinition = {
  slot: 'shield',
  category: 'armor',
};

// A mask's only effect is covering the wearer's face — see GameGateway's
// town-entry gate (requires one, plus every other slot filled, to cross
// into Floro/Kortho).
const BONE_MASK_EQUIPMENT: EquipmentDefinition = {
  slot: 'mask',
  category: 'armor',
};

const EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  'bone dagger': BONE_DAGGER_EQUIPMENT,
  'bone shield': BONE_SHIELD_EQUIPMENT,
  'bone mask': BONE_MASK_EQUIPMENT,
};

export function equipmentForItemName(name: string): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS[name.toLowerCase()];
}

// A separate, broader classification axis from EquipmentDefinition
// .category above (which only describes equipment-slot sub-types, and
// only applies to the handful of items that are actually equippable):
// this just tags "this is a plain item object", as opposed to some other
// future kind of game object (currency, quest flags, etc). Not mutually
// exclusive with being a 'weapon' — "bone dagger" is both.
export type ItemKind = 'item';

const ITEM_KINDS: Record<string, ItemKind> = {
  leg: 'item',
  arm: 'item',
  hand: 'item',
  skull: 'item',
  rib: 'item',
  'bone dagger': 'item',
  'bone shield': 'item',
  'bone mask': 'item',
};

export function itemKindFor(name: string): ItemKind | undefined {
  if (ITEM_KINDS[name.toLowerCase()]) return 'item';
  return isBodyPart(name) ? 'item' : undefined;
}

// Flavor text for "examine <item>" — every known item name should have
// one; a player-corpse "<race> <part>" name (see isBodyPart) falls back
// to a generic race-flavored line instead of a fixed entry per race.
const ITEM_DESCRIPTIONS: Record<string, string> = {
  leg: 'A gaunt, yellowed leg bone, still faintly cold to the touch.',
  arm: 'A brittle arm bone, cracked in places from old wounds.',
  hand: 'A skeletal hand, fingers curled as if still gripping something.',
  skull: 'A weathered skull, jaw hanging slightly open in a silent scream.',
  rib: 'A single curved rib bone, thin and surprisingly light.',
  'bone dagger':
    'A crude dagger carved from bone and sharpened along one edge. Wielding it lets you stab rather than merely hit.',
  'bone shield':
    'A wide shield lashed together from bone plates. Wearing it gives you a chance to block an incoming attack outright.',
  'bone mask':
    'A grinning mask carved from bone, covering the face. Wearing one — along with a full suit of equipment — is enough to slip past a town\'s guards.',
};

export function itemDescriptionFor(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (ITEM_DESCRIPTIONS[lower]) return ITEM_DESCRIPTIONS[lower];
  const source = bodyPartSourceName(lower);
  if (source) {
    const spaceIdx = lower.lastIndexOf(' ');
    const part = lower.slice(spaceIdx + 1);
    return `A ${part} bone, unmistakably ${source} in origin.`;
  }
  return undefined;
}

// Iteration order for "equip"/"equipment" typed bare — head to toe,
// matching the order the request enumerated (and EquipmentSlot is
// declared in).
export const EQUIPMENT_SLOT_ORDER: EquipmentSlot[] = [
  'head',
  'mask',
  'leftEar',
  'rightEar',
  'torso',
  'leftArm',
  'rightArm',
  'gauntlets',
  'shield',
  'weapon',
  'leftRing',
  'rightRing',
  'necklace',
  'leftLeg',
  'rightLeg',
  'boots',
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: 'Head',
  mask: 'Mask',
  leftEar: 'Left Ear',
  rightEar: 'Right Ear',
  torso: 'Torso',
  leftArm: 'Left Arm',
  rightArm: 'Right Arm',
  gauntlets: 'Gauntlets',
  shield: 'Shield',
  weapon: 'Weapon',
  leftRing: 'Left Ring',
  rightRing: 'Right Ring',
  necklace: 'Necklace',
  leftLeg: 'Left Leg',
  rightLeg: 'Right Leg',
  boots: 'Boots',
};

// Slimes have no limbs, ears, fingers, or shape to speak of — a helmet, a
// mask, a torso wrap, a shield, and a weapon are the only things that make
// sense on one (the theory for the shield/weapon being it wraps a
// tentacle around each one to wear/wield it). Every other slot is still
// off limits normally — but a slime that has mimicked another form (see
// players/skills.ts's MIMIC/GameGateway's handleMimic) can wear that
// form's full slot list instead, since "form" governs equipment
// eligibility while `race` itself never changes. `form` is only ever
// meaningful for a slime; every other race ignores it. See
// GameGateway.handleEquip/handleEquipmentView/handleExamine.
export function allowedSlotsForRace(race: Race, form?: string): EquipmentSlot[] {
  if (race === 'slime') {
    if (form && form !== 'slime') return EQUIPMENT_SLOT_ORDER;
    return ['head', 'mask', 'torso', 'shield', 'weapon'];
  }
  return EQUIPMENT_SLOT_ORDER;
}
