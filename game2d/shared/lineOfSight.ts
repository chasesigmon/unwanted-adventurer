// A later follow-up ask: "the orcs in the labyrinth should be
// aggressive... you should not be able to attack them through a wall,
// the player should have to have line of sight" + "players shouldn't be
// able to attack monsters or players through collision/walls" — a shared,
// map-agnostic line-of-sight check reused by every ranged-attack handler
// in game.gateway.ts (see hasLineOfSight's own callers there).
//
// This is a leaf module: it imports FROM maps.ts/trees.ts/labyrinthMaze.ts
// (all one-directional, no cycle) rather than being imported BY any of
// them.
import type { MapName } from './constants.js';
import { isCastleExteriorBlocked, isMoatBlocked, isShopBuildingBlocked } from './maps.js';
import { isTreeTile } from './trees.js';
import { isLabyrinthWallTile } from './labyrinthMaze.js';

// Only the STATIC/structural obstacles that already block ordinary
// movement (see world-manager.service.ts's own isOccupied, which this
// deliberately does NOT reuse wholesale) — a tree, a castle wall, a shop
// building, the moat, or a labyrinth maze wall. Dynamic occupants
// (another player standing in the way, a vendor, a chest, ...) are NOT
// checked here: a real wall blocks sight, a person standing between you
// and your target doesn't the way this game is meant to play.
function blocksLineOfSight(mapName: MapName, row: number, col: number): boolean {
  return (
    isTreeTile(mapName, row, col) ||
    isCastleExteriorBlocked(mapName, row, col) ||
    isShopBuildingBlocked(mapName, row, col) ||
    isMoatBlocked(mapName, row, col) ||
    isLabyrinthWallTile(mapName, row, col)
  );
}

// A simple grid line-walk (samples `steps` evenly-spaced interpolated
// points between the two tiles, steps = the longer of the row/col delta)
// rather than a strict Bresenham — plenty accurate for a tile-based game
// at the short ranges every spell in this project actually reaches, and
// far simpler to reason about. The two endpoints themselves are never
// checked (an attacker's own tile and the target's own tile are never
// "in the way" of themselves) — adjacent tiles (steps <= 1) always have
// line of sight, since nothing can sit between them.
export function hasLineOfSight(mapName: MapName, fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const dRow = toRow - fromRow;
  const dCol = toCol - fromCol;
  const steps = Math.max(Math.abs(dRow), Math.abs(dCol));
  if (steps <= 1) return true;
  for (let i = 1; i < steps; i++) {
    const row = Math.round(fromRow + (dRow * i) / steps);
    const col = Math.round(fromCol + (dCol * i) / steps);
    if (blocksLineOfSight(mapName, row, col)) return false;
  }
  return true;
}
