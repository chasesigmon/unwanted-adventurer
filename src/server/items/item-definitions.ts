import { LESSER_UNDEAD_RESISTANCE, BONE_FINGER_DAGGER_STRIKE } from '../players/skills.js';
import type { ItemSkillReward } from './dropped-item.js';

// Static lookup of what a known item name teaches when consumed, if
// anything — the single source of truth for this, consulted both when a
// monster drops one (MonsterManagerService.getDeathDrops) and when a
// player drops one back onto the ground from their inventory
// (GameGateway.handleDrop). Player inventory only stores item names
// (Player.inventory: string[]), not full item data, so this is also what
// lets a dropped-from-inventory item regain its original skill properties
// instead of becoming an inert copy.
const BODY_PART_SKILL: ItemSkillReward = { reward: LESSER_UNDEAD_RESISTANCE, chance: 0.2 };
const BONE_DAGGER_SKILL: ItemSkillReward = { reward: BONE_FINGER_DAGGER_STRIKE, chance: 0.05 };

const ITEM_DEFINITIONS: Record<string, ItemSkillReward> = {
  leg: BODY_PART_SKILL,
  arm: BODY_PART_SKILL,
  hand: BODY_PART_SKILL,
  skull: BODY_PART_SKILL,
  rib: BODY_PART_SKILL,
  'bone dagger': BONE_DAGGER_SKILL,
};

export function skillForItemName(name: string): ItemSkillReward | undefined {
  return ITEM_DEFINITIONS[name.toLowerCase()];
}

// Every slot a player can equip something into. Body parts come in pairs
// (ear/forearm/ring/shin) with distinct left/right slots; everything else
// is a single slot. "for now" per the request — only 'weapon' actually has
// an item mapped to it below, the rest exist so future armor/rings/
// necklaces/earrings have somewhere to go without another schema change.
export type EquipmentSlot =
  | 'head'
  | 'leftEar'
  | 'rightEar'
  | 'torso'
  | 'leftForearm'
  | 'rightForearm'
  | 'shield'
  | 'weapon'
  | 'leftRing'
  | 'rightRing'
  | 'necklace'
  | 'leftShin'
  | 'rightShin'
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

const EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  'bone dagger': BONE_DAGGER_EQUIPMENT,
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
};

export function itemKindFor(name: string): ItemKind | undefined {
  return ITEM_KINDS[name.toLowerCase()];
}

// Flavor text for "examine <item>" — every known item name should have one.
const ITEM_DESCRIPTIONS: Record<string, string> = {
  leg: 'A gaunt, yellowed leg bone, still faintly cold to the touch.',
  arm: 'A brittle arm bone, cracked in places from old wounds.',
  hand: 'A skeletal hand, fingers curled as if still gripping something.',
  skull: 'A weathered skull, jaw hanging slightly open in a silent scream.',
  rib: 'A single curved rib bone, thin and surprisingly light.',
  'bone dagger':
    'A crude dagger carved from bone and sharpened along one edge. Wielding it lets you stab rather than merely hit.',
};

export function itemDescriptionFor(name: string): string | undefined {
  return ITEM_DESCRIPTIONS[name.toLowerCase()];
}

// Iteration order for "equip"/"equipment" typed bare — head to toe,
// matching the order the request enumerated (and EquipmentSlot is
// declared in).
export const EQUIPMENT_SLOT_ORDER: EquipmentSlot[] = [
  'head',
  'leftEar',
  'rightEar',
  'torso',
  'leftForearm',
  'rightForearm',
  'shield',
  'weapon',
  'leftRing',
  'rightRing',
  'necklace',
  'leftShin',
  'rightShin',
  'boots',
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: 'Head',
  leftEar: 'Left Ear',
  rightEar: 'Right Ear',
  torso: 'Torso',
  leftForearm: 'Left Forearm',
  rightForearm: 'Right Forearm',
  shield: 'Shield',
  weapon: 'Weapon',
  leftRing: 'Left Ring',
  rightRing: 'Right Ring',
  necklace: 'Necklace',
  leftShin: 'Left Shin',
  rightShin: 'Right Shin',
  boots: 'Boots',
};
