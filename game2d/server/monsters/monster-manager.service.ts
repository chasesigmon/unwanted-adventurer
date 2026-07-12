import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { getMap, isCastleExteriorBlocked, isMoatBlocked } from '../../shared/maps.js';
import { isTreeTile } from '../../shared/trees.js';
import { isFireplaceBlocked, isChairBlocked, studentDeskPositionsFor } from '../../shared/lighting.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { MONSTER_SPECIES, MONSTER_LEVEL, MONSTER_BASE_ATTRIBUTE, skillsForCarriedItems, type Monster, type MonsterSpecies } from './monster.js';
import { vendorsForMap } from '../worlds/vendors.js';
import { teachersForMap, deskPositionFor } from '../worlds/teachers.js';
import { isPodiumBlocked } from '../../shared/spells.js';
import type { MapName } from '../../shared/constants.js';
import type { MonsterSnapshot } from '../../shared/types.js';

export type OccupancyChecker = (mapName: MapName, row: number, col: number) => boolean;
export type PlayerLocator = (username: string) => { mapName: MapName; row: number; col: number } | undefined;

// A much smaller version of the text game's own monster-manager.service.ts
// — no engaged-in-combat tracking (a punch here is a single instant
// action, not an ongoing multi-round fight to escape from), and no
// per-species respawn timers of its own: GameGateway owns one shared
// interval and drives spawnInitial/wanderAll/respawnBelowMax directly, the
// same way it already owns the stat-tick style timers elsewhere. Entirely
// in-memory, not persisted — population and position reset on restart,
// same tradeoff the text game's version documents.
@Injectable()
export class MonsterManagerService {
  private monsters = new Map<string, Monster>();

  // Set once by GameGateway (which has both this and WorldManagerService
  // injected) so wandering/spawning also avoids tiles a player is
  // standing on — a plain callback instead of a circular module
  // dependency between Monsters and Worlds.
  private isPlayerAt: OccupancyChecker = () => false;

  setPlayerOccupancyChecker(checker: OccupancyChecker): void {
    this.isPlayerAt = checker;
  }

  // Set alongside the occupancy checker, same reasoning — lets a monster
  // that's aggroed onto a player (see setAggro/wanderAll) know where to
  // chase them without a circular Monsters<->Worlds dependency.
  private locatePlayer: PlayerLocator = () => undefined;

  setPlayerLocator(locator: PlayerLocator): void {
    this.locatePlayer = locator;
  }

  // Whoever last landed a hit on this monster (by any means — a tick-
  // resolved attack, a queued skill) — set by GameGateway's combat tick.
  // Aggro persists until it times out from lack of contact, the target
  // logs off/changes map, or the monster dies.
  private aggro = new Map<string, { targetUsername: string; lastContactTick: number }>();
  private static readonly AGGRO_TIMEOUT_TICKS = 10;

  setAggro(monsterId: string, targetUsername: string, tick: number): void {
    this.aggro.set(monsterId, { targetUsername, lastContactTick: tick });
  }

  // Lets GameGateway's combatTick tell "this player's own combat session
  // is out of range because the monster hasn't caught up YET" apart from
  // "this fight is actually over" — a monster still actively chasing
  // this exact player shouldn't have the player's session disengage out
  // from under it (item 7's bug: the monster arrived, found no session
  // to act on, and just wandered off again).
  isAggroedOnto(monsterId: string, targetUsername: string): boolean {
    return this.aggro.get(monsterId)?.targetUsername === targetUsername;
  }

  clearAggro(monsterId: string): void {
    this.aggro.delete(monsterId);
  }

  spawnInitial(): void {
    for (const species of MONSTER_SPECIES) {
      for (let i = 0; i < species.maxCount; i++) this.spawnOne(species);
    }
  }

  private countOf(kind: Monster['kind']): number {
    let n = 0;
    for (const m of this.monsters.values()) if (m.kind === kind) n++;
    return n;
  }

  private isFree(mapName: MapName, row: number, col: number): boolean {
    const map = getMap(mapName);
    if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return false;
    if (map.exits.some((e) => e.row === row && e.col === col)) return false;
    if (isTreeTile(mapName, row, col)) return false;
    if (isCastleExteriorBlocked(mapName, row, col)) return false;
    if (isMoatBlocked(mapName, row, col)) return false;
    if (isFireplaceBlocked(mapName, row, col)) return false;
    if (isChairBlocked(mapName, row, col)) return false;
    if (studentDeskPositionsFor(mapName).some((p) => p.row === row && p.col === col)) return false;
    // Same "own tile + shopfront tile in front of it" collision shape as
    // WorldManagerService.isOccupied — a wandering/spawning monster
    // shouldn't stand inside the shop stall either.
    if (vendorsForMap(mapName).some((v) => (v.row === row && v.col === col) || (v.row + 1 === row && v.col === col))) return false;
    if (
      teachersForMap(mapName).some((t) => {
        const desk = deskPositionFor(t);
        return (t.row === row && t.col === col) || (desk.row === row && desk.col === col);
      })
    )
      return false;
    if (isPodiumBlocked(mapName, row, col)) return false;
    for (const m of this.monsters.values()) {
      if (m.mapName === mapName && m.row === row && m.col === col) return false;
    }
    return !this.isPlayerAt(mapName, row, col);
  }

