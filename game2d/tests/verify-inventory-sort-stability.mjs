// Item 7: "organize items alphabetically; selling an item with multiples
// should keep its position stable instead of jumping around." Confirms
// via shared/items.ts's own groupInventoryItems (imported directly, no
// browser needed) that: (a) an interleaved, non-alphabetical inventory
// groups into alphabetical order, and (b) removing the FRONT-most copy of
// an interleaved stack (the old bug trigger — see the prior research
// pass's own [A,B,A2,C] example) does not change any OTHER stack's
// position, since order now derives purely from label text.
import { groupInventoryItems } from '../shared/items.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// Interleaved: torch(0), sword(1), torch(2), chestplate(3), sword(4), canteen(5).
const before = ['torch', 'sword', 'torch', 'chestplate', 'sword', 'canteen'];
const groupsBefore = groupInventoryItems(before);
const labelsBefore = groupsBefore.map(([label]) => label);
check('initial grouping is alphabetical', JSON.stringify(labelsBefore) === JSON.stringify(['canteen', 'chestplate', 'sword', 'torch']), JSON.stringify(labelsBefore));

// Sell the FRONT-most torch (index 0) -- the exact scenario the old bug
// hit (removing a stack's earliest index could promote some other item
// ahead of it under first-occurrence ordering).
const afterSellFrontTorch = before.filter((_, i) => i !== 0);
const groupsAfter = groupInventoryItems(afterSellFrontTorch);
const labelsAfter = groupsAfter.map(([label]) => label);
check(
  'label order unchanged after selling the front-most copy of a stack',
  JSON.stringify(labelsAfter) === JSON.stringify(['canteen', 'chestplate', 'sword', 'torch']),
  JSON.stringify(labelsAfter)
);
const torchCountAfter = groupsAfter.find(([label]) => label === 'torch')?.[1].length;
check('torch stack count dropped from 2 to 1', torchCountAfter === 1, `count=${torchCountAfter}`);

process.exit(failures > 0 ? 1 : 0);
