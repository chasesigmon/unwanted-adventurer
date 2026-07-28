// The first-person raycaster's own "what counts as a wall, and what kind"
// oracle (a big new ask: a real Wolfenstein/DOOM-style raycasting mode,
// see WorldScene.ts's own first-person render pass). This is deliberately
// the SAME set of static/structural obstacles shared/lineOfSight.ts's own
// blocksLineOfSight already used (see that function, now just a thin
// wrapper around this one) — a monster/player standing in the way, a
// vendor, a chest, etc. are dynamic occupants and are never "walls" here,
// they're billboards instead. Kept in its own file rather than folded
// into lineOfSight.ts since "what does this look like when hit" (a color/
// texture choice) is a rendering concern lineOfSight.ts's own line-of-sight
// job never needed.
import type { MapName } from './constants.js';
import { isCastleExteriorBlocked, isMoatBlocked, isShopBuildingBlocked } from './maps.js';
import { isTreeTile } from './trees.js';
import { isLabyrinthWallTile } from './labyrinthMaze.js';

export type WallHit =
  | { kind: 'none' }
  | { kind: 'tree' }
  | { kind: 'castleWall' }
  | { kind: 'shopWall' }
  | { kind: 'moat' }
  | { kind: 'labyrinth' };

// Order matches blocksLineOfSight's own original if-chain — a tile that
// happens to satisfy more than one of these (shouldn't normally happen
// given how each map's own static geometry is laid out) resolves to
// whichever check comes first here, same as it silently did before this
// was ever split out into a tagged result.
export function wallHitKindAt(mapName: MapName, row: number, col: number): WallHit {
  if (isTreeTile(mapName, row, col)) return { kind: 'tree' };
  if (isCastleExteriorBlocked(mapName, row, col)) return { kind: 'castleWall' };
  if (isShopBuildingBlocked(mapName, row, col)) return { kind: 'shopWall' };
  if (isMoatBlocked(mapName, row, col)) return { kind: 'moat' };
  if (isLabyrinthWallTile(mapName, row, col)) return { kind: 'labyrinth' };
  return { kind: 'none' };
}
