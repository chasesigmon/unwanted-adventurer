import type { MapName } from '../../shared/constants.js';
import type { TeacherSnapshot } from '../../shared/types.js';

// Static, permanent classroom occupants (a follow-up ask: "Add teacher
// NPCs to each classroom and they are behind a desk with collision for
// both") — one per classroom, standing near the front of the room with
// their desk one tile in front of (south of) them, same "own tile + one
// extra tile" collision shape vendors already use for their shopfront,
// except BOTH tiles block movement here (a vendor's shopfront is purely
// decorative). Never move, never despawn, not a combat target and not
// (yet) clickable — purely a placed NPC + furniture piece for now.
export const TEACHERS: TeacherSnapshot[] = [
  { id: 'elemental-casting-teacher', name: 'Professor Ashgrove', map: 'Elemental Casting', row: 2, col: 9 },
  { id: 'defense-teacher', name: 'Professor Vantor', map: 'Defense', row: 2, col: 9 },
  { id: 'summoning-teacher', name: 'Professor Nyx', map: 'Summoning', row: 2, col: 9 },
  { id: 'utilization-teacher', name: 'Professor Wren', map: 'Utilization', row: 2, col: 9 },
  { id: 'offense-teacher', name: 'Professor Kastellan', map: 'Offense', row: 2, col: 9 },
];

export function teachersForMap(mapName: MapName): TeacherSnapshot[] {
  return TEACHERS.filter((t) => t.map === mapName);
}

// The desk sits directly in front of (one tile south of) the teacher.
export function deskPositionFor(teacher: TeacherSnapshot): { row: number; col: number } {
  return { row: teacher.row + 1, col: teacher.col };
}
