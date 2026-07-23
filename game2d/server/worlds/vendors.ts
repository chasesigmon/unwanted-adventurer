import type { MapName } from '../../shared/constants.js';
import { FLORO_SHOP_MAPS, KORTHO_SHOP_MAPS } from '../../shared/constants.js';
import type { VendorSnapshot } from '../../shared/types.js';
import { CUP_OF_WATER_ITEM, JERKY_ITEM, CANTEEN_ITEM, SALMON_ITEM, HP_POTION_ITEM, MP_POTION_ITEM, LINIMENT_ITEM } from '../../shared/items.js';
import { CANOE_ITEM, RAFT_ITEM, BOAT_PRICE } from '../../shared/boats.js';

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
    row: 3,
    col: 15,
    // A later follow-up ask ("make it so that the Floro and Kortho
    // blacksmith sells 1 of each type of wand... and 1 of each type of
    // sword... 10 coins each") — one wand and one sword per core stat
    // (see shared/equipment.ts's own doc comment on the full set/naming;
    // "wand of intelligence" already existed at Bramwick's own Weapons
    // shop with this exact +1 int/10 gold shape, reused here rather than
    // duplicated).
    items: [
      { label: 'bone dagger', price: 5 },
      { label: 'wand of intelligence', price: 10 },
      { label: 'wand of strength', price: 10 },
      { label: 'wand of wisdom', price: 10 },
      { label: 'wand of constitution', price: 10 },
      { label: 'wand of dexterity', price: 10 },
      { label: 'wand of luck', price: 10 },
      { label: 'sword of intelligence', price: 10 },
      { label: 'sword of strength', price: 10 },
      { label: 'sword of wisdom', price: 10 },
      { label: 'sword of constitution', price: 10 },
      { label: 'sword of dexterity', price: 10 },
      { label: 'sword of luck', price: 10 },
    ],
    greeting: 'Forged bone edges, sharp enough to earn their keep. Take a look.',
  },
  {
    id: 'floro-armorer',
    name: 'Armorer',
    map: 'Floro Armorer',
    row: 3,
    col: 15,
    // A later follow-up ask ("update Floro & Kortho armor shop: studded
    // armor 10 gold each, cloth armor 5 gold each, opal and bone
    // equipment 10 gold each") stocked the shelves for real, same "full
    // set, one price per piece" shape Bramwick's own Armorer already uses.
    items: [
      { label: 'cloth armor', price: 5 },
      { label: 'cloth helmet', price: 5 },
      { label: 'cloth gauntlets', price: 5 },
      { label: 'cloth greaves', price: 5 },
      { label: 'cloth vambraces', price: 5 },
      { label: 'cloth boots', price: 5 },
      { label: 'studded armor', price: 10 },
      { label: 'studded helmet', price: 10 },
      { label: 'studded gauntlets', price: 10 },
      { label: 'studded greaves', price: 10 },
      { label: 'studded vambraces', price: 10 },
      { label: 'studded boots', price: 10 },
      { label: 'opal earrings', price: 10 },
      { label: 'opal ring', price: 10 },
      { label: 'opal necklace', price: 10 },
      { label: 'bone ring', price: 10 },
      { label: 'bone shield', price: 10 },
    ],
    greeting: "A shield's worth more than a sword, in my experience. This one's sturdy.",
  },
  {
    id: 'floro-general-store',
    name: 'General Store',
    map: 'Floro General Store',
    row: 3,
    col: 15,
    // Item 31: "make sure they sell the same items as the Bramwick
    // general store and they should also sell the potions like the
    // Bramwick potion store" — plus Liniment, offered by all 3.
    items: [
      { label: 'torch', price: 3 },
      { label: CANTEEN_ITEM, price: 6 },
      { label: SALMON_ITEM, price: 5 },
      { label: HP_POTION_ITEM, price: 3 },
      { label: MP_POTION_ITEM, price: 3 },
      { label: LINIMENT_ITEM, price: 5 },
    ],
    greeting: 'Bit of everything in here. Torches sell well this time of year.',
  },
  {
    id: 'floro-inn',
    name: 'Innkeeper',
    map: 'Floro Inn',
    row: 3,
    col: 15,
    items: [],
    greeting: 'Rooms and rest, soon enough — for now, just warm yourself by the fire.',
  },
  {
    id: 'floro-bank',
    name: 'Banker',
    map: 'Floro Bank',
    row: 3,
    col: 15,
    items: [],
    greeting: "Your gold's safest in your own pocket, for now — vaults are still being built.",
  },
  {
    id: 'floro-pet-salesman',
    name: 'Pet Salesman',
    map: 'Floro Pet Salesman',
    row: 3,
    col: 15,
    items: [],
    greeting: "No creatures for sale just yet, but I'm always looking for stock.",
  },
  // A later follow-up ask ("have the floro boat shop sell the same items
  // as the kortho boat shop") repurposed Floro's own Jobs Office into a
  // Boat Shop too — the exact same conversion Kortho's own Jobs Office
  // already got (see its own doc comment below), keeping the two towns'
  // shop lineups in parity.
  {
    id: 'floro-boat-shop',
    name: 'Boat Shop',
    map: 'Floro Boat Shop',
    row: 3,
    col: 15,
    items: [
      { label: CANOE_ITEM, price: BOAT_PRICE[CANOE_ITEM] },
      { label: RAFT_ITEM, price: BOAT_PRICE[RAFT_ITEM] },
    ],
    greeting: 'Looking to cross the water? A canoe carries you and one pet — the raft carries your whole company.',
  },
  // A later follow-up ask: "Create an Auction House in both Floro and
  // Kortho" — no buy-list of its own (items: []); the client special-cases
  // this vendor's own id to open the Auction House modal instead of the
  // generic shop-buy one (see WorldScene's own vendor click handler).
  {
    id: 'floro-auction-house',
    name: 'Auctioneer',
    map: 'Floro Auction House',
    row: 3,
    col: 15,
    items: [],
    greeting: 'Looking to buy or sell? Step right up.',
  },
  // --- Kortho, Floro's own rival-town twin (a later follow-up ask: "add
  // the town of Kortho back... same size and rules and shops as when it
  // was being used before") — same "one shopkeeper just inside the door"
  // shape and item roster as Floro's own 7 shops above, mirrored rather
  // than shared so either town's stock can diverge independently later. ---
  {
    id: 'kortho-blacksmith',
    name: 'Blacksmith',
    map: 'Kortho Blacksmith',
    row: 3,
    col: 15,
    // Same wand/sword-per-stat set as Floro's own Blacksmith above (a
    // later follow-up ask) — see that shop's own doc comment.
    items: [
      { label: 'bone dagger', price: 5 },
      { label: 'wand of intelligence', price: 10 },
      { label: 'wand of strength', price: 10 },
      { label: 'wand of wisdom', price: 10 },
      { label: 'wand of constitution', price: 10 },
      { label: 'wand of dexterity', price: 10 },
      { label: 'wand of luck', price: 10 },
      { label: 'sword of intelligence', price: 10 },
      { label: 'sword of strength', price: 10 },
      { label: 'sword of wisdom', price: 10 },
      { label: 'sword of constitution', price: 10 },
      { label: 'sword of dexterity', price: 10 },
      { label: 'sword of luck', price: 10 },
    ],
    greeting: "Kortho steel — well, bone, same difference. Sharp enough to earn its keep.",
  },
  {
    id: 'kortho-armorer',
    name: 'Armorer',
    map: 'Kortho Armorer',
    row: 3,
    col: 15,
    // Same restock as Floro's own Armorer above — see its doc comment.
    items: [
      { label: 'cloth armor', price: 5 },
      { label: 'cloth helmet', price: 5 },
      { label: 'cloth gauntlets', price: 5 },
      { label: 'cloth greaves', price: 5 },
      { label: 'cloth vambraces', price: 5 },
      { label: 'cloth boots', price: 5 },
      { label: 'studded armor', price: 10 },
      { label: 'studded helmet', price: 10 },
      { label: 'studded gauntlets', price: 10 },
      { label: 'studded greaves', price: 10 },
      { label: 'studded vambraces', price: 10 },
      { label: 'studded boots', price: 10 },
      { label: 'opal earrings', price: 10 },
      { label: 'opal ring', price: 10 },
      { label: 'opal necklace', price: 10 },
      { label: 'bone ring', price: 10 },
      { label: 'bone shield', price: 10 },
    ],
    greeting: "A shield's worth more than a sword out here. This one's sturdy.",
  },
  {
    id: 'kortho-general-store',
    name: 'General Store',
    map: 'Kortho General Store',
    row: 3,
    col: 15,
    // Item 31: same parity as Floro's own General Store above.
    items: [
      { label: 'torch', price: 3 },
      { label: CANTEEN_ITEM, price: 6 },
      { label: SALMON_ITEM, price: 5 },
      { label: HP_POTION_ITEM, price: 3 },
      { label: MP_POTION_ITEM, price: 3 },
      { label: LINIMENT_ITEM, price: 5 },
    ],
    greeting: 'Bit of everything in here. Torches sell well this time of year.',
  },
  {
    id: 'kortho-inn',
    name: 'Innkeeper',
    map: 'Kortho Inn',
    row: 3,
    col: 15,
    items: [],
    greeting: 'Rooms and rest, soon enough — for now, just warm yourself by the fire.',
  },
  {
    id: 'kortho-bank',
    name: 'Banker',
    map: 'Kortho Bank',
    row: 3,
    col: 15,
    items: [],
    greeting: "Your gold's safest in your own pocket, for now — vaults are still being built.",
  },
  {
    id: 'kortho-pet-salesman',
    name: 'Pet Salesman',
    map: 'Kortho Pet Salesman',
    row: 3,
    col: 15,
    // Item 15: "add a 'young griffin', 'lesser elemental', and 'young
    // phoenix'... don't add these pets to Floro" — Kortho's own pet
    // salesman specifically, not Bramwick's Pet Shop or Floro's own
    // (still empty) salesman.
    items: [
      { label: 'griffin', price: 50 },
      { label: 'elemental', price: 50 },
      { label: 'phoenix', price: 50 },
    ],
    greeting: 'Exotic stock, fresh in — a griffin, an elemental, a phoenix. Not cheap, but worth every coin.',
  },
  // A later follow-up ask: "change one of the shops in Kortho to be a
  // 'Boat Shop'" — sells the small canoe/large raft (see shared/boats.ts)
  // that let a player cross water; the actual boarding/capacity rules
  // live in game.gateway.ts, not here — this vendor just sells the item.
  {
    id: 'kortho-boat-shop',
    name: 'Boat Shop',
    map: 'Kortho Boat Shop',
    row: 3,
    col: 15,
    items: [
      { label: CANOE_ITEM, price: BOAT_PRICE[CANOE_ITEM] },
      { label: RAFT_ITEM, price: BOAT_PRICE[RAFT_ITEM] },
    ],
    greeting: 'Looking to cross the water? A canoe carries you and one pet — the raft carries your whole company.',
  },
  // A later follow-up ask: "Create an Auction House in both Floro and
  // Kortho" — same as Floro's own floro-auction-house above.
  {
    id: 'kortho-auction-house',
    name: 'Auctioneer',
    map: 'Kortho Auction House',
    row: 3,
    col: 15,
    items: [],
    greeting: 'Looking to buy or sell? Step right up.',
  },
  // --- Bramwick, the small village north of Grimoak Grounds (a later
  // follow-up ask) — same "one shopkeeper just inside the door" shape as
  // Floro's own shops above. Greeting-only for now ("mechanics for the
  // shops will come later"), same as Floro's own Inn/Bank/Pet Salesman. ---
  {
    id: 'bramwick-general-shop',
    name: 'General Shop',
    map: 'Bramwick General Shop',
    row: 2,
    col: 5,
    // A later follow-up ask stocked the shelves for real. Item 31 added
    // Liniment, offered by all 3 General Stores (Bramwick/Kortho/Floro).
    items: [
      { label: CANTEEN_ITEM, price: 6 },
      { label: SALMON_ITEM, price: 5 },
      { label: LINIMENT_ITEM, price: 5 },
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
      // A later follow-up ask — the cloth set's one missing piece.
      { label: 'cloth gauntlets', price: 5 },
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
  // Phase C's "pet shop cottage" ask gave this one its own shop interior
  // too, same hub-and-spoke shape as the 4 Bramwick shops above (it used
  // to stand bare on the open street instead). Buying one is
  // special-cased in handleBuyItem (creates a real Pet, not an inventory
  // item) — these labels double as PetKind values.
  {
    id: 'bramwick-pet-shop',
    name: 'Pet Shop',
    map: 'Bramwick Pet Shop',
    row: 2,
    col: 5,
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
    // still shown alongside it — e.g. "Bram the Blacksmith".
    name: `${nameFor(seed.id, gender)} the ${seed.name}`,
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

// One tile in front of (south of) the vendor — the counter/shopfront
// prop stands here, same "anchor tile" shape as
// server/worlds/teachers.ts's own deskPositionFor.
function vendorFrontPositionFor(vendor: VendorSnapshot): { row: number; col: number } {
  return { row: vendor.row + 1, col: vendor.col };
}

// Real collision for the shop counter/shopfront a vendor stands behind (a
// later follow-up ask: "the desk should have full collision... make the
// desks wider, but not as tall" — same "footprint bigger than the single
// anchor tile" fix teacherDeskFootprintFor already applies to teacher
// desks, just wider and shallower to match the new dedicated counter art
// (see mapRender.ts's SHOP_COUNTER_TEXTURE_KEY) rather than the taller
// classroom-desk Bramwick's own vendors still use unchanged.
export function vendorCounterFootprintFor(vendor: VendorSnapshot): Array<{ row: number; col: number }> {
  const anchor = vendorFrontPositionFor(vendor);
  const usesCounter = (FLORO_SHOP_MAPS as readonly string[]).includes(vendor.map) || (KORTHO_SHOP_MAPS as readonly string[]).includes(vendor.map);
  const halfWidth = usesCounter ? 2 : 0;
  const tiles: Array<{ row: number; col: number }> = [];
  for (let dCol = -halfWidth; dCol <= halfWidth; dCol++) {
    tiles.push({ row: anchor.row, col: anchor.col + dCol });
  }
  return tiles;
}

// A later follow-up ask: "sell to vendor" originally let every vendor
// buy back anything a player was carrying, not just what THEY happened
// to stock. A still-later ask ("only armor equipment sellable to
// armorer; only weapons... sellable at blacksmith; everything else
// sellable at general store; nothing sellable at other shops, including
// Bramwick") replaced that free-for-all with real per-shop-type
// restrictions — see vendorSellCategory/itemSellCategory below, checked
// by game.gateway.ts's handleSellItem before this pricing formula ever
// runs. The formula itself (half the lowest listed buy price, floored,
// minimum 1 gold; a flat 1 gold "scrap" value for anything no vendor
// sells at all) is unchanged — this only gates WHERE a sale is allowed,
// not how much it's worth once it is.
const FALLBACK_SELL_PRICE = 1;
// A later follow-up ask ("update the studded armor to sell for 3 each,
// cloth armor should sell for 1 each") pins an exact sell price for items
// no vendor actually stocks for purchase (monster drops), where the
// derive-from-buy-price formula below would otherwise always fall
// through to the flat FALLBACK_SELL_PRICE for both sets alike — checked
// first, ahead of that derivation.
const SPECIFIC_SELL_PRICE: Record<string, number> = {
  'studded armor': 3,
  'studded helmet': 3,
  'studded gauntlets': 3,
  'studded greaves': 3,
  'studded vambraces': 3,
  'studded boots': 3,
  'cloth armor': 1,
  'cloth helmet': 1,
  'cloth boots': 1,
  'cloth vambraces': 1,
  'cloth greaves': 1,
  'cloth gauntlets': 1,
};
export function sellValueFor(itemLabel: string): number {
  if (SPECIFIC_SELL_PRICE[itemLabel] !== undefined) return SPECIFIC_SELL_PRICE[itemLabel];
  const prices = VENDORS.flatMap((v) => v.items.filter((i) => i.label === itemLabel).map((i) => i.price));
  if (prices.length === 0) return FALLBACK_SELL_PRICE;
  return Math.max(1, Math.floor(Math.min(...prices) / 2));
}

// itemSellCategory/vendorSellCategory (the "only armor sellable to
// armorer..." restriction) now live in shared/equipment.ts — both the
// server's own sell-restriction check and the client's shop-modal filter
// need the identical vendor-id-to-category mapping, so it can't be
// server-only here anymore. Re-exported for anyone already importing
// them from this file.
export { itemSellCategory, vendorSellCategory, type SellCategory } from '../../shared/equipment.js';
