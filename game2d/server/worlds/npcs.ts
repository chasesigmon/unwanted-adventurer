import type { NpcSnapshot } from '../../shared/types.js';

// Static map occupants — never move, never despawn. Just a test/dummy
// target for the punch interaction today; a real wandering NPC would need
// its own position-update loop, but that's not this project's scope yet.
export const NPCS: NpcSnapshot[] = [
  { id: 'training-dummy', race: 'skeleton', map: 'Great Plains', row: 10, col: 19 },
];
