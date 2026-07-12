// Utility item constants — a canteen and, generically, "anything fillable"
// (item 7's follow-up ask). Unlike equipment (shared/equipment.ts), these
// items aren't worn/wielded; they're acted on via a targeted skill (drink/
// pour/irrigo — see shared/skills.ts) instead of the ordinary click-to-
// use/consume inventory flow.
export const CANTEEN_ITEM = 'canteen';
// How many drinks of water a canteen holds before it needs refilling
// (irrigo — see shared/skills.ts's IRRIGO_SKILL) — a player's current
// level lives in a dedicated `canteenDrinks` field (not encoded in the
// inventory string itself), same "special per-item state gets its own
// field" treatment TORCH_LIFETIME_MS's burn-down already uses.
export const CANTEEN_CAPACITY = 6;

// Everything irrigo is able to fill (item 6's follow-up ask: "require a
// target that can be filled like a cup, bowl, well, hole, etc.") — only
// the canteen actually exists as a real item today; more can be added
// here later without touching the spell/skill logic itself.
export const FILLABLE_ITEMS: readonly string[] = [CANTEEN_ITEM];

export function isFillableItem(item: string): boolean {
  return FILLABLE_ITEMS.includes(item);
}
