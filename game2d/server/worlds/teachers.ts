import type { MapName } from '../../shared/constants.js';
import type { TeacherSnapshot } from '../../shared/types.js';
import { deskOffsetForFacing } from '../../shared/types.js';
import { LEARN_SPELLS_QUEST_ID, KILL_IMPS_QUEST_ID, GATHER_MANA_CRYSTALS_QUEST_ID, FIND_THE_MAP_QUEST_ID } from '../../shared/quests.js';

// Static, permanent classroom occupants (a follow-up ask: "Add teacher
// NPCs to each classroom and they are behind a desk with collision for
// both") — one per classroom, standing near the front of the room with
// their desk one tile in front of (south of) them, same "own tile + one
// extra tile" collision shape vendors already use for their shopfront,
// except BOTH tiles block movement here (a vendor's shopfront is purely
// decorative). Never move, never despawn, not a combat target and not
// (yet) clickable — purely a placed NPC + furniture piece for now.
export const TEACHERS: TeacherSnapshot[] = [
  // The Headmistress (a follow-up ask) — "in the middle of the top 2
  // fireplaces," facing south. The Entrance Hall's own top fireplaces sit
  // at row 8, cols 14 and 38 (see shared/lighting.ts's
  // fireplacePositionsFor) — she stands at their shared row, the midpoint
  // column between them. A later follow-up ask gave her a desk after all
  // (hasDesk defaults to true when absent, same as every classroom
  // teacher). Offers the Learn Spells quest on click.
  { id: 'headmistress', name: 'Headmistress Elowen', map: 'Grimoak Entrance Hall', row: 8, col: 26, questId: LEARN_SPELLS_QUEST_ID, robeColorKey: 'violet' },
  // Two more quest-givers flanking her (a later follow-up ask: "add
  // another teacher left of Elowen"/"right of Elowen"), same row, each
  // a comfortable 6 columns clear of both her own desk footprint and the
  // Entrance Hall's own fireplaces (cols 14/38) so none of the 3 desks
  // or the fireplace collision boxes ever touch.
  {
    id: 'imp-hunter-teacher',
    name: 'Professor Bramwell',
    map: 'Grimoak Entrance Hall',
    row: 8,
    col: 20,
    questId: KILL_IMPS_QUEST_ID,
    robeColorKey: 'crimson',
  },
  {
    id: 'mana-crystal-teacher',
    name: 'Professor Thistlewood',
    map: 'Grimoak Entrance Hall',
    row: 8,
    col: 32,
    questId: GATHER_MANA_CRYSTALS_QUEST_ID,
    robeColorKey: 'teal',
  },
  // A 4th quest-giver (a later follow-up ask) — "in between the
  // fireplaces on the left, facing the center of the room." The
  // Entrance Hall's own LEFT fireplaces both sit at col 14 (rows 8 and
  // 25 — see fireplacePositionsFor), so "in between" them here means
  // row-wise, at their shared midpoint (16.5, rounded down to 16, same
  // rounding the training skeletons' own re-centering used) — facing
  // 'right' (east) toward the room's own center (a later follow-up ask:
  // toward the Entrance Hall's own benches specifically — see
  // benchPositionsFor's midRow/midCol diamond, which 'right' already
  // points roughly toward from here) rather than 'down' like every other
  // teacher. Her desk now follows that same facing (see
  // deskPositionFor/teacherDeskFootprintFor above) instead of always
  // sitting south of her.
  {
    id: 'map-quest-teacher',
    name: 'Professor Hollowell',
    map: 'Grimoak Entrance Hall',
    row: 16,
    col: 14,
    facing: 'right',
    questId: FIND_THE_MAP_QUEST_ID,
    robeColorKey: 'forest',
  },
  // The house-assignment teacher (a follow-up ask) — "15 feet in front
  // of [the] entrance hall door, facing south toward the door." The
  // Entrance Hall's own south door (back out to the grounds) sits at its
  // last row (ENTRANCE_ROWS - 1 = 33) and middle column (ENTRANCE_MID_COL
  // = 25 — both module-private in shared/maps.ts, recomputed here); 15
  // tiles in front of (north of, back into the room from) that door
  // lands at row 18, same column, facing 'down' (south) — the default,
  // so it's omitted below — to greet arriving students face-on.
  {
    id: 'house-teacher',
    name: 'Professor Caldwell',
    map: 'Grimoak Entrance Hall',
    row: 18,
    col: 25,
    houseChoiceGate: true,
    robeColorKey: 'slate',
  },
  // Still here, still Professor Ashgrove, same desk — only the room and
  // his own role changed (a later follow-up ask): "Specialization" isn't
  // a classroom teaching a spell anymore, so clicking him gates a
  // level-10 "choose your path as a mage" dialogue instead (no quest —
  // see WorldScene's own specializationGate branch).
  { id: 'elemental-casting-teacher', name: 'Professor Ashgrove', map: 'Specialization', row: 2, col: 9, specializationGate: true, robeColorKey: 'amber' },
  { id: 'defense-teacher', name: 'Professor Vantor', map: 'Defense Classroom', row: 2, col: 9, robeColorKey: 'steel' },
  { id: 'summoning-teacher', name: 'Professor Nyx', map: 'Summoning Classroom', row: 2, col: 9, robeColorKey: 'plum' },
  { id: 'utilization-teacher', name: 'Professor Wren', map: 'Utility Classroom', row: 2, col: 9, robeColorKey: 'olive' },
  { id: 'offense-teacher', name: 'Professor Kastellan', map: 'Offense Classroom', row: 2, col: 9, robeColorKey: 'maroon' },
];

