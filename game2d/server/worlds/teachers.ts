import type { MapName } from '../../shared/constants.js';
import type { TeacherSnapshot } from '../../shared/types.js';
import {
  LEARN_SPELLS_QUEST_ID,
  KILL_IMPS_QUEST_ID,
  GATHER_MANA_CRYSTALS_QUEST_ID,
  FIND_THE_MAP_QUEST_ID,
  CHOOSE_HOUSE_QUEST_ID,
  CLASSROOM_SPELLS,
} from '../../shared/quests.js';
import {
  ANIMATE_DEAD_SKILL,
  RECALL_SKILL,
  BARRIER_SKILL,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  ELEMENTAL_BOLT_SKILLS,
  LESSER_HEAL_SKILL,
  ENHANCED_UNDEAD_DAMAGE_SKILL,
  LESSER_SELF_HEAL_SKILL,
  WISP_TRANSFORMATION_SKILL,
  TAME_BEAST_SKILL,
  TRANSFORM_SKILL,
  BATTLEMAGE_ENHANCED_ARMOR_SKILL,
  BATTLEMAGE_ENHANCED_DAMAGE_SKILL,
  KINETIC_STRIKE_SKILL,
  SAP_HEALTH_SKILL,
  MONSTER_SUMMONS_SKILL,
  SUMMON_DEMON_IMP_SKILL,
  ENHANCED_HOLY_DAMAGE_SKILL,
  INVISIBILITY_SKILL,
  CREATE_DUPLICATE_SKILL,
  FLIGHT_SKILL,
  IDENTIFY_SKILL,
} from '../../shared/skills.js';

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
    questIds: [LEARN_SPELLS_QUEST_ID],
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
    questIds: [KILL_IMPS_QUEST_ID],
    robeColorKey: 'crimson',
  },
  {
    id: 'mana-crystal-teacher',
    name: 'Professor Thistlewood',
    title: 'Quest Giver',
    map: 'Grimoak Entrance Hall',
    row: 8,
    col: 32,
    questIds: [GATHER_MANA_CRYSTALS_QUEST_ID],
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
    // A later follow-up ask gave her a 2nd quest ("choose a house") —
    // both offered at once from the start (a still-later follow-up ask:
    // "should be available at the same time... offer both options" —
    // see npcDialogueModal.ts's own multi-quest render), not one after
    // the other.
    questIds: [FIND_THE_MAP_QUEST_ID, CHOOSE_HOUSE_QUEST_ID],
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
  // A later follow-up ask removed the podium/spellbook system entirely —
  // each classroom teacher now offers their room's own spells directly
  // through the click-to-learn modal (teachesSkills), reusing the exact
  // same CLASSROOM_SPELLS grouping the Learn Spells quest's objectives
  // already relied on so the two can never drift apart.
  {
    id: 'defense-teacher',
    name: 'Professor Vantor',
    map: 'Defense Classroom',
    row: 2,
    col: 9,
    // Barrier (a later follow-up ask) is a level-10 spell added directly
    // here rather than into CLASSROOM_SPELLS — same "don't pollute the
    // Learn Spells quest" reasoning as recall's own addition above.
    teachesSkills: [...(CLASSROOM_SPELLS['Defense Classroom'] ?? []), BARRIER_SKILL],
    robeColorKey: 'steel',
  },
  {
    id: 'utilization-teacher',
    name: 'Professor Wren',
    map: 'Utility Classroom',
    row: 2,
    col: 9,
    // Recall (a later follow-up ask) is a level-15 spell added directly
    // here rather than into CLASSROOM_SPELLS — that map also drives the
    // Learn Spells quest's own objective list, and recall shouldn't
    // become a required objective for a starter-level quest. Flight (a
    // still-later follow-up ask, "available to every specialization at
    // level 25") sits here too for the same reason — it has no
    // specialization requirement of its own, so the Utility Classroom (no
    // specialization gate on the room itself either) is the natural home.
    teachesSkills: [...(CLASSROOM_SPELLS['Utility Classroom'] ?? []), RECALL_SKILL, FLIGHT_SKILL, IDENTIFY_SKILL],
    robeColorKey: 'olive',
  },
  { id: 'offense-teacher', name: 'Professor Kastellan', map: 'Offense Classroom', row: 2, col: 9, teachesSkills: CLASSROOM_SPELLS['Offense Classroom'], robeColorKey: 'maroon' },
  // The 10 specialization chambers (a later follow-up ask) — one teacher
  // each, same row/col as every other classroom teacher (their own
  // desk sits one tile south, per deskPositionFor's default). No special
  // click behavior yet (no questIds/specializationGate/houseChoiceGate) —
  // "mechanics for the specialization teachers will come later," so they
  // fall back to the same plain generic-tooltip click every classroom
  // teacher without one of those already gets.
  // A later follow-up ask gave the Necromancer specialist an actual
  // click behavior: offering "animate dead" through the same
  // click-to-learn modal every classroom teacher now uses (originally a
  // bespoke gold purchase, migrated onto teachesSkills/practice points by
  // a still-later follow-up ask) — the other 9 chamber teachers are still
  // plain tooltip-only for now.
  { id: 'necromancer-teacher', name: 'Professor Voss', map: 'Necromancer Chamber', row: 2, col: 9, teachesSkills: [ANIMATE_DEAD_SKILL], robeColorKey: 'slate' },
  // A later follow-up ask gave the Shaman specialist an actual click
  // behavior too: "enhance damage" through the same click-to-learn modal
  // (level 10, shaman-only — see SKILL_SPECIALIZATION_REQUIREMENT).
  { id: 'shaman-teacher', name: 'Professor Brann', map: 'Shaman Chamber', row: 2, col: 9, teachesSkills: [SHAMAN_ENHANCE_DAMAGE_SKILL], robeColorKey: 'olive' },
  // A later follow-up ask gave the Elementalist specialist actual click
  // behavior too: all 4 bolt spells (level 10, elementalist-only).
  { id: 'elementalist-teacher', name: 'Professor Tempest', map: 'Elementalist Chamber', row: 2, col: 9, teachesSkills: ELEMENTAL_BOLT_SKILLS, robeColorKey: 'teal' },
  // A later follow-up ask gave the Summoner specialist actual click
  // behavior too: monster summons (level 10, summoner-only).
  {
    id: 'summoner-teacher',
    name: 'Professor Corvin',
    map: 'Summoner Chamber',
    row: 2,
    col: 9,
    teachesSkills: [MONSTER_SUMMONS_SKILL],
    robeColorKey: 'plum',
  },
  // A later follow-up ask gave the Illusionist specialist actual click
  // behavior too: invisibility + create duplicate (both level 10,
  // illusionist-only).
  {
    id: 'illusionist-teacher',
    name: 'Professor Mirelle',
    map: 'Illusionist Chamber',
    row: 2,
    col: 9,
    teachesSkills: [INVISIBILITY_SKILL, CREATE_DUPLICATE_SKILL],
    robeColorKey: 'violet',
  },
  // A later follow-up ask gave the Battlemage specialist actual click
  // behavior too: 2 passives + kinetic strike (all level 10,
  // battlemage-only).
  {
    id: 'battlemage-teacher',
    name: 'Professor Draven',
    map: 'Battlemage Chamber',
    row: 2,
    col: 9,
    teachesSkills: [BATTLEMAGE_ENHANCED_ARMOR_SKILL, BATTLEMAGE_ENHANCED_DAMAGE_SKILL, KINETIC_STRIKE_SKILL],
    robeColorKey: 'steel',
  },
  // A later follow-up ask gave the Cleric specialist actual click
  // behavior too: lesser heal + enhanced undead damage (both level 10,
  // cleric-only).
  {
    id: 'cleric-teacher',
    name: 'Professor Seraphine',
    map: 'Cleric Chamber',
    row: 2,
    col: 9,
    teachesSkills: [LESSER_HEAL_SKILL, ENHANCED_UNDEAD_DAMAGE_SKILL],
    robeColorKey: 'amber',
  },
  // A later follow-up ask gave the Druid specialist actual click
  // behavior too: lesser self heal + wisp transformation (both level 10,
  // druid-only). A still-later follow-up ask added Tame Beast, same tier.
  {
    id: 'druid-teacher',
    name: 'Professor Thornwood',
    map: 'Druid Chamber',
    row: 2,
    col: 9,
    teachesSkills: [LESSER_SELF_HEAL_SKILL, WISP_TRANSFORMATION_SKILL, TAME_BEAST_SKILL, TRANSFORM_SKILL],
    robeColorKey: 'forest',
  },
  // A later follow-up ask gave the Diabolist specialist actual click
  // behavior too: summon demon imp + enhanced holy damage (both level
  // 15, diabolist-only).
  {
    id: 'diabolist-teacher',
    name: 'Professor Malphas',
    map: 'Diabolist Chamber',
    row: 2,
    col: 9,
    teachesSkills: [SUMMON_DEMON_IMP_SKILL, ENHANCED_HOLY_DAMAGE_SKILL],
    robeColorKey: 'maroon',
  },
  // A later follow-up ask gave the Hemomancer specialist actual click
  // behavior too: sap health (level 10, hemomancer-only).
  {
    id: 'hemomancer-teacher',
    name: 'Professor Vex',
    map: 'Hemomancer Chamber',
    row: 2,
    col: 9,
    teachesSkills: [SAP_HEALTH_SKILL],
    robeColorKey: 'crimson',
  },
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
