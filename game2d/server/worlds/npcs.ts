import type { NpcSnapshot } from '../../shared/types.js';
import { STARTING_LEVEL, STARTING_VITAL } from '../combat/formulas.js';

// Static map occupants — never move, never permanently despawn. A real
// wandering NPC would need its own position-update loop, but that's not
// this project's scope yet. The original Great Plains training dummy (a
// real, non-immortal combat target with the same starting stats as a
// brand-new player) was removed outright (a later follow-up ask); the
// Entrance Hall's own immortal training skeletons below are the only
// NPCS entries left.
export const NPCS: NpcSnapshot[] = [
  // 3 practice training skeletons (a follow-up ask renamed these from
  // "scarecrow") — immortal (see resolveHitOnNpc's own immortal branch:
  // resets to full hp in place, never counter-attacks, no corpse), so a
  // player can freely practice offense spells (augue, ...) on something
  // that won't fight back or "run out." Standing in the Entrance Hall,
  // in the same column as its two EAST fireplaces (col 38 — see
  // fireplacePositionsFor's own entrance-hall cols), centered between
  // their rows (8 and rows-9=25 at the Entrance Hall's current 34-row
  // size, midpoint 16.5) — "in the middle between the two fireplaces on
  // the right." A later follow-up ask ("shift the training skeletons up
  // slightly, they are not directly in the middle") nudged this set from
  // [14, 18, 22] (centered on 18) to [12, 16, 20] (centered on 16, much
  // closer to the true 16.5 midpoint).
  ...[12, 16, 20].map((row, i) => ({
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
    // A wooden club (a follow-up ask: "give the training skeletons a
    // wooden club sprite as a weapon... so players can practice exarme")
    // — exarme can strip it (see game.gateway.ts's handleCastExarme); the
    // immortal-respawn branch of resolveHitOnNpc re-equips it the next
    // time this skeleton is "killed."
    carriedItems: ['wooden club'],
  })),
];
