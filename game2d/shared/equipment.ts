// A later follow-up ask trimmed the text game's original 16-slot list
// down to 12: 'mask' dropped entirely (nothing ever filled it), and the
// 3 paired left/right slots that only ever held identical gear anyway
// (arms, legs, ears) collapsed into one slot each — 'vambraces',
// 'greaves', 'earrings' — matching the new cloth/studded armor pieces
// (see combat/formulas.ts's ARMOR_ITEM_AC_BONUS) that actually fill
// them. Rings stay a true left/right pair (see game.gateway.ts's own
// ring-equip "which hand" logic) since a player can meaningfully wear
// two DIFFERENT rings at once. Both the server (combat/formulas.ts) and
// the client (the Equipment modal) need the same slot list/labels, hence
// living here rather than duplicated in each.
export const EQUIPMENT_SLOTS = [
  'head',
  'earrings',
  'torso',
  'vambraces',
  'gauntlets',
  'shield',
  'weapon',
  'leftRing',
  'rightRing',
  'necklace',
  'greaves',
  'boots',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

// A wand fills the same 'weapon' slot a bone dagger would (see
// EQUIPMENT_SLOT_FOR_ITEM below) — mutually exclusive with carrying a
// dagger, matching a wizard's actual hand. Every new character starts
// with one (see auth.service.ts's createCharacter).
export const WAND_ITEM = 'wand';

// A later follow-up ask's Bramwick Weapons shop sells named variant
// wands ("wand of intelligence", "wand of quickness") — every
// spellcasting gate in the game checks "is a wand equipped" via this
// helper now instead of an exact WAND_ITEM match, so a variant wand
// still lets its owner cast (on top of its own stat bonus — see
// combat/formulas.ts's JEWELRY_DEXTERITY_BONUS/JEWELRY_INTELLIGENCE_BONUS),
// not just the plain starter one.
export function isWandItem(item: string | undefined): boolean {
  return item === WAND_ITEM || (item?.startsWith('wand of') ?? false);
}

// A later follow-up ask: "show what bonus a piece of gear actually
// gives" — the Equipment modal had no way to see this before, just the
// character sheet's own rolled-up AC total. Plain display strings, kept
// in sync BY HAND with the real numbers in combat/formulas.ts
// (ARMOR_ITEM_AC_BONUS/BONE_SHIELD_ARMOR_CLASS_BONUS/WEAPON_DAMAGE_BONUS/
// JEWELRY_DEXTERITY_BONUS/JEWELRY_INTELLIGENCE_BONUS) — those tables stay
// server-only (combat/ isn't shared), so this is a deliberate duplicate
// for display purposes only, same "shared/ can't import a server-only
// constant" tradeoff already made elsewhere in this project. Absent for
// anything with no mechanical bonus (a torch, cloth-less slots, ...).
export const EQUIPMENT_ITEM_BONUS_LABEL: Record<string, string> = {
  'cloth armor': '+4 armor class',
  'cloth helmet': '+4 armor class',
  'cloth boots': '+4 armor class',
  'cloth vambraces': '+4 armor class',
  'cloth greaves': '+4 armor class',
  'cloth gauntlets': '+4 armor class',
  'studded armor': '+8 armor class',
  'studded helmet': '+8 armor class',
  'chainmail vambraces': '+6 armor class',
  "warlord's greaves": '+10 armor class',
  'obsidian helm': '+12 armor class',
  'dragon scale armor': '+16 armor class',
  'bone shield': '+5 armor class',
  'bone dagger': '+2 damage',
  'opal earrings': '+1 dexterity',
  'opal ring': '+1 dexterity',
  'opal necklace': '+1 dexterity',
  'bone ring': '+1 intelligence',
  'wand of quickness': '+2 dexterity',
  'wand of intelligence': '+1 intelligence',
  'wand of frost': '+2 dexterity',
  'wand of embers': '+2 intelligence',
  'wand of shadows': '+3 intelligence',
  'wand of the ashen king': '+2 dexterity, +4 intelligence',
};

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: 'Head',
  earrings: 'Earrings',
  torso: 'Torso',
  vambraces: 'Vambraces',
  gauntlets: 'Gauntlets',
  shield: 'Shield',
  weapon: 'Weapon',
  leftRing: 'Left Ring',
  rightRing: 'Right Ring',
  necklace: 'Necklace',
  greaves: 'Greaves',
  boots: 'Boots',
};

// Which equipment slot an item goes into, if any — items not listed here
// aren't equippable at all, just consumable body parts. Rings are a
// special case (see server/combat/formulas.ts's isRingItem/
// resolveRingSlot) — both ring items still need an entry here so
// handleUseItem's "is this even equippable" check passes, but the actual
// slot (left vs right) is resolved dynamically at equip time, not read
// from this fixed map. Moved here from server/combat/formulas.ts (a
// later follow-up ask) so the client can also tell whether an item is
// equippable at all — see pets.ts's FOLLOWER_EQUIPMENT_SLOTS and
// inventoryEquipment.ts's own "only offer Give if the follower could
// actually wear it" check.
export const EQUIPMENT_SLOT_FOR_ITEM: Record<string, EquipmentSlot> = {
  'bone dagger': 'weapon',
  'bone shield': 'shield',
  // Carried in the off-hand, same slot a shield would use — a light
  // source, not armor, but this project only has the one off-hand slot.
  torch: 'shield',
  // Same slot a bone dagger would use — a wand and a dagger are mutually
  // exclusive, matching a wizard's actual hand.
  [WAND_ITEM]: 'weapon',
  // Monster-dropped armor (a later follow-up ask: imp/wild
  // skeleton/goblin loot tables — see server/monsters/monster.ts).
  'cloth armor': 'torso',
  'cloth helmet': 'head',
  'cloth boots': 'boots',
  'cloth vambraces': 'vambraces',
  'cloth greaves': 'greaves',
  // A later follow-up ask — the cloth set covered every OTHER armor slot
  // already, gauntlets was the one gap.
  'cloth gauntlets': 'gauntlets',
  'studded armor': 'torso',
  'studded helmet': 'head',
  'boots of quickness': 'boots',
  'opal earrings': 'earrings',
  'opal necklace': 'necklace',
  // Placeholder slot only — see isRingItem/resolveRingSlot below, which
  // actually decides left vs right at equip time.
  'opal ring': 'leftRing',
  'bone ring': 'leftRing',
  // Weapon-slot wands sold by Bramwick's own Weapons shop (a later
  // follow-up ask) — same slot an ordinary wand/dagger would use.
  'wand of intelligence': 'weapon',
  'wand of quickness': 'weapon',
  // The 4th floor's own 4 portal dungeons (a later follow-up ask) —
  // "rare wands not available in the shop" plus a matching armor piece,
  // one tier per dungeon (see server/monsters/monster.ts's own
  // PORTAL_DUNGEON_MAPS species entries).
  'wand of frost': 'weapon',
  'chainmail vambraces': 'vambraces',
  'wand of embers': 'weapon',
  "warlord's greaves": 'greaves',
  'wand of shadows': 'weapon',
  'obsidian helm': 'head',
  'wand of the ashen king': 'weapon',
  'dragon scale armor': 'torso',
};
