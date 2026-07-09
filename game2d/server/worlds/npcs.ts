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
];