  // Only enforced for INITIAL spawn placement (not wandering) — a deliberate
  // "don't all clump together at spawn" spacing, generous enough to matter
  // on a 100x100 map without making a small 20x20 one (or a
  // heavily-populated one) impossible to satisfy.
  private static readonly MIN_SPAWN_SPACING = 8;

  private isFarEnoughFromOthers(mapName: MapName, row: number, col: number): boolean {
    for (const m of this.monsters.values()) {
      if (m.mapName !== mapName) continue;
      if (Math.abs(m.row - row) < MonsterManagerService.MIN_SPAWN_SPACING && Math.abs(m.col - col) < MonsterManagerService.MIN_SPAWN_SPACING) {
        return false;
      }
    }
    return true;
  }

  private randomFreeTile(mapName: MapName): { row: number; col: number } | null {
    const map = getMap(mapName);
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = Math.floor(Math.random() * map.cols);
      if (this.isFree(mapName, row, col) && this.isFarEnoughFromOthers(mapName, row, col)) return { row, col };
    }
    // The map's too crowded to satisfy the spacing preference within
    // budget — fall back to just finding anywhere free at all.
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = Math.floor(Math.random() * map.cols);
      if (this.isFree(mapName, row, col)) return { row, col };
    }
    return null;
  }

  private spawnOne(species: MonsterSpecies): void {
    const tile = this.randomFreeTile(species.homeMap);
    if (!tile) return;

    const carriedItems = (species.carriedItemRolls ?? [])
      .filter((roll) => Math.random() < roll.chance)
      .map((roll) => roll.label);

    const monster: Monster = {
      id: randomUUID(),
      kind: species.kind,
      monsterClass: species.monsterClass,
      mapName: species.homeMap,
      row: tile.row,
      col: tile.col,
      hp: species.startingHp,
      maxHp: species.startingHp,
      expReward: species.expReward,
      level: MONSTER_LEVEL,
      strength: MONSTER_BASE_ATTRIBUTE,
      intelligence: MONSTER_BASE_ATTRIBUTE,
      wisdom: MONSTER_BASE_ATTRIBUTE,
      dexterity: MONSTER_BASE_ATTRIBUTE,
      constitution: MONSTER_BASE_ATTRIBUTE,
      luck: MONSTER_BASE_ATTRIBUTE,
      carriedItems,
      skills: skillsForCarriedItems(carriedItems),
      spawnRow: tile.row,
      spawnCol: tile.col,
      ...(species.patrolRangeTiles !== undefined
        ? {
            patrolAxis: (Math.random() < 0.5 ? 'row' : 'col') as 'row' | 'col',
            patrolDirection: (Math.random() < 0.5 ? 1 : -1) as 1 | -1,
            patrolRangeTiles: species.patrolRangeTiles,
          }
        : {}),
    };
    this.monsters.set(monster.id, monster);
  }

  // Tops up ONE species by one monster per call (same "one at a time" cadence
  // as the text game's own respawner) — called on GameGateway's own timer.
  respawnBelowMax(): void {
    for (const species of MONSTER_SPECIES) {
      if (this.countOf(species.kind) < species.maxCount) {
        this.spawnOne(species);
        return;
      }
    }
  }

  // `currentTick` is GameGateway's own combat/world-tick counter, used
  // purely to expire stale aggro (see AGGRO_TIMEOUT_TICKS).
  wanderAll(currentTick: number): Set<MapName> {
    const deltas = Object.values(DIRECTION_DELTAS);
    const changedMaps = new Set<MapName>();
    for (const monster of this.monsters.values()) {
      if (this.stepTowardAggroTarget(monster, currentTick, changedMaps)) continue;

      if (monster.patrolRangeTiles !== undefined) {
        this.stepPatrol(monster, changedMaps);
        continue;
      }

      const delta = deltas[Math.floor(Math.random() * deltas.length)]!;
      const nextRow = monster.row + delta.dr;
      const nextCol = monster.col + delta.dc;
      if (this.isFree(monster.mapName, nextRow, nextCol)) {
        monster.row = nextRow;
        monster.col = nextCol;
        changedMaps.add(monster.mapName);
      }
    }
    return changedMaps;
  }

  // A "back and forth" wander mode (a follow-up ask, imps only) — paces
  // one tile at a time along a single fixed row/col axis, reversing
  // direction once it reaches patrolRangeTiles from its own spawn point
  // (or whenever the next tile that way happens to be blocked), rather
  // than stepping in a random direction like a free-roaming species does.
  private stepPatrol(monster: Monster, changedMaps: Set<MapName>): void {
    const axis = monster.patrolAxis!;
    const spawnAlong = axis === 'row' ? monster.spawnRow : monster.spawnCol;
    const currentAlong = axis === 'row' ? monster.row : monster.col;

    const tryStep = (direction: 1 | -1): boolean => {
      const nextAlong = currentAlong + direction;
      if (Math.abs(nextAlong - spawnAlong) > monster.patrolRangeTiles!) return false;
      const nextRow = axis === 'row' ? nextAlong : monster.row;
      const nextCol = axis === 'col' ? nextAlong : monster.col;
      if (!this.isFree(monster.mapName, nextRow, nextCol)) return false;
      monster.row = nextRow;
      monster.col = nextCol;
      changedMaps.add(monster.mapName);
      return true;
    };

    if (tryStep(monster.patrolDirection!)) return;
    // Reached the end of the patrol line (or something's in the way) —
    // reverse and try the other direction; if THAT'S also blocked, just
    // stand still this tick rather than forcing through.
    monster.patrolDirection = monster.patrolDirection === 1 ? -1 : 1;
    tryStep(monster.patrolDirection);
  }

  // Returns true if this monster's aggro state was handled this tick
  // (whether that meant chasing, staying put already-adjacent, or having
  // its aggro just expire) — false means "fall through to normal random
  // wander" (no aggro at all, or the target's gone and aggro just cleared).
  private stepTowardAggroTarget(monster: Monster, currentTick: number, changedMaps: Set<MapName>): boolean {
    const aggro = this.aggro.get(monster.id);
    if (!aggro) return false;

    if (currentTick - aggro.lastContactTick > MonsterManagerService.AGGRO_TIMEOUT_TICKS) {
      this.aggro.delete(monster.id);
      return false;
    }

    const target = this.locatePlayer(aggro.targetUsername);
    if (!target || target.mapName !== monster.mapName) {
      this.aggro.delete(monster.id);
      return false;
    }

    const dRow = target.row - monster.row;
    const dCol = target.col - monster.col;
    if (Math.abs(dRow) <= 1 && Math.abs(dCol) <= 1) {
      // Already adjacent — stand and fight (the combat tick resolves the
      // actual hit), don't wander off.
      return true;
    }

    // Greedy chase: close whichever axis has the bigger gap first.
    const stepRow = Math.abs(dRow) >= Math.abs(dCol) ? Math.sign(dRow) : 0;
    const stepCol = stepRow === 0 ? Math.sign(dCol) : 0;
    const nextRow = monster.row + stepRow;
    const nextCol = monster.col + stepCol;
    if (this.isFree(monster.mapName, nextRow, nextCol)) {
      monster.row = nextRow;
      monster.col = nextCol;
      changedMaps.add(monster.mapName);
    }
    return true;
  }

  getMonster(id: string): Monster | undefined {
    return this.monsters.get(id);
  }

  // Backs GameGateway's monsterAttackTick — every live monster, regardless
  // of map (the caller filters by adjacency to a player itself).
  allMonsters(): Monster[] {
    return [...this.monsters.values()];
  }

  // Contact lookup for the punch/combat system — exact tile match, same
  // "same cell" contact rule the NPC/player collision already uses.
  findMonsterAt(mapName: MapName, row: number, col: number): Monster | undefined {
    for (const monster of this.monsters.values()) {
      if (monster.mapName === mapName && monster.row === row && monster.col === col) return monster;
    }
    return undefined;
  }

  isOccupied(mapName: MapName, row: number, col: number): boolean {
    return this.findMonsterAt(mapName, row, col) !== undefined;
  }

  // Returns the monster's post-hit state and whether it died. Dead
  // monsters are removed immediately; respawnBelowMax tops the species
  // back up on its own schedule.
  applyDamage(id: string, amount: number): { monster: Monster; died: boolean } | undefined {
    const monster = this.monsters.get(id);
    if (!monster) return undefined;

    monster.hp = Math.max(0, monster.hp - amount);
    const died = monster.hp <= 0;
    if (died) {
      this.monsters.delete(id);
      this.aggro.delete(id);
    }
    return { monster, died };
  }

  getSnapshotsForMap(mapName: MapName): MonsterSnapshot[] {
    const snapshots: MonsterSnapshot[] = [];
    for (const m of this.monsters.values()) {
      if (m.mapName !== mapName) continue;
      snapshots.push({
        id: m.id,
        kind: m.kind,
        monsterClass: m.monsterClass,
        map: m.mapName,
        row: m.row,
        col: m.col,
        level: m.level,
        hp: m.hp,
        maxHp: m.maxHp,
        carriedItems: m.carriedItems,
      });
    }
    return snapshots;
  }
}
