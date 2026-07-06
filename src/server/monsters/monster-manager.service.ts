import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getMap } from '../game/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import type { AppConfig } from '../config/configuration.js';
import type { MapName } from '../../shared/constants.js';
import type { Monster } from './monster.js';

const SKELETON_MAX_COUNT = 10;
const SKELETON_STARTING_HP = 20;
const SKELETON_HOME_MAP: MapName = 'Labyrinth';

// Autonomous NPCs, independent of any player connection: spawn
// SKELETON_MAX_COUNT skeletons in the Labyrinth on boot, wander them
// randomly on a timer, and top the population back up (one at a time) on a
// slower timer whenever it's below the max. Everything here is in-memory
// only — monsters aren't persisted and the population resets on restart.
@Injectable()
export class MonsterManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly monsters = new Map<string, Monster>();
  private nextId = 1;
  private wanderTimer?: NodeJS.Timeout;
  private respawnTimer?: NodeJS.Timeout;

  private readonly wanderIntervalMs: number;
  private readonly respawnIntervalMs: number;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.wanderIntervalMs = configService.get('skeletonWanderIntervalMs', { infer: true });
    this.respawnIntervalMs = configService.get('skeletonRespawnIntervalMs', { infer: true });
  }

  onModuleInit(): void {
    for (let i = 0; i < SKELETON_MAX_COUNT; i++) {
      this.spawnSkeleton();
    }

    this.wanderTimer = setInterval(() => this.wanderAll(), this.wanderIntervalMs);
    this.wanderTimer.unref();

    this.respawnTimer = setInterval(() => this.respawnIfBelowMax(), this.respawnIntervalMs);
    this.respawnTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.wanderTimer) clearInterval(this.wanderTimer);
    if (this.respawnTimer) clearInterval(this.respawnTimer);
  }

  private randomLabyrinthCell(): { row: number; col: number } {
    const map = getMap(SKELETON_HOME_MAP);
    let row: number;
    let col: number;
    do {
      row = Math.floor(Math.random() * map.rows);
      col = Math.floor(Math.random() * map.cols);
    } while (map.getExitAt(row, col));
    return { row, col };
  }

  private spawnSkeleton(): void {
    const { row, col } = this.randomLabyrinthCell();
    const id = `skeleton-${this.nextId++}`;
    this.monsters.set(id, {
      id,
      kind: 'skeleton',
      hp: SKELETON_STARTING_HP,
      mana: Infinity,
      movement: Infinity,
      mapName: SKELETON_HOME_MAP,
      row,
      col,
    });
  }

  private wanderAll(): void {
    const map = getMap(SKELETON_HOME_MAP);
    const deltas = Object.values(DIRECTION_DELTAS);

    for (const monster of this.monsters.values()) {
      const delta = deltas[Math.floor(Math.random() * deltas.length)];
      if (!delta) continue;

      const nextRow = monster.row + delta.dr;
      const nextCol = monster.col + delta.dc;

      // Locked to the Labyrinth — refuse any step that would leave the map
      // or land on the exit tile. It just stays put this tick instead.
      if (map.isInBounds(nextRow, nextCol) && !map.getExitAt(nextRow, nextCol)) {
        monster.row = nextRow;
        monster.col = nextCol;
      }
    }
  }

  private respawnIfBelowMax(): void {
    if (this.monsters.size < SKELETON_MAX_COUNT) {
      this.spawnSkeleton();
    }
  }

  // Not called from anywhere yet — there's no combat system, so nothing
  // currently kills a skeleton. Kept as the counterpart to spawnSkeleton()
  // so a future "kill" mechanic has something to call, and the respawn
  // logic above has a population drop to actually react to.
  removeMonster(id: string): boolean {
    return this.monsters.delete(id);
  }

  getMonsterAt(mapName: MapName, row: number, col: number): Monster | undefined {
    for (const monster of this.monsters.values()) {
      if (monster.mapName === mapName && monster.row === row && monster.col === col) {
        return monster;
      }
    }
    return undefined;
  }

  getAll(): Monster[] {
    return Array.from(this.monsters.values());
  }
}
