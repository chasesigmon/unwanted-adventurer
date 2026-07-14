import type { MapName } from '../../shared/constants.js';
import type { VendorSnapshot } from '../../shared/types.js';
import { CUP_OF_WATER_ITEM, JERKY_ITEM, CANTEEN_ITEM, SALMON_ITEM, HP_POTION_ITEM, MP_POTION_ITEM } from '../../shared/items.js';

// Deterministic (not Math.random) so a vendor's appearance/name stays
// the same across server restarts — same reasoning as shared/trees.ts's
// own seeded placement.
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const MALE_NAMES = ['Garrick', 'Bram', 'Oskar', 'Fenwick', 'Doran', 'Alric', 'Tobin', 'Corwin'];
const FEMALE_NAMES = ['Mira', 'Sable', 'Ysolde', 'Rowan', 'Tessa', 'Nissa', 'Wren', 'Aveline'];
// A small skin-tone palette (item 13's "randomized... skin color") —
// applied as a Phaser tint over the shared shopkeeper spritesheet (see
// main.ts) rather than true per-part hair/eye/clothing art, which this
// project doesn't have layered assets for yet. A coarse phase-1 pass.
const SKIN_TINTS = [0xf0d0b0, 0xe0b088, 0xc89060, 0xa8703c, 0x8a5a30, 0xf5e0c8];

interface VendorSeed {
  id: string;
  name: string;
  map: MapName;
  row: number;
  col: number;
  items: VendorSnapshot['items'];
  greeting: string;
}

// Every appearance field below is DERIVED from the vendor's own id (see
// randomizeAppearance) rather than stored by hand, so adding a new
// vendor never needs its own gender/tint pick.
function randomizeAppearance(id: string): Pick<VendorSnapshot, 'gender' | 'skinTint'> {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const gender: VendorSnapshot['gender'] = seededRandom(hash) < 0.5 ? 'male' : 'female';
  const skinTint = SKIN_TINTS[Math.floor(seededRandom(hash + 1) * SKIN_TINTS.length)]!;
  return { gender, skinTint };
}

function nameFor(id: string, gender: VendorSnapshot['gender']): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 17 + id.charCodeAt(i)) >>> 0;
  const pool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
  return pool[Math.floor(seededRandom(hash + 2) * pool.length)]!;
}

