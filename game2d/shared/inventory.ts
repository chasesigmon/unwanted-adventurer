// Item 29: "Every new player should start out with a max number of items
// allowed as a base of 20... and a base max weight allowed of 150 pounds...
// based off of dexterity/strength... go up some as a player levels up."
//
// No per-item weight table existed anywhere in this project before this ask
// (confirmed: shared/items.ts and shared/equipment.ts have no such thing).
// Rather than hand-author a weight for every one of the dozens of item
// strings scattered across vendors/loot tables/crafting, this reuses
// equipment.ts's own itemSellCategory (already the single source of truth
// for "what kind of thing is this item" — weapon/armor/general) as a
// lightweight per-category default weight, with a small override table for
// the handful of items that default poorly (crafting reagents are tiny).
import { itemSellCategory, type SellCategory } from './equipment.js';

const CATEGORY_DEFAULT_WEIGHT_LBS: Record<SellCategory, number> = {
  weapon: 6,
  armor: 8,
  general: 1,
};

const ITEM_WEIGHT_OVERRIDE_LBS: Record<string, number> = {
  'lesser mana crystal': 0.1,
  'superior mana crystal': 0.1,
  'perfect mana crystal': 0.1,
  'empty vial': 0.25,
  'vial of monster blood': 0.25,
  'focus gem': 0.25,
};

export function itemWeightLbs(item: string): number {
  return ITEM_WEIGHT_OVERRIDE_LBS[item] ?? CATEGORY_DEFAULT_WEIGHT_LBS[itemSellCategory(item)];
}

export function inventoryWeightLbs(inventory: string[]): number {
  return inventory.reduce((sum, item) => sum + itemWeightLbs(item), 0);
}

// "The max number of items and max weight do not apply to equipped items,
// only items in the inventory" — a no-op note, not code: equipped items
// already live in the separate `equipment: Record<slot, item>` map, never
// in the `inventory: string[]` array these functions read, so there's
// nothing to exclude.

export const INVENTORY_BASE_MAX_ITEMS = 20;
const ITEM_CAPACITY_PER_DEXTERITY_POINT = 0.5;
const ITEM_CAPACITY_PER_LEVEL = 0.5;

// Dexterity- and level-scaled max item count. Matches the project's own
// existing convention (see shared/skills.ts's effectiveMoveCooldownMs) of
// using the player's base attribute, not an equipment-bonused one.
export function maxInventoryItemCount(dexterity: number, level: number): number {
  return (
    INVENTORY_BASE_MAX_ITEMS +
    Math.floor(dexterity * ITEM_CAPACITY_PER_DEXTERITY_POINT) +
    Math.floor(level * ITEM_CAPACITY_PER_LEVEL)
  );
}

export const INVENTORY_BASE_MAX_WEIGHT_LBS = 150;
const WEIGHT_LBS_PER_STRENGTH_POINT = 3;
const WEIGHT_LBS_PER_LEVEL = 2;

export function maxInventoryWeightLbs(strength: number, level: number): number {
  return (
    INVENTORY_BASE_MAX_WEIGHT_LBS +
    Math.floor(strength * WEIGHT_LBS_PER_STRENGTH_POINT) +
    Math.floor(level * WEIGHT_LBS_PER_LEVEL)
  );
}

// "If the player goes over their max weight (this should be allowed) then
// it should slow the player's movement speed down considerably" — a flat
// multiplicative cooldown penalty, stacking with every other movement-speed
// modifier the same way celeritas/boots/wisp/flight/dexterity already do
// (see shared/skills.ts's effectiveMoveCooldownMs and its client-side
// duplicate in client/game/WorldScene.ts).
export const OVERWEIGHT_MOVE_COOLDOWN_FACTOR = 1.9;
