import type { NpcSnapshot } from '../../shared/types.js';
import { STARTING_LEVEL, STARTING_VITAL } from '../combat/formulas.js';

// Static map occupants — never move, never permanently despawn. Just a
// test/dummy target for the punch/combat system today; a real wandering
// NPC would need its own position-update loop, but that's not this
// project's scope yet. Given the same starting stats as a brand-new
// player (see combat/formulas.ts) since it's a real combat target too —
// see game.gateway.ts's handling of targetKind 'npc', which respawns it
// at full hp immediately on "death" rather than removing it.
export const NPCS: NpcSnapshot[] = [
  {
    id: 'training-dummy',
    race: 'skeleton',
    map: 'Great Plains',
    row: 10,
    col: 19,
    level: STARTING_LEVEL,
    hp: STARTING_VITAL,
    maxHp: STARTING_VITAL,
  },
  // 3 practice training skeletons (a follow-up ask renamed these from
  // "scarecrow") — immortal (see resolveHitOnNpc's own immortal branch:
  // resets to full hp in place, never counter-attacks, no corpse), so a
  // player can freely practice offense spells (augue, ...) on something
  // that won't fight back or "run out." Standing in the Entrance Hall,
  // in the same column as its two EAST fireplaces (col 38 — see
  // fireplacePositionsFor's own entrance-hall cols), centered between
  // their rows (8 and rows-9=27, midpoint 17.5) — "in the middle between
  // the two fireplaces on the right."
  ...[14, 18, 22].map((row, i) => ({
    id: `entrance-hall-training-skeleton-${i + 1}`,
    race: 'skeleton' as const,
    map: 'Grimoak Entrance Hall' as const,
    row,
    col: 38,
    level: STARTING_LEVEL,
    hp: STARTING_VITAL,
    maxHp: STARTING_VITAL,
    immortal: true,
    label: 'training skeleton',
  })),
];
