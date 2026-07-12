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
  // 3 practice scarecrows (a follow-up ask) — immortal (see
  // resolveHitOnNpc's own immortal branch: resets to full hp in place,
  // never counter-attacks, no corpse), so a player can freely practice
  // offense spells (augue, ...) on something that won't fight back or
  // "run out." Standing in the Entrance Hall, to the right of its social
  // benches (centered at col 26) and left of the east fireplace
  // (col 38) — a clear stretch of open floor between the two.
  ...[14, 18, 22].map((row, i) => ({
    id: `entrance-hall-scarecrow-${i + 1}`,
    race: 'skeleton' as const,
    map: 'Grimoak Entrance Hall' as const,
    row,
    col: 34,
    level: STARTING_LEVEL,
    hp: STARTING_VITAL,
    maxHp: STARTING_VITAL,
    immortal: true,
    label: 'scarecrow',
  })),
];
