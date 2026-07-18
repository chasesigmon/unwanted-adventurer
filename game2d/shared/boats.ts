// A later follow-up ask: "change one of the shops in Kortho to be a
// 'Boat Shop'... sell 'a small canoe'... 'a large raft'... for the canoe
// and raft to work, the player must have them in their inventory and as
// soon as they either walk onto water or land on it from flying then
// they should automatically be in their boat." A boat is just a regular
// inventory item string (this game has no per-item metadata system at
// all — see shared/equipment.ts's own label-keyed lookup convention,
// mirrored here) that also happens to unlock crossing water once owned;
// classified "boat" the same way an equipment item is classified by slot.
export const CANOE_ITEM = 'a small canoe';
export const RAFT_ITEM = 'a large raft';
export const BOAT_ITEMS = [CANOE_ITEM, RAFT_ITEM] as const;

export type BoatSize = 'small' | 'large';

type BoatItem = typeof CANOE_ITEM | typeof RAFT_ITEM;

export const BOAT_SIZE_FOR_ITEM: Record<BoatItem, BoatSize> = {
  [CANOE_ITEM]: 'small',
  [RAFT_ITEM]: 'large',
};

export const BOAT_WEIGHT_LBS: Record<BoatItem, number> = {
  [CANOE_ITEM]: 20,
  [RAFT_ITEM]: 100,
};

export const BOAT_PRICE: Record<BoatItem, number> = {
  [CANOE_ITEM]: 100,
  [RAFT_ITEM]: 300,
};

export function isBoatItem(item: string): boolean {
  return item === CANOE_ITEM || item === RAFT_ITEM;
}

export function boatSizeForItem(item: string): BoatSize | undefined {
  return isBoatItem(item) ? BOAT_SIZE_FOR_ITEM[item as BoatItem] : undefined;
}

// "As soon as they either walk onto water or land on it from flying then
// they should automatically be in their boat, if there is one in their
// inventory" — when a player owns both, the raft (strictly more capable:
// carries everything the canoe does, plus animated dead/summons too —
// see FollowerSize/boat-capacity doc comments below) is the one auto-
// boarded; the canoe only comes into play when that's all they own.
export function pickBoatItem(inventory: string[]): string | undefined {
  if (inventory.includes(RAFT_ITEM)) return RAFT_ITEM;
  if (inventory.includes(CANOE_ITEM)) return CANOE_ITEM;
  return undefined;
}

// Capacity rules, straight from the ask: "the small canoe... can only
// carry the player and a small or medium sized pet, it cannot carry the
// player and animated dead/summons, so the summons would stay behind."
// "The large raft... can carry the player and all of their animated
// dead/summons/pets." Since EVERY pet is always either 'small' or
// 'medium' (see shared/pets.ts's FollowerSize), a canoe always has room
// for a player's one pet — the size tiers exist for a future creature
// that might not qualify, not because any pet today is ever excluded.
// A pet fits on either boat size; an animated monster/summon only fits
// on the large raft — see PetManagerService/AnimatedMonsterManagerService's
// own tickAll, which reads this same rule directly off the owner's
// PlayerState.inBoat rather than re-deriving it here.
export function boatCarriesPets(_size: BoatSize): boolean {
  return true;
}

export function boatCarriesAnimatedMonsters(size: BoatSize): boolean {
  return size === 'large';
}
