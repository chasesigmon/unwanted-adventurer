import type { MapName } from '../../shared/constants.js';
import type { TeacherSnapshot } from '../../shared/types.js';
import { LEARN_SPELLS_QUEST_ID } from '../../shared/quests.js';

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
  // column between them, with no desk (hasDesk: false) since she's not a
  // classroom occupant. Offers the Learn Spells quest on click.
  { id: 'headmistress', name: 'Headmistress Elowen', map: 'Grimoak Entrance Hall', row: 8, col: 26, hasDesk: false, questId: LEARN_SPELLS_QUEST_ID },
  { id: 'elemental-casting-teacher', name: 'Professor Ashgrove', map: 'Elemental Casting Classroom', row: 2, col: 9 },
  { id: 'defense-teacher', name: 'Professor Vantor', map: 'Defense Classroom', row: 2, col: 9 },
  { id: 'summoning-teacher', name: 'Professor Nyx', map: 'Summoning Classroom', row: 2, col: 9 },
  { id: 'utilization-teacher', name: 'Professor Wren', map: 'Utility Classroom', row: 2, col: 9 },
  { id: 'offense-teacher', name: 'Professor Kastellan', map: 'Offense Classroom', row: 2, col: 9 },
];

export function teachersForMap(mapName: MapName): TeacherSnapshot[] {
  return TEACHERS.filter((t) => t.map === mapName);
}

// The desk sits directly in front of (one tile south of) the teacher.
export function deskPositionFor(teacher: TeacherSnapshot): { row: number; col: number } {
  return { row: teacher.row + 1, col: teacher.col };
}

// The desk sprite's own art is visually wider/taller than the single
// anchor tile deskPositionFor returns (a follow-up ask: "add collision
// for the ENTIRE teacher's desk... right now you can walk through it
// from the top or the sides") — a 3-wide, 2-tall footprint centered on
// and just above the anchor tile, matching the sprite's own real
// width/height at its render scale (see WorldScene's teacher-desk
// setOrigin(0.5, 0.85), which puts most of its height above the anchor).
export function teacherDeskFootprintFor(teacher: TeacherSnapshot): Array<{ row: number; col: number }> {
  if (teacher.hasDesk === false) return [];
  const anchor = deskPositionFor(teacher);
  const tiles: Array<{ row: number; col: number }> = [];
  for (const dRow of [-1, 0]) {
    for (const dCol of [-1, 0, 1]) {
      tiles.push({ row: anchor.row + dRow, col: anchor.col + dCol });
    }
  }
  return tiles;
}
