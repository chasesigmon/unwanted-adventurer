import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { getMap } from '../../shared/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { MONSTER_SPECIES, MONSTER_LEVEL, MONSTER_BASE_ATTRIBUTE, type Monster, type MonsterSpecies } from './monster.js';
import type { MapName } from '../../shared/constants.js';
import type { MonsterSnapshot } from '../../shared/types.js';

export type OccupancyChecker = (mapName: MapName, row: number, col: number) => boolean;

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

    const carriedItem =
      species.carriedItemLabel && species.carriedItemChance && Math.random() < species.carriedItemChance
        ? species.carriedItemLabel
        : undefined;

    const monster: Monster = {
      id: randomUUID(),
      kind: species.kind,
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
      carriedItem,
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

  wanderAll(): Set<MapName> {
    const deltas = Object.values(DIRECTION_DELTAS);
    const changedMaps = new Set<MapName>();
    for (const monster of this.monsters.values()) {
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

  getMonster(id: string): Monster | undefined {
    return this.monsters.get(id);
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
    if (died) this.monsters.delete(id);
    return { monster, died };
  }

  getSnapshotsForMap(mapName: MapName): MonsterSnapshot[] {
    const snapshots: MonsterSnapshot[] = [];
    for (const m of this.monsters.values()) {
      if (m.mapName !== mapName) continue;
      snapshots.push({ id: m.id, kind: m.kind, map: m.mapName, row: m.row, col: m.col, level: m.level, hp: m.hp, maxHp: m.maxHp });
    }
    return snapshots;
  }
}
