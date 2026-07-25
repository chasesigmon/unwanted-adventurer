// Items 19/20: "the orcs in the labyrinth should be aggressive... you
// should not be able to attack them through a wall, the player should
// have to have line of sight without anything with collision blocking
// them" + "players shouldn't be able to attack monsters or players
// through collision/walls."
//
// A pure unit test of shared/lineOfSight.ts's hasLineOfSight, run via tsx
// so it can import the real TypeScript source directly (no server/DB
// needed) -- finds a REAL labyrinth wall tile programmatically (rather
// than hand-guessing maze geometry) and confirms line of sight is
// correctly blocked across it, clear on either side of it, and always
// true for adjacent tiles.
import { hasLineOfSight } from '../shared/lineOfSight.ts';
import { isLabyrinthWallTile } from '../shared/labyrinthMaze.ts';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// Find a wall tile with open floor directly on both sides (west/east) --
// a real "there's a wall between two standable spots" scenario, exactly
// the orc-behind-a-wall case described.
let found = null;
for (let row = 1; row < 59 && !found; row++) {
  for (let col = 1; col < 59; col++) {
    if (
      isLabyrinthWallTile('Labyrinth', row, col) &&
      !isLabyrinthWallTile('Labyrinth', row, col - 1) &&
      !isLabyrinthWallTile('Labyrinth', row, col + 1) &&
      !isLabyrinthWallTile('Labyrinth', row, col - 2) &&
      !isLabyrinthWallTile('Labyrinth', row, col + 2)
    ) {
      found = { row, col };
      break;
    }
  }
}
check('found a real labyrinth wall tile with clear open floor on both sides', found !== null, JSON.stringify(found));

if (found) {
  const { row, col } = found;
  console.log(`Using wall at (${row},${col}), open floor at col-2=(${row},${col - 2}) and col+2=(${row},${col + 2})`);
  check(
    'line of sight is BLOCKED across the wall (2 tiles apart, wall directly between)',
    !hasLineOfSight('Labyrinth', row, col - 2, row, col + 2),
    `from (${row},${col - 2}) to (${row},${col + 2})`
  );
  check(
    'line of sight is CLEAR on the same side, not crossing the wall (1 tile apart)',
    hasLineOfSight('Labyrinth', row, col - 2, row, col - 1),
    `from (${row},${col - 2}) to (${row},${col - 1})`
  );
  check('adjacent tiles always have line of sight, even the wall tile itself', hasLineOfSight('Labyrinth', row, col - 1, row, col), 'adjacent to wall tile');
}

// A plain open map with nothing in the way, far apart -- should always be clear.
check('a long clear line on an open map (Grimoak Grounds) has line of sight', hasLineOfSight('Grimoak Grounds', 10, 10, 10, 20), 'no obstacles expected here');

process.exit(failures > 0 ? 1 : 0);
