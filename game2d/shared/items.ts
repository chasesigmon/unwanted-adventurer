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

// Mana crystals (a follow-up ask: "monsters are no longer going to drop
// body parts, instead a monster is going to now drop a mana crystal of
// varying level (1 to 5) depending on the level of the monster") —
// lootable, stay in the inventory, no mechanical use yet ("these will
// have a use later on"). Every wild monster is still MONSTER_LEVEL (1)
// today (see server/monsters/monster.ts), so in practice every drop is
// currently a lesser mana crystal — this is written to scale correctly
// the moment monster levels actually vary.
export const MANA_CRYSTAL_LABELS = [
  'lesser mana crystal',
  'minor mana crystal',
  'mana crystal',
  'greater mana crystal',
  'superior mana crystal',
] as const;
export type ManaCrystalLabel = (typeof MANA_CRYSTAL_LABELS)[number];

// Clamps to the 1-5 range this array actually covers (a level-6+ monster
// still just drops the top tier, not an out-of-bounds crash) and floors
// anything below 1 up to the lesser tier.
export function manaCrystalForLevel(level: number): ManaCrystalLabel {
  const index = Math.min(MANA_CRYSTAL_LABELS.length, Math.max(1, Math.round(level))) - 1;
  return MANA_CRYSTAL_LABELS[index]!;
}

// Guards the ordinary click-to-use/right-click-to-consume inventory flow
// away from mana crystals (same "not touchable through the generic path"
// treatment isFillableItem's own canteen guard already gets) — with no
// mechanical use defined yet, letting a stray click quietly consume one
// would burn it before that future use exists.
export function isManaCrystal(item: string): boolean {
  return (MANA_CRYSTAL_LABELS as readonly string[]).includes(item);
}

// Food & drink (a follow-up ask's eating & drinking system) — ordinary
// click-to-consume inventory items (see game.gateway.ts's applyConsume),
// unlike the canteen above: no targeting, a single use each, gone from
// the inventory the moment they're consumed (handleUseItem/
// handleConsumeItem already splice the clicked item out before applyConsume
// even runs). Sold by the Great Hall's own shopkeeper (see
// server/worlds/vendors.ts).
export const CUP_OF_WATER_ITEM = 'a cup of water';
export const JERKY_ITEM = 'some jerky';

// How much of the total (0-100) each restores — "recover 20% of thirst/
// hunger" per the follow-up ask.
export const THIRST_RESTORE_PERCENT = 20;
export const HUNGER_RESTORE_PERCENT = 20;
export const MAX_HUNGER_THIRST = 100;

// A later follow-up ask's Bramwick General Shop item — same "single-use,
// gone the instant it's consumed" shape as jerky above, but its own
// bigger restore amount ("should help the player to recover 30 hunger").
export const SALMON_ITEM = 'salmon';
export const SALMON_HUNGER_RESTORE_PERCENT = 30;

// Bug fix: the inventory's Equip/Use/Drop menu labeled every non-
// equippable item's action button "Use," even a plain drink or meal —
// themed instead ("Drink"/"Eat") for anything classified as a water or
// food source, generalized here so any FUTURE item added to either list
// automatically gets the same treatment without touching the UI again.
export const DRINKABLE_ITEMS: readonly string[] = [CUP_OF_WATER_ITEM];
export const EDIBLE_ITEMS: readonly string[] = [JERKY_ITEM, SALMON_ITEM];

export function isDrinkableItem(item: string): boolean {
  return DRINKABLE_ITEMS.includes(item);
}

export function isEdibleItem(item: string): boolean {
  return EDIBLE_ITEMS.includes(item);
}

// A later follow-up ask's Bramwick Potions shop items — flat hp/mana
// amounts (not a percent of max, unlike hunger/thirst above, since
// max hp/mana both grow with level/attributes while hunger/thirst stay a
// fixed 0-100 scale).
export const HP_POTION_ITEM = 'hp potion';
export const MP_POTION_ITEM = 'mp potion';
export const POTION_RESTORE_AMOUNT = 20;

// Item 31: sold by all three General Stores (Bramwick, Kortho, Floro) —
// same "single-use, gone the instant it's consumed" shape as jerky/salmon
// above, restoring a flat amount of mv (movement points aren't a 0-100
// scale like hunger/thirst either, but a flat restore matches the potions'
// own convention rather than hunger/thirst's percent one).
export const LINIMENT_ITEM = 'liniment';
export const LINIMENT_MV_RESTORE_AMOUNT = 10;

// A later follow-up ask: "in inventory & shops, organize items
// alphabetically; selling an item with multiples should keep its position
// stable instead of jumping around." The server's own inventory stays a
// flat array with no concept of stacks (see player.entity.ts's own doc
// comment) — grouping identical items into a single "item xN" row for
// display is purely a client-side concern. Both the inventory panel and
// the shop's "sell" list used to build this grouping as a Map keyed by
// first-occurrence order in the flat array, which meant selling the
// FRONT-most copy of a stack could promote some unrelated item's earlier
// copy ahead of it, visibly reordering the list. Sorting the finished
// groups alphabetically by label fixes both asks at once: display order
// no longer depends on which raw index happens to survive a sell/use/
// drop, only on the label text itself, so a stack's position never moves
// just because one copy of it (or some OTHER item) was removed.
export function groupInventoryItems(items: readonly string[]): Array<[string, number[]]> {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const indices = groups.get(item);
    if (indices) indices.push(index);
    else groups.set(item, [index]);
  });
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