// Static (never-moving, never-attackable) shop NPCs — a completely
// separate list from NPCS (worlds/npcs.ts), since those are combat
// targets (the training dummy) and vendors deliberately aren't. The
// client renders a non-interactive shopfront sprite directly in front of
// (one row south of) every vendor — see main.ts's applyMapState. Both
// the shopkeeper's own tile and that shopfront tile block movement (see
// WorldManagerService.isOccupied/MonsterManagerService.isFree).
const VENDOR_SEEDS: VendorSeed[] = [
  // The Great Hall's own food-and-drink vendor (a follow-up ask) — "about
  // 5 feet north after you walk into the Great Hall and about 5 feet
  // away from the left wall." The Great Hall's own west door lands the
  // player at (GREAT_HALL_MID_ROW, 0) — see shared/maps.ts — so "5 feet"
  // (this project's own ~2 tiles/5ft scale, see SHOP_REACH_TILES's "about
  // 10 feet" == 2 tiles) north and east of there is (MID_ROW - 2, 2).
  // Reuses the shared shopkeeper/shopfront spritesheets (see
  // WorldScene.ts's applyMapState), same as every other vendor.
  {
    id: 'great-hall-shopkeeper',
    name: 'Provisioner',
    map: 'Great Hall',
    row: 11,
    col: 2,
    items: [
      { label: CUP_OF_WATER_ITEM, price: 2 },
      { label: JERKY_ITEM, price: 3 },
    ],
    greeting: 'Water and jerky, fresh enough — keep your strength up between classes.',
  },
  {
    id: 'labyrinth-shopkeeper',
    name: 'Shopkeeper',
    map: 'Labyrinth',
    // Directly in front of (same column as) the Labyrinth's own
    // entrance — the door back to the Great Plains is at
    // (LABYRINTH_SIZE-1, LABYRINTH_MID_COL) = (59, 30) (see
    // shared/maps.ts) — set back from it by roughly the "20 feet" asked
    // for, using this project's own established ~2.5ft/tile scale (see
    // shared/lighting.ts's original "10 foot diameter" == 4-tile-diameter
    // light radius), i.e. 8 tiles north of the door.
    row: 51,
    col: 30,
    items: [{ label: 'torch', price: 3 }],
    greeting: "I serve any and all with coin! Don't forget your torches for night in the wilderness!",
  },
  // --- Floro town, phase 1 (item 13) — one shopkeeper per shop
  // interior (see shared/maps.ts's FLORO_SHOP_DOORS/shopInteriorDefinition),
  // standing just inside the door at the room's back wall. Only the
  // Blacksmith/Armorer/General Store have real sellable items today
  // (this project's item roster is still tiny); the rest are greeting-only
  // for now, flagged as future work rather than inventing fictional items. ---
  {
    id: 'floro-blacksmith',
    name: 'Blacksmith',
    map: 'Floro Blacksmith',
    row: 2,
    col: 5,
    items: [{ label: 'bone dagger', price: 5 }],
    greeting: 'Forged bone edges, sharp enough to earn their keep. Take a look.',
  },
  {
    id: 'floro-armorer',
    name: 'Armorer',
    map: 'Floro Armorer',
    row: 2,
    col: 5,
    items: [{ label: 'bone shield', price: 6 }],
    greeting: "A shield's worth more than a sword, in my experience. This one's sturdy.",
  },
  {
    id: 'floro-general-store',
    name: 'General Store',
    map: 'Floro General Store',
    row: 2,
    col: 5,
    items: [{ label: 'torch', price: 3 }],
    greeting: 'Bit of everything in here. Torches sell well this time of year.',
  },
  {
    id: 'floro-inn',
    name: 'Innkeeper',
    map: 'Floro Inn',
    row: 2,
    col: 5,
    items: [],
    greeting: 'Rooms and rest, soon enough — for now, just warm yourself by the fire.',
  },
  {
    id: 'floro-bank',
    name: 'Banker',
    map: 'Floro Bank',
    row: 2,
    col: 5,
    items: [],
    greeting: "Your gold's safest in your own pocket, for now — vaults are still being built.",
  },
  {
    id: 'floro-pet-salesman',
    name: 'Pet Salesman',
    map: 'Floro Pet Salesman',
    row: 2,
    col: 5,
    items: [],
    greeting: "No creatures for sale just yet, but I'm always looking for stock.",
  },
  {
    id: 'floro-jobs-office',
    name: 'Clerk',
    map: 'Floro Jobs Office',
    row: 2,
    col: 5,
    items: [],
    greeting: 'No postings on the board today — check back another time.',
  },
  // --- Bramwick, the small village north of Grimoak Grounds (a later
  // follow-up ask) — same "one shopkeeper just inside the door" shape as
  // Floro's own shops above. Greeting-only for now ("mechanics for the
  // shops will come later"), same as Floro's own Inn/Bank/Pet Salesman/
  // Jobs Office. ---
  {
    id: 'bramwick-general-shop',
    name: 'General Shop',
    map: 'Bramwick General Shop',
    row: 2,
    col: 5,
    // A later follow-up ask stocked the shelves for real.
    items: [
      { label: CANTEEN_ITEM, price: 6 },
      { label: SALMON_ITEM, price: 5 },
    ],
    greeting: 'A bit of everything — a fresh canteen, a salmon for the road, whatever you need.',
  },
  {
    id: 'bramwick-wands',
    // A later follow-up ask renamed the shop itself to "Weapons" (wands
    // sold alongside other weapon-slot gear now, not the whole identity)
    // — the vendor id stays the same (just an internal key), only the
    // display name/map/greeting change.
    name: 'Weaponsmith',
    map: 'Bramwick Weapons',
    row: 2,
    col: 5,
    // A later follow-up ask stocked the shelves for real.
    items: [
      { label: 'wand of intelligence', price: 10 },
      { label: 'wand of quickness', price: 7 },
    ],
    greeting: "Wands, blades, whatever suits your hand — take a look at what's carved and ready.",
  },
  {
    id: 'bramwick-armor',
    name: 'Armorer',
    map: 'Bramwick Armor',
    row: 2,
    col: 5,
    // A later follow-up ask stocked the shelves for real.
    items: [
      { label: 'cloth armor', price: 5 },
      { label: 'cloth helmet', price: 5 },
      { label: 'cloth boots', price: 5 },
      { label: 'cloth vambraces', price: 5 },
      { label: 'cloth greaves', price: 5 },
    ],
    greeting: 'Sturdy cloth work, every piece — ready for coin whenever you are.',
  },
  {
    id: 'bramwick-potions',
    name: 'Potioneer',
    map: 'Bramwick Potions',
    row: 2,
    col: 5,
    // A later follow-up ask stocked the shelves for real.
    items: [
      { label: HP_POTION_ITEM, price: 3 },
      { label: MP_POTION_ITEM, price: 3 },
    ],
    greeting: "The cauldron's always brewing something — fresh hp and mp potions, bottled and ready.",
  },
  // A later follow-up ask — standing right on Bramwick's own street
  // (not its own shop interior, unlike the 4 above) at the exact spot
  // the town's own middle standing torch used to sit before being
  // removed (see shared/lighting.ts's standingTorchPositionsFor).
  // Buying one is special-cased in handleBuyItem (creates a real Pet,
  // not an inventory item) — these labels double as PetKind values.
  {
    id: 'bramwick-pet-shop',
    name: 'Pet Shop',
    map: 'Bramwick',
    row: 20,
    col: 20,
    items: [
      { label: 'puppy', price: 15 },
      { label: 'kitten', price: 15 },
      { label: 'piglet', price: 15 },
    ],
    greeting: 'Every one of these is looking for a companion — pick whichever one suits you.',
  },
];

export const VENDORS: VendorSnapshot[] = VENDOR_SEEDS.map((seed) => {
  const { gender, skinTint } = randomizeAppearance(seed.id);
  return {
    id: seed.id,
    // A shopkeeper's own generated first name, with their role/title
    // still shown alongside it — e.g. "Bram the Blacksmith" — except the
    // Labyrinth vendor, whose plain "Shopkeeper" label predates this and
    // isn't role-flavored the same way.
    name: seed.name === 'Shopkeeper' ? seed.name : `${nameFor(seed.id, gender)} the ${seed.name}`,
    map: seed.map,
    row: seed.row,
    col: seed.col,
    items: seed.items,
    greeting: seed.greeting,
    gender,
    skinTint,
  };
});

export function vendorsForMap(mapName: MapName): VendorSnapshot[] {
  return VENDORS.filter((v) => v.map === mapName);
}

export function findVendor(vendorId: string): VendorSnapshot | undefined {
  return VENDORS.find((v) => v.id === vendorId);
}
