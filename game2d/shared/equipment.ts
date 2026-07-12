// The text game's full 16-slot equipment list — this project only has
// real items for 'weapon' so far (same as the text game itself, which
// only maps items to 3 of its own 16), but both the server (combat/
// formulas.ts) and the client (the Equipment modal) need the same slot
// list/labels, hence living here rather than duplicated in each.
export const EQUIPMENT_SLOTS = [
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
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

// A wand fills the same 'weapon' slot a bone dagger would (see
// combat/formulas.ts's EQUIPMENT_SLOT_FOR_ITEM) — mutually exclusive with
// carrying a dagger, matching a wizard's actual hand. Every new character
// starts with one (see auth.service.ts's createCharacter).
export const WAND_ITEM = 'wand';

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
