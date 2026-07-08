import { Injectable } from '@nestjs/common';
import { resolveMove } from './resolveMove.js';
import type { MapName, Direction } from '../../shared/constants.js';
import type { Location, MoveResult } from './types.js';

// A much smaller version of the text game's own WorldManagerService — no
// per-map capacity sharding or worker_threads, just an in-memory map of
// username -> position. This project doesn't have enough simultaneous
// traffic to need that yet; if it ever does, the text game's version
// (src/server/worlds/world-manager.service.ts) is the pattern to grow into.
@Injectable()
export class WorldManagerService {
  private playerLocation = new Map<string, Location>();

  addPlayer(username: string, mapName: MapName, row: number, col: number): void {
    this.playerLocation.set(username, { mapName, row, col });
  }

  removePlayer(username: string): void {
    this.playerLocation.delete(username);
  }

  getLocation(username: string): Location | undefined {
    return this.playerLocation.get(username);
  }

  processMove(username: string, direction: Direction): MoveResult | null {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;

    const result = resolveMove(loc, direction);
    if (result.ok) {
      loc.mapName = result.mapName;
      loc.row = result.row;
      loc.col = result.col;
    }
    return result;
  }
}
