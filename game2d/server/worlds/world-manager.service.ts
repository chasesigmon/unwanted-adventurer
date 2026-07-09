import { Injectable } from '@nestjs/common';
import { resolveMove } from './resolveMove.js';
import { NPCS } from './npcs.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import type { MapName, Direction } from '../../shared/constants.js';
import type { PlayerSnapshot, MapStatePayload } from '../../shared/types.js';
import type { PlayerState, MoveResult } from './types.js';

// A much smaller version of the text game's own WorldManagerService — no
// per-map capacity sharding or worker_threads, just an in-memory map of
// username -> state (plus a fixed list of static NPCs and, via
// MonsterManagerService, wild monsters). This project doesn't have enough
// simultaneous traffic to need that yet; if it ever does, the text game's
// version (src/server/worlds/world-manager.service.ts) is the pattern to
// grow into.
@Injectable()
export class WorldManagerService {
  private playerLocation = new Map<string, PlayerState>();

  constructor(private readonly monsterManager: MonsterManagerService) {}

  addPlayer(username: string, state: PlayerState): void {
    this.playerLocation.set(username, { ...state });
  }

  removePlayer(username: string): void {
    this.playerLocation.delete(username);
  }

  getLocation(username: string): PlayerState | undefined {
    return this.playerLocation.get(username);
  }

  // Applies a combat/leveling update (hp, level, exp-derived stat bumps,
  // skill growth, ...) to a connected player's cached state — the gateway
  // calls this right after resolving a punch, before persisting to Postgres.
  updateState(username: string, updates: Partial<PlayerState>): void {
    const state = this.playerLocation.get(username);
    if (!state) return;
    Object.assign(state, updates);
  }

  // Used by MonsterManagerService (via a callback, see GameGateway's
  // wiring) so wandering/spawning monsters avoid tiles a player is
  // standing on, without a circular dependency between the two services.
  isPlayerAt(mapName: MapName, row: number, col: number): boolean {
    for (const state of this.playerLocation.values()) {
      if (state.mapName === mapName && state.row === row && state.col === col) return true;
    }
    return false;
  }

  // True if a player (other than excludeUsername), an NPC, or a monster
  // already occupies this tile — the basis of "players and NPCs/monsters
  // can't walk through each other".
  private isOccupied(mapName: MapName, row: number, col: number, excludeUsername: string): boolean {
    const npcHit = NPCS.some((npc) => npc.map === mapName && npc.row === row && npc.col === col);
    if (npcHit) return true;

    if (this.monsterManager.isOccupied(mapName, row, col)) return true;

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

  // Contact lookup for the punch/combat system: is there another
  // connected player standing exactly at this tile? Returns their
  // username, if so (excluding the asker themselves).
  findPlayerAt(mapName: MapName, row: number, col: number, excludeUsername: string): string | undefined {
    for (const [username, state] of this.playerLocation) {
      if (username === excludeUsername) continue;
      if (state.mapName === mapName && state.row === row && state.col === col) return username;
    }
    return undefined;
  }

  getMapState(mapName: MapName): MapStatePayload {
    const players: PlayerSnapshot[] = [];
    for (const [username, state] of this.playerLocation) {
      if (state.mapName !== mapName) continue;
      players.push({
        username,
        race: state.race,
        map: state.mapName,
        row: state.row,
        col: state.col,
        level: state.level,
        exp: state.exp,
        hp: state.hp,
        maxHp: state.maxHp,
        mana: state.mana,
        maxMana: state.maxMana,
        movement: state.movement,
        maxMovement: state.maxMovement,
      });
    }

    const npcs = NPCS.filter((npc) => npc.map === mapName);
    const monsters = this.monsterManager.getSnapshotsForMap(mapName);
    return { players, npcs, monsters };
  }
}
