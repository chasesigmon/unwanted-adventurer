// A later follow-up ask: "make it so that the Floro and Kortho blacksmith
// sells 1 of each type of wand (int, str, wis, con, dex, luck) and 1 of
// each type of sword. Each type of weapon should give +1 to that stat
// respectively. The wands should give +1 to ranged magic basic damage.
// The swords should give +2 to physical damage... make them all sell for
// 10 coins each."
import { findVendor } from '../server/worlds/vendors.js';
import {
  strengthEquipmentBonus,
  wisdomEquipmentBonus,
  luckEquipmentBonus,
  dexterityEquipmentBonus,
  intelligenceEquipmentBonus,
  constitutionEquipmentBonus,
  WEAPON_DAMAGE_BONUS,
  wandRangedDamageBonus,
} from '../server/combat/formulas.js';
import { isWandItem, isSwordItem, EQUIPMENT_SLOT_FOR_ITEM } from '../shared/equipment.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const WANDS = ['wand of intelligence', 'wand of strength', 'wand of wisdom', 'wand of constitution', 'wand of dexterity', 'wand of luck'];
const SWORDS = ['sword of intelligence', 'sword of strength', 'sword of wisdom', 'sword of constitution', 'sword of dexterity', 'sword of luck'];

for (const vendorId of ['floro-blacksmith', 'kortho-blacksmith']) {
  const vendor = findVendor(vendorId);
  check(`${vendorId} exists`, vendor !== undefined);
  if (!vendor) continue;
  for (const item of [...WANDS, ...SWORDS]) {
    const listing = vendor.items.find((i) => i.label === item);
    check(`${vendorId} sells "${item}" for 10 coins`, listing?.price === 10, `got ${JSON.stringify(listing)}`);
  }
  check(`${vendorId} still sells bone dagger`, vendor.items.some((i) => i.label === 'bone dagger' && i.price === 5));
}

// Every wand/sword is recognized by its own category helper.
for (const w of WANDS) check(`isWandItem("${w}")`, isWandItem(w));
for (const s of SWORDS) check(`isSwordItem("${s}")`, isSwordItem(s));
for (const w of WANDS) check(`isSwordItem("${w}") is false`, !isSwordItem(w));
for (const s of SWORDS) check(`isWandItem("${s}") is false`, !isWandItem(s));

// Every wand/sword occupies the weapon slot.
for (const item of [...WANDS, ...SWORDS]) check(`"${item}" is a weapon-slot item`, EQUIPMENT_SLOT_FOR_ITEM[item] === 'weapon');

// Each wand/sword grants +1 to its OWN named stat.
const statChecks = [
  { stat: 'strength', fn: strengthEquipmentBonus, wand: 'wand of strength', sword: 'sword of strength' },
  { stat: 'wisdom', fn: wisdomEquipmentBonus, wand: 'wand of wisdom', sword: 'sword of wisdom' },
  { stat: 'luck', fn: luckEquipmentBonus, wand: 'wand of luck', sword: 'sword of luck' },
  { stat: 'dexterity', fn: dexterityEquipmentBonus, wand: 'wand of dexterity', sword: 'sword of dexterity' },
  { stat: 'intelligence', fn: intelligenceEquipmentBonus, wand: 'wand of intelligence', sword: 'sword of intelligence' },
  { stat: 'constitution', fn: constitutionEquipmentBonus, wand: 'wand of constitution', sword: 'sword of constitution' },
];
for (const { stat, fn, wand, sword } of statChecks) {
  check(`${wand} grants +1 ${stat}`, fn({ weapon: wand }) === 1, `got ${fn({ weapon: wand })}`);
  check(`${sword} grants +1 ${stat}`, fn({ weapon: sword }) === 1, `got ${fn({ weapon: sword })}`);
}

// Every sword grants +2 physical damage (WEAPON_DAMAGE_BONUS, same table
// bone dagger's own +2 uses).
for (const s of SWORDS) check(`${s} grants +2 physical damage (WEAPON_DAMAGE_BONUS)`, WEAPON_DAMAGE_BONUS[s] === 2, `got ${WEAPON_DAMAGE_BONUS[s]}`);

// Every wand grants +1 ranged magic basic damage, uniformly across old
// AND new wand items alike (wandRangedDamageBonus checks the CATEGORY,
// not a per-item lookup).
for (const w of [...WANDS, 'wand of quickness', 'wand of frost']) {
  check(`${w} grants +1 ranged magic basic damage`, wandRangedDamageBonus({ weapon: w }) === 1, `got ${wandRangedDamageBonus({ weapon: w })}`);
}
check('a sword grants NO ranged magic basic damage bonus', wandRangedDamageBonus({ weapon: 'sword of strength' }) === 0);
check('a sword grants NO stat bonus for a DIFFERENT stat', strengthEquipmentBonus({ weapon: 'sword of luck' }) === 0);

process.exit(failures > 0 ? 1 : 0);
