import { Injectable } from '@nestjs/common';
import { resolveMove } from './resolveMove.js';
import { NPCS } from './npcs.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';
import type { MapName, Direction } from '../../shared/constants.js';
import type { PlayerSnapshot, MapStatePayload } from '../../shared/types.js';
import type { PlayerState, MoveResult } from './types.js';
import { isTreeTile } from '../../shared/trees.js';
import { emitsLight } from '../../shared/lighting.js';
import { vendorsForMap } from './vendors.js';
import { armorClassFor, armorEquipmentBonus } from '../combat/formulas.js';

// A much smaller version of the text game's own WorldManagerService — no
// per-map capacity sharding or worker_threads, just an in-memory map of
// username -> state (plus a fixed list of static NPCs and, via
// MonsterManagerService/CorpseManagerService, wild monsters and lootable
// corpses). This project doesn't have enough simultaneous traffic to need
// that yet; if it ever does, the text game's version
// (src/server/worlds/world-manager.service.ts) is the pattern to grow into.
@Injectable()
export class WorldManagerService {
  private playerLocation = new Map<string, PlayerState>();

  constructor(
    private readonly monsterManager: MonsterManagerService,
    private readonly corpseManager: CorpseManagerService
  ) {}

  addPlayer(username: string, state: PlayerState): void {
    this.playerLocation.set(username, { ...state });
  }

  removePlayer(username: string): void {
    this.playerLocation.delete(username);
  }

  getLocation(username: string): PlayerState | undefined {
    return this.playerLocation.get(username);
  }

  // Backs the "who"/"where" map-modal tabs — every connected player's
  // username, current map, and level, regardless of who's asking.
  getAllPlayers(): Array<{ username: string; map: MapName; level: number }> {
    return [...this.playerLocation.entries()].map(([username, state]) => ({
      username,
      map: state.mapName,
      level: state.level,
    }));
  }

  // Applies a combat/leveling update (hp, level, exp-derived stat bumps,
  // skill growth, inventory, ...) to a connected player's cached state —
  // the gateway calls this right after resolving a punch/loot, before
  // persisting to Postgres.
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

  // True if a player (other than excludeUsername), an NPC, a monster, or a
  // vendor's own stall already occupies this tile — the basis of
  // "players and NPCs/monsters/vendors can't walk through each other".
  // Corpses are deliberately NOT occupancy-blocking — you can walk onto
  // (and loot) one.
  private isOccupied(mapName: MapName, row: number, col: number, excludeUsername: string): boolean {
    if (isTreeTile(mapName, row, col)) return true;

    const npcHit = NPCS.some((npc) => npc.map === mapName && npc.row === row && npc.col === col);
    if (npcHit) return true;

    if (this.monsterManager.isOccupied(mapName, row, col)) return true;

    // A vendor blocks both its own tile and the shopfront tile directly
    // in front of it (one row south — see main.ts's rendering of that
    // same offset), even though the shopfront isn't a separate entity of
    // its own server-side.
    const vendorHit = vendorsForMap(mapName).some((v) => (v.row === row && v.col === col) || (v.row + 1 === row && v.col === col));
    if (vendorHit) return true;

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
        strength: state.strength,
        intelligence: state.intelligence,
        wisdom: state.wisdom,
        dexterity: state.dexterity,
        constitution: state.constitution,
        skills: state.skills,
        inventory: state.inventory,
        equipment: state.equipment,
        consumeExp: state.consumeExp,
        restState: state.restState,
        // Whether OTHER players standing next to this one benefit from
        // their light — a carried torch only, not infravision (see
        // shared/lighting.ts's emitsLight).
        hasLight: emitsLight(state.equipment),
        gold: state.gold,
        mimicableRaces: state.mimicableRaces,
        mimicForm: state.mimicForm,
        eatBrainsReadyAtTick: state.eatBrainsReadyAtTick,
        skillCooldowns: state.skillCooldowns,
        armorClass: armorClassFor(state.dexterity, armorEquipmentBonus(state.equipment)),
        deathCount: state.deathCount,
      });
    }

    const npcs = NPCS.filter((npc) => npc.map === mapName);
    const monsters = this.monsterManager.getSnapshotsForMap(mapName);
    const corpses = this.corpseManager.getSnapshotsForMap(mapName);
    const vendors = vendorsForMap(mapName);
    return { mapName, players, npcs, monsters, corpses, vendors };
  }
}
