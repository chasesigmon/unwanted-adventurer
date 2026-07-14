import type { MapName } from '../../shared/constants.js';
import type { TeacherSnapshot } from '../../shared/types.js';
import { LEARN_SPELLS_QUEST_ID, KILL_IMPS_QUEST_ID, GATHER_MANA_CRYSTALS_QUEST_ID, FIND_THE_MAP_QUEST_ID } from '../../shared/quests.js';
import { ANIMATE_DEAD_SKILL } from '../../shared/skills.js';

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
  {
    id: 'headmistress',
    name: 'Headmistress Elowen',
    title: 'Quest Giver',
    map: 'Grimoak Entrance Hall',
    row: 8,
    col: 26,
    questId: LEARN_SPELLS_QUEST_ID,
    robeColorKey: 'violet',
    longHair: true,
  },
  // Two more quest-givers flanking her (a later follow-up ask: "add
  // another teacher left of Elowen"/"right of Elowen"), same row, each
  // a comfortable 6 columns clear of both her own desk footprint and the
  // Entrance Hall's own fireplaces (cols 14/38) so none of the 3 desks
  // or the fireplace collision boxes ever touch.
  {
    id: 'imp-hunter-teacher',
    name: 'Professor Bramwell',
    title: 'Quest Giver',
    map: 'Grimoak Entrance Hall',
    row: 8,
    col: 20,
    questId: KILL_IMPS_QUEST_ID,
    robeColorKey: 'crimson',
  },
  {
    id: 'mana-crystal-teacher',
    name: 'Professor Thistlewood',
    title: 'Quest Giver',
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
  // teacher. Her DESK, however, stays south of her (a still-later
  // follow-up ask put it back) — only her own sprite faces east.
  {
    id: 'map-quest-teacher',
    name: 'Professor Hollowell',
    title: 'Quest Giver',
    map: 'Grimoak Entrance Hall',
    row: 16,
    col: 14,
    facing: 'right',
    questId: FIND_THE_MAP_QUEST_ID,
    robeColorKey: 'forest',
    longHair: true,
  },
  // The house-assignment teacher (a follow-up ask, since adjusted again)
  // — "south of the bench with about 5 feet of space between them."
  // The Entrance Hall's own south bench (see benchPositionsFor's
  // midRow+offset, offset now 3) sits at row 20, col ENTRANCE_MID_COL=25
  // — 5 tiles further south (row 25), same column, lands him directly
  // below it, facing 'down' (south, the default, omitted below) toward
  // the door to greet arriving students face-on.
  {
    id: 'house-teacher',
    name: 'Professor Caldwell',
    title: 'House Administrator',
    map: 'Grimoak Entrance Hall',
    row: 25,
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
  // The 10 specialization chambers (a later follow-up ask) — one teacher
  // each, same row/col as every other classroom teacher (their own
  // desk sits one tile south, per deskPositionFor's default). No special
  // click behavior yet (no questId/specializationGate/houseChoiceGate) —
  // "mechanics for the specialization teachers will come later," so they
  // fall back to the same plain generic-tooltip click every classroom
  // teacher without one of those already gets.
  // A later follow-up ask gave the Necromancer specialist an actual
  // click behavior: offering "animate dead" for one-time purchase (see
  // ANIMATE_DEAD_SKILL) — the other 9 chamber teachers are still plain
  // tooltip-only for now.
  { id: 'necromancer-teacher', name: 'Professor Voss', map: 'Necromancer Chamber', row: 2, col: 9, skillPurchaseGate: ANIMATE_DEAD_SKILL, robeColorKey: 'slate' },
  { id: 'enhancer-teacher', name: 'Professor Brann', map: 'Enhancer Chamber', row: 2, col: 9, robeColorKey: 'olive' },
  { id: 'elementalist-teacher', name: 'Professor Tempest', map: 'Elementalist Chamber', row: 2, col: 9, robeColorKey: 'teal' },
  { id: 'summoner-teacher', name: 'Professor Corvin', map: 'Summoner Chamber', row: 2, col: 9, robeColorKey: 'plum' },
  { id: 'illusionist-teacher', name: 'Professor Mirelle', map: 'Illusionist Chamber', row: 2, col: 9, robeColorKey: 'violet' },
  { id: 'battlemage-teacher', name: 'Professor Draven', map: 'Battlemage Chamber', row: 2, col: 9, robeColorKey: 'steel' },
  { id: 'cleric-teacher', name: 'Professor Seraphine', map: 'Cleric Chamber', row: 2, col: 9, robeColorKey: 'amber' },
  { id: 'druid-teacher', name: 'Professor Thornwood', map: 'Druid Chamber', row: 2, col: 9, robeColorKey: 'forest' },
  { id: 'diabolist-teacher', name: 'Professor Malphas', map: 'Diabolist Chamber', row: 2, col: 9, robeColorKey: 'maroon' },
  { id: 'hemomancer-teacher', name: 'Professor Vex', map: 'Hemomancer Chamber', row: 2, col: 9, robeColorKey: 'crimson' },
];

export function teachersForMap(mapName: MapName): TeacherSnapshot[] {
  return TEACHERS.filter((t) => t.map === mapName);
}

// The desk sits directly in front of (one tile south of) the teacher,
// regardless of which way their own sprite happens to face — a later
// follow-up ask made this facing-aware for Professor Hollowell
// specifically, then reverted it ("put Hollowell's desk back to where it
// was") since the rotated desk didn't read well, so this is back to the
// original fixed offset for every teacher again.
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
