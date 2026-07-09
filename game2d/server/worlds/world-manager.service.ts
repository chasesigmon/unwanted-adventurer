import { Injectable } from '@nestjs/common';
import { resolveMove } from './resolveMove.js';
import { NPCS } from './npcs.js';
import type { MapName, Direction, Race } from '../../shared/constants.js';
import type { PlayerSnapshot, MapStatePayload } from '../../shared/types.js';
import type { PlayerState, MoveResult } from './types.js';

// A much smaller version of the text game's own WorldManagerService — no
// per-map capacity sharding or worker_threads, just an in-memory map of
// username -> position (plus a fixed list of static NPCs). This project
// doesn't have enough simultaneous traffic to need that yet; if it ever
// does, the text game's version (src/server/worlds/world-manager.service.ts)
// is the pattern to grow into.
@Injectable()
export class WorldManagerService {
  private playerLocation = new Map<string, PlayerState>();

  addPlayer(username: string, race: Race, mapName: MapName, row: number, col: number): void {
    this.playerLocation.set(username, { race, mapName, row, col });
  }

  removePlayer(username: string): void {
    this.playerLocation.delete(username);
  }

  getLocation(username: string): PlayerState | undefined {
    return this.playerLocation.get(username);
  }

  // True if a player (other than excludeUsername) or an NPC already
  // occupies this tile — the basis of "players and NPCs can't walk
  // through each other".
  private isOccupied(mapName: MapName, row: number, col: number, excludeUsername: string): boolean {
    const npcHit = NPCS.some((npc) => npc.map === mapName && npc.row === row && npc.col === col);
    if (npcHit) return true;

    for (const [username, state] of this.playerLocation) {
      if (username === excludeUsername) continue;
      if (state.mapName === mapName && state.row === row && state.col === col) return true;
    }
    return false;
  }

  processMove(username: string, direction: Direction): MoveResult | null {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;

    const result = resolveMove(loc, direction);
    if (!result.ok) return result;

    if (this.isOccupied(result.mapName, result.row, result.col, username)) {
      return { ok: false, transitioned: false, mapName: loc.mapName, row: loc.row, col: loc.col };
    }

    loc.mapName = result.mapName;
    loc.row = result.row;
    loc.col = result.col;
    return result;
  }

  getMapState(mapName: MapName): MapStatePayload {
    const players: PlayerSnapshot[] = [];
    for (const [username, state] of this.playerLocation) {
      if (state.mapName !== mapName) continue;
      players.push({ username, race: state.race, map: state.mapName, row: state.row, col: state.col });
    }

    const npcs = NPCS.filter((npc) => npc.map === mapName);
    return { players, npcs };
  }
}