export function teachersForMap(mapName: MapName): TeacherSnapshot[] {
  return TEACHERS.filter((t) => t.map === mapName);
}

// The desk sits directly in front of the teacher, in whichever direction
// they face (absent facing defaults to 'down' — one tile south — same as
// every pre-existing classroom teacher).
export function deskPositionFor(teacher: TeacherSnapshot): { row: number; col: number } {
  const { dRow, dCol } = deskOffsetForFacing(teacher.facing);
  return { row: teacher.row + dRow, col: teacher.col + dCol };
}

// The desk sprite's own art is visually wider/taller than the single
// anchor tile deskPositionFor returns (a follow-up ask: "add collision
// for the ENTIRE teacher's desk... right now you can walk through it
// from the top or the sides") — a 3-wide, 2-tall footprint centered on
// and just in front of (between the anchor and the teacher) the anchor
// tile, matching the sprite's own real width/height at its render scale
// (see WorldScene's teacher-desk setOrigin(0.5, 0.85), which puts most
// of its height on the side facing the teacher). Rotated 90 degrees for
// an east/west-facing teacher (a later follow-up ask's Professor
// Hollowell, facing the Entrance Hall's own benches) so the "wide" axis
// stays perpendicular to the direction the desk actually sits in.
export function teacherDeskFootprintFor(teacher: TeacherSnapshot): Array<{ row: number; col: number }> {
  if (teacher.hasDesk === false) return [];
  const anchor = deskPositionFor(teacher);
  const facing = teacher.facing ?? 'down';
  const tiles: Array<{ row: number; col: number }> = [];
  if (facing === 'left' || facing === 'right') {
    const backCol = facing === 'right' ? -1 : 1; // one step back, toward the teacher
    for (const dCol of [backCol, 0]) {
      for (const dRow of [-1, 0, 1]) {
        tiles.push({ row: anchor.row + dRow, col: anchor.col + dCol });
      }
    }
  } else {
    const backRow = facing === 'down' ? -1 : 1; // one step back, toward the teacher
    for (const dRow of [backRow, 0]) {
      for (const dCol of [-1, 0, 1]) {
        tiles.push({ row: anchor.row + dRow, col: anchor.col + dCol });
      }
    }
  }
  return tiles;
}
