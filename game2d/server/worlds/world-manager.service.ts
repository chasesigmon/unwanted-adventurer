import { Injectable } from '@nestjs/common';
import { resolveMove, resolveDiagonalMove } from './resolveMove.js';
import { NPCS } from './npcs.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { CorpseManagerService } from './corpse-manager.service.js';
import type { MapName, Direction } from '../../shared/constants.js';
import type { PlayerSnapshot, MapStatePayload } from '../../shared/types.js';
import type { PlayerState, MoveResult } from './types.js';
import { isTreeTile } from '../../shared/trees.js';
import { isLabyrinthWallTile } from '../../shared/labyrinthMaze.js';
import {
  emitsLight,
  isFireplaceBlocked,
  isBenchBlocked,
  isBedBlocked,
  studentDeskPositionsFor,
  isGreatHallTableBlocked,
  isGreatHallChairBlocked,
  isBramwickSignBlocked,
  isStandingTorchBlocked,
} from '../../shared/lighting.js';
import {
  getMap,
  isCastleExteriorBlocked,
  isWaterBlocked,
  isRunestoneWayOffRoadBlocked,
  isRunestoneCanyonBoulderBlocked,
  isGateTile,
  GATE_COL_LEFT,
  GATE_COL_RIGHT,
  GATE_REACH_TILES,
  isStairsSideBlocked,
  isShopBuildingBlocked,
} from '../../shared/maps.js';
import { vendorsForMap, vendorCounterFootprintFor } from './vendors.js';
import { teachersForMap, teacherDeskFootprintFor } from './teachers.js';
import { isChestBlocked } from '../../shared/spells.js';
import {
  armorVsPhysicalFor,
  armorVsMagicalFor,
  physicalArmorEquipmentBonus,
  magicalArmorEquipmentBonus,
  dexterityEquipmentBonus,
  intelligenceEquipmentBonus,
} from '../combat/formulas.js';

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

  // Phase E's own "portal monster aggro radius" ask — every connected
  // player currently on the given map, with position, so a proximity-
  // aggro check can scan all of them without needing one lookup per
  // username (see MonsterManagerService's own setPlayersOnMapLocator).
  getPlayersOnMap(mapName: MapName): Array<{ username: string; row: number; col: number }> {
    const result: Array<{ username: string; row: number; col: number }> = [];
    for (const [username, state] of this.playerLocation) {
      if (state.mapName === mapName) result.push({ username, row: state.row, col: state.col });
    }
    return result;
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

  // "It should open magically with each gate parting to allow the player
  // through, both coming in or going out" — a pure function of who's
  // currently standing nearby (recomputed fresh on every occupancy check,
  // not a stored toggle-and-tick state), so it opens for whoever's
  // actually approaching from either side and closes again the instant
  // everyone's moved away. Monsters never factor in here at all — see
  // MonsterManagerService.isFree's own unconditional gate check, which
  // never consults this.
  // `gateRow` (a later follow-up ask: "the same bridge and gate
  // mechanism going north") lets this same check serve either gate
  // independently — a player standing at the south gate no longer also
  // swings the north one open, since isGateTile passes through whichever
  // specific gate row it just matched (GATE_ROW or NORTH_GATE_ROW).
  isGateOpen(mapName: MapName, gateRow: number): boolean {
    if (mapName !== 'Grimoak Grounds') return true;
    for (const state of this.playerLocation.values()) {
      if (state.mapName !== mapName) continue;
      if (
        Math.abs(state.row - gateRow) <= GATE_REACH_TILES &&
        state.col >= GATE_COL_LEFT - GATE_REACH_TILES &&
        state.col <= GATE_COL_RIGHT + GATE_REACH_TILES
      ) {
        return true;
      }
    }
    return false;
  }

  // True if a player (other than excludeUsername), an NPC, a monster, or a
  // vendor's own stall already occupies this tile — the basis of
  // "players and NPCs/monsters/vendors can't walk through each other".
  // Corpses are deliberately NOT occupancy-blocking — you can walk onto
  // (and loot) one.
  // `flying` (a later follow-up ask: "flight should allow players to fly
  // over bodies of water like the moat") — the ONE collision check flight
  // bypasses; every other obstacle (trees, buildings, gates, furniture,
  // other entities) still blocks a flying player exactly the same as a
  // walking one.
  private isOccupied(mapName: MapName, row: number, col: number, excludeUsername: string, flying = false): boolean {
    if (isTreeTile(mapName, row, col)) return true;
    // The Labyrinth's own maze walls (a later follow-up ask) — solid
    // stone, same "never bypassed by flying" treatment isRunestoneWayOffRoadBlocked
    // already gives every other permanent obstacle.
    if (isLabyrinthWallTile(mapName, row, col)) return true;
    if (isCastleExteriorBlocked(mapName, row, col)) return true;
    // Runestone Way's own boulder-walled off-road terrain (a later
    // follow-up ask) — solid rock, never bypassed by flying, same
    // treatment as every other permanent obstacle above.
    if (isRunestoneWayOffRoadBlocked(mapName, row, col)) return true;
    // A later follow-up ask: "make it so that the boulders/rocks on the
    // left and right of the stairs can't be walked on" — same solid-rock,
    // never-bypassed-by-flying treatment as Runestone Way's own boulders.
    if (isRunestoneCanyonBoulderBlocked(mapName, row, col)) return true;
    // `flying` doubles as "can cross water at all" (a later follow-up ask
    // added boats — see game.gateway.ts's handleMove, which also passes
    // true here while the mover simply OWNS a canoe/raft, not just while
    // actually airborne) — isWaterBlocked covers every body of water in
    // the game (the moat, plus Kortho's own new sea), not just the moat.
    if (!flying && isWaterBlocked(mapName, row, col)) return true;
    if (isGateTile(mapName, row, col) && !this.isGateOpen(mapName, row)) return true;
    if (isFireplaceBlocked(mapName, row, col)) return true;
    if (isBenchBlocked(mapName, row, col)) return true;
    if (isBedBlocked(mapName, row, col)) return true;
    if (studentDeskPositionsFor(mapName).some((p) => p.row === row && p.col === col)) return true;
    if (isGreatHallTableBlocked(mapName, row, col)) return true;
    if (isGreatHallChairBlocked(mapName, row, col)) return true;
    // Portals used to be purely decorative (solid, no real exit) — a
    // later follow-up ask gave each one a real MapExit (see shared/maps.ts's
    // portalDungeonDefinition/FLOOR4_LANDING.exits), which a player has to
    // physically stand ON to then step further and trigger (same "the
    // exit tile itself" shape every door/stairs in this game already
    // uses). Blocking that same tile here made every portal permanently
    // unreachable — a still-later follow-up ask ("I still am not able to
    // go through the Portals") removed this for players; monsters still
    // can't use them at all (see MonsterManagerService.isFree, which kept
    // its own isPortalBlocked check).
    if (isBramwickSignBlocked(mapName, row, col)) return true;
    if (isStandingTorchBlocked(mapName, row, col)) return true;
    if (isStairsSideBlocked(mapName, row, col)) return true;
    if (isShopBuildingBlocked(mapName, row, col)) return true;

    const npcHit = NPCS.some((npc) => npc.map === mapName && npc.row === row && npc.col === col);
    if (npcHit) return true;

    if (this.monsterManager.isOccupied(mapName, row, col)) return true;

    // A vendor blocks both its own tile and its counter/shopfront's ENTIRE
    // footprint (a later follow-up ask fixed this the same way
    // teacherDeskFootprintFor already fixed teacher desks below — see
    // vendorCounterFootprintFor, wider but shallower for Floro/Kortho's
    // own dedicated counter art, unchanged single-tile for Bramwick's
    // shopfront).
    const vendorHit = vendorsForMap(mapName).some(
      (v) => (v.row === row && v.col === col) || vendorCounterFootprintFor(v).some((d) => d.row === row && d.col === col)
    );
    if (vendorHit) return true;

    // A teacher blocks its own tile AND its desk's ENTIRE footprint
    // (a follow-up ask fixed the desk's own collision, which used to
    // only cover its single anchor tile even though the sprite itself is
    // visibly wider/taller — see teacherDeskFootprintFor) — unlike a
    // vendor's purely decorative shopfront.
    const teacherHit = teachersForMap(mapName).some(
      (t) => (t.row === row && t.col === col) || teacherDeskFootprintFor(t).some((d) => d.row === row && d.col === col)
    );
    if (teacherHit) return true;

    if (isChestBlocked(mapName, row, col)) return true;

    for (const [username, state] of this.playerLocation) {
      if (username === excludeUsername) continue;
      if (state.mapName === mapName && state.row === row && state.col === col) return true;
    }
    return false;
  }

  processMove(username: string, direction: Direction, flying = false): MoveResult | null {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;

    const result = resolveMove(loc, direction);
    if (!result.ok) return result;

    if (this.isOccupied(result.mapName, result.row, result.col, username, flying)) {
      return { ok: false, transitioned: false, mapName: loc.mapName, row: loc.row, col: loc.col };
    }

    loc.mapName = result.mapName;
    loc.row = result.row;
    loc.col = result.col;
    return result;
  }

  // Item 1: "move diagonally, e.g. W+A to go northwest" — a deliberately
  // separate path from processMove/resolveMove above rather than
  // widening Direction itself to 8 values (which every OTHER exhaustive
  // switch/Record<Direction, ...> in this codebase — sprite facing,
  // monster wander, door/exit definitions — would then need new cases
  // for, for a purely player-input convenience feature). A diagonal step
  // DOES check for a map exit now (a later follow-up ask: "trying to go
  // diagonally through a door/entrance says 'You can't go that way'" —
  // see resolveDiagonalMove's own doc comment), same shape as processMove
  // above.
  processDiagonalMove(username: string, dRow: -1 | 1, dCol: -1 | 1, flying = false): MoveResult | null {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;

    const result = resolveDiagonalMove(loc, dRow, dCol);
    if (!result.ok) return result;

    if (this.isOccupied(result.mapName, result.row, result.col, username, flying)) {
      return { ok: false, transitioned: false, mapName: loc.mapName, row: loc.row, col: loc.col };
    }

    loc.mapName = result.mapName;
    loc.row = result.row;
    loc.col = result.col;
    return result;
  }

  // The flight spell's own spacebar burst (a later follow-up ask) — same
  // flying-bypasses-water rule as processMove above, but exposed publicly
  // since the burst isn't a single-tile directional move (see
  // game.gateway.ts's handleFlightBurst, which steps this up to
  // FLIGHT_BURST_TILES times itself and needs its own per-tile check).
  canFlyOnto(mapName: MapName, row: number, col: number, excludeUsername: string): boolean {
    return !this.isOccupied(mapName, row, col, excludeUsername, true);
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
        gender: state.gender,
        hairColor: state.hairColor,
        skinTone: state.skinTone,
        map: state.mapName,
        row: state.row,
        col: state.col,
        level: state.level,
        exp: state.exp,
        hp: state.hp,
        maxHp: state.maxHp,
        mana: state.mana,
        maxMana: state.maxMana,
        mv: state.mv,
        maxMv: state.maxMv,
        bp: state.bp,
        strength: state.strength,
        intelligence: state.intelligence,
        wisdom: state.wisdom,
        dexterity: state.dexterity,
        constitution: state.constitution,
        luck: state.luck,
        canteenDrinks: state.canteenDrinks,
        skills: state.skills,
        inventory: state.inventory,
        equipment: state.equipment,
        restState: state.restState,
        // Whether OTHER players standing next to this one benefit from
        // their light — a carried torch only, not infravision (see
        // shared/lighting.ts's emitsLight).
        hasLight: emitsLight(state.equipment) || state.wandLit,
        wandLit: state.wandLit,
        celeritasActive: state.celeritasActive,
        scutumActive: state.scutumActive,
        barrierActive: state.barrierActive,
        wispActive: state.wispActive,
        beastTransformActive: state.beastTransformActive,
        beastTransformKind: state.beastTransformKind,
        flightActive: state.flightActive,
        inBoat: state.inBoat,
        specialization: state.specialization ?? undefined,
        invisibleActive: state.invisibleActive,
        dancing: state.dancing,
        gold: state.gold,
        bankedGold: state.bankedGold,
        mimicableRaces: state.mimicableRaces,
        mimicForm: state.mimicForm,
        eatBrainsReadyAtTick: state.eatBrainsReadyAtTick,
        skillCooldowns: state.skillCooldowns,
        armorVsPhysical: armorVsPhysicalFor(
          state.dexterity + dexterityEquipmentBonus(state.equipment),
          state.strength,
          physicalArmorEquipmentBonus(state.equipment)
        ),
        armorVsMagical: armorVsMagicalFor(
          state.intelligence + intelligenceEquipmentBonus(state.equipment),
          state.wisdom,
          magicalArmorEquipmentBonus(state.equipment)
        ),
        deathCount: state.deathCount,
        statPointsAvailable: state.statPointsAvailable,
        practicePointsAvailable: state.practicePointsAvailable,
      });
    }

    const npcs = NPCS.filter((npc) => npc.map === mapName);
    const monsters = this.monsterManager.getSnapshotsForMap(mapName);
    const corpses = this.corpseManager.getSnapshotsForMap(mapName);
    const vendors = vendorsForMap(mapName);
    const teachers = teachersForMap(mapName);
    // Murus lapideus's own stone blocks and player pets (both later
    // follow-up asks) live entirely in GameGateway, not here — always
    // empty at this layer; GameGateway's mapStateFor wraps every call
    // site to fill in the real values afterward.
    return { mapName, players, npcs, monsters, corpses, vendors, teachers, stoneBlocks: [], pets: [], animatedMonsters: [], petCorpses: [], tamedBeasts: [], droppedChests: [] };
  }
}
