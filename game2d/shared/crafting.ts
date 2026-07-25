// The Crafting Shop's own crafting table (a later follow-up ask) — a
// 3x3 grid of slots, each holding one ingredient TYPE and a count (up to
// MAX_MANA_CRYSTALS_PER_CRAFT of a mana crystal in one slot — "allowed to
// add multiple mana crystals up to a max of 10 of any type" — so a slot
// is a {item, count} stack, not one literal item instance; 9 slots is
// otherwise not enough room for the equipment recipe's own up-to-10
// crystals plus the weapon/gem/vial).
//
// Two recipe families are supported: crafting a weapon/shield (see
// isCraftableWeaponOrShield), and upgrading mana crystals a tier.
import { isWandItem, isSwordItem } from './equipment.js';
import { FOCUS_GEM_ITEM, FILLED_VIAL_ITEM } from './items.js';

// A crafting-only tier beyond shared/items.ts's own MANA_CRYSTAL_LABELS
// (whose top tier, "superior mana crystal," is a real monster drop) —
// "perfect mana crystal" is never dropped, only ever produced by the
// "10 superior -> 1 perfect" recipe below.
export const PERFECT_MANA_CRYSTAL_ITEM = 'perfect mana crystal';

// Only these 3 of shared/items.ts's 5 monster-drop tiers are actually
// usable in either crafting recipe — "either a lesser mana crystal,
// superior mana crystal, or perfect mana crystal" was explicit about
// which ones count; minor/plain/greater have no crafting use defined.
const CRAFT_MANA_CRYSTALS = ['lesser mana crystal', 'superior mana crystal', PERFECT_MANA_CRYSTAL_ITEM] as const;
export type CraftManaCrystal = (typeof CRAFT_MANA_CRYSTALS)[number];
export function isCraftManaCrystal(item: string): item is CraftManaCrystal {
  return (CRAFT_MANA_CRYSTALS as readonly string[]).includes(item);
}

// "For each lesser mana crystal added... +1 mana... superior... +5 mana...
// perfect... +10 mana."
export const MANA_BONUS_PER_CRYSTAL: Record<CraftManaCrystal, number> = {
  'lesser mana crystal': 1,
  'superior mana crystal': 5,
  [PERFECT_MANA_CRYSTAL_ITEM]: 10,
};
export const MAX_MANA_CRYSTALS_PER_CRAFT = 10;

// A crafted weapon/shield's own "unique name" IS its base item name plus
// a " of Mana +N" suffix encoding its mana bonus — this whole game's
// inventory model is a flat string array with no per-item metadata, so
// the bonus has to live in the string itself. craftedItemBaseName strips
// it back off, so every EXISTING exact-string-keyed bonus lookup (weapon
// damage, jewelry stat bonuses, shield block chance, EQUIPMENT_SLOT_FOR_ITEM,
// ...) still recognizes a crafted item as its own base type without
// needing a bespoke entry for every possible crafted name — a no-op for
// any string that isn't one of these (returned completely unchanged).
const CRAFTED_SUFFIX_PATTERN = / of Mana \+(\d+)$/;

export function craftedItemBaseName(item: string): string {
  return item.replace(CRAFTED_SUFFIX_PATTERN, '');
}

export function craftedItemManaBonus(item: string): number {
  const match = item.match(CRAFTED_SUFFIX_PATTERN);
  return match ? Number(match[1]) : 0;
}

// "Add a recipe for each sword and wand and dagger and shield in the
// game" — reuses the same isWandItem/isSwordItem prefix checks
// shared/equipment.ts already uses elsewhere, plus the two exact-name
// items (bone dagger/bone shield are the only dagger/shield items that
// exist at all today, per shared/equipment.ts).
export function isCraftableWeaponOrShield(item: string): boolean {
  return isWandItem(item) || isSwordItem(item) || item === 'bone dagger' || item === 'bone shield';
}

export interface CraftSlot {
  item: string;
  count: number;
}

export type CraftResult =
  | { ok: true; kind: 'equipment'; resultItem: string; consumed: CraftSlot[] }
  | { ok: true; kind: 'crystal-upgrade'; resultItem: string; consumed: CraftSlot[] }
  | { ok: false };

// Matches the 9-slot crafting grid against the 2 recipe families this
// game supports right now. Any slot that doesn't fit one of the
// recognized ingredient roles (or doesn't match the exact counts each
// recipe requires) fails the WHOLE match — "if the items are incorrect
// then say that those items don't form a recipe," not a partial craft.
export function matchRecipe(slots: Array<CraftSlot | null>): CraftResult {
  const filled = slots.filter((s): s is CraftSlot => s !== null && s.count > 0);
  if (filled.length === 0) return { ok: false };

  // --- Mana crystal upgrade: exactly one slot, exactly 10 of a lesser or
  // superior crystal, nothing else. ---
  if (filled.length === 1 && filled[0]!.count === 10 && (filled[0]!.item === 'lesser mana crystal' || filled[0]!.item === 'superior mana crystal')) {
    const resultItem = filled[0]!.item === 'lesser mana crystal' ? 'superior mana crystal' : PERFECT_MANA_CRYSTAL_ITEM;
    return { ok: true, kind: 'crystal-upgrade', resultItem, consumed: [filled[0]!] };
  }

  // --- Equipment crafting: exactly 1 weapon/shield + 1 focus gem + 1
  // filled vial + 1-10 of ONE mana crystal tier, nothing else. ---
  const weaponSlots = filled.filter((s) => isCraftableWeaponOrShield(s.item));
  const gemSlots = filled.filter((s) => s.item === FOCUS_GEM_ITEM);
  const vialSlots = filled.filter((s) => s.item === FILLED_VIAL_ITEM);
  const crystalSlots = filled.filter((s) => isCraftManaCrystal(s.item));
  const accountedFor = weaponSlots.length + gemSlots.length + vialSlots.length + crystalSlots.length;
  if (
    accountedFor === filled.length &&
    weaponSlots.length === 1 &&
    weaponSlots[0]!.count === 1 &&
    gemSlots.length === 1 &&
    gemSlots[0]!.count === 1 &&
    vialSlots.length === 1 &&
    vialSlots[0]!.count === 1 &&
    crystalSlots.length === 1 &&
    crystalSlots[0]!.count >= 1 &&
    crystalSlots[0]!.count <= MAX_MANA_CRYSTALS_PER_CRAFT
  ) {
    const crystal = crystalSlots[0]!;
    const manaBonus = MANA_BONUS_PER_CRYSTAL[crystal.item as CraftManaCrystal] * crystal.count;
    const resultItem = `${weaponSlots[0]!.item} of Mana +${manaBonus}`;
    return { ok: true, kind: 'equipment', resultItem, consumed: [weaponSlots[0]!, gemSlots[0]!, vialSlots[0]!, crystal] };
  }

  return { ok: false };
}
