// A later follow-up ask: "make an update to battlemage enhanced armor &
// enhanced damage to offer appropriate numbers for the player level and
// intelligence and armor and dexterity and strength. Create a formula for
// these two." Both bonuses were a flat +5 forever regardless of anything
// about the character. This confirms battlemageEnhancedArmorBonusFor
// (level, strength, dexterity, armorVsPhysical) and
// battlemageEnhancedDamageBonusFor (level, intelligence, strength), both
// in shared/skills.ts, actually scale up with level/stats rather than
// staying flat, and land close to the old +5 at fresh level-1 stats so
// early-game Battlemages aren't suddenly nerfed or buffed.
import { battlemageEnhancedArmorBonusFor, battlemageEnhancedDamageBonusFor } from '../shared/skills.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// Fresh level-1 Battlemage, starting-range stats (7-13), no equipment —
// armorVsPhysicalFor(dex~10, str~10, 0) = 2 + 1 + 1 + 0 = 4.
const freshArmor = battlemageEnhancedArmorBonusFor(1, 10, 10, 4);
const freshDamage = battlemageEnhancedDamageBonusFor(1, 10, 10);
console.log('fresh level-1 armor bonus:', freshArmor, '| fresh level-1 damage bonus:', freshDamage);
check('a fresh level-1 Battlemage stays close to the old flat +5 (armor)', freshArmor >= 4 && freshArmor <= 6, `got ${freshArmor}`);
check('a fresh level-1 Battlemage stays close to the old flat +5 (damage)', freshDamage >= 4 && freshDamage <= 6, `got ${freshDamage}`);

// A high-level, fully-invested Battlemage should get a meaningfully bigger
// bonus than the fresh-level-1 case -- this is the actual bug being fixed
// (the bonus used to never change at all).
const veteranArmor = battlemageEnhancedArmorBonusFor(40, 25, 25, 16);
const veteranDamage = battlemageEnhancedDamageBonusFor(40, 25, 25);
console.log('level-40 fully-invested armor bonus:', veteranArmor, '| damage bonus:', veteranDamage);
check('a high-level, well-invested Battlemage gets a noticeably larger armor bonus than a fresh one', veteranArmor > freshArmor + 10, `fresh=${freshArmor} veteran=${veteranArmor}`);
check('a high-level, well-invested Battlemage gets a noticeably larger damage bonus than a fresh one', veteranDamage > freshDamage + 10, `fresh=${freshDamage} veteran=${veteranDamage}`);

// Each formula should respond to ITS OWN relevant stats -- armor should
// not change just from more intelligence-only input, and damage should
// respond to intelligence specifically (the "arcane" half of the kit).
const armorLowStr = battlemageEnhancedArmorBonusFor(20, 8, 8, 8);
const armorHighStr = battlemageEnhancedArmorBonusFor(20, 24, 24, 8);
check('enhanced armor grows with strength/dexterity specifically', armorHighStr > armorLowStr, `low=${armorLowStr} high=${armorHighStr}`);

const damageLowInt = battlemageEnhancedDamageBonusFor(20, 8, 8);
const damageHighInt = battlemageEnhancedDamageBonusFor(20, 24, 8);
check('enhanced damage grows with intelligence specifically', damageHighInt > damageLowInt, `low=${damageLowInt} high=${damageHighInt}`);

process.exit(failures > 0 ? 1 : 0);
