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
