import { EventEmitter } from 'events';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getMap } from '../game/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { skillForItemName } from '../items/item-definitions.js';
import type { AppConfig } from '../config/configuration.js';
import type { MapName } from '../../shared/constants.js';
import type { ItemSkillReward } from '../items/dropped-item.js';
import type { Monster, MonsterKind } from './monster.js';

const SKELETON_MAX_COUNT = 10;
const SKELETON_STARTING_HP = 20;
const SKELETON_EXP_REWARD = 10;
const SKELETON_HOME_MAP: MapName = 'Labyrinth';
const SKELETON_BODY_PARTS = ['leg', 'arm', 'hand', 'skull', 'rib'];
const BONE_DAGGER_DROP_CHANCE = 0.2;

export interface DeathDrop {
  name: string;
  skill?: ItemSkillReward;
}

// Emitted by wanderAll whenever a monster steps from one cell to another
// (never on a kill/despawn) — GameGateway listens for this to tell any
// connected player standing in the from/to cell that a monster just left
// or arrived, since that's otherwise invisible between commands.
export interface MonsterMoveEvent {
  monster: Monster;
  mapName: MapName;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

// Autonomous NPCs, independent of any player connection: spawn
// SKELETON_MAX_COUNT skeletons in the Labyrinth on boot, wander them
// randomly on a timer, and top the population back up (one at a time) on a
// slower timer whenever it's below the max. Everything here is in-memory
// only — monsters aren't persisted and the population resets on restart.
@Injectable()
export class MonsterManagerService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private readonly monsters = new Map<string, Monster>();
  // Monster ids currently locked in a fight — excluded from wanderAll so a
  // monster being fought can never wander out of reach mid-combat. See
  // GameGateway.setEngaged/clearCombat, the only places that toggle this.
  private readonly engaged = new Set<string>();
  private nextId = 1;
  private wanderTimer?: NodeJS.Timeout;
  private respawnTimer?: NodeJS.Timeout;

  private readonly wanderIntervalMs: number;
  private readonly respawnIntervalMs: number;

  constructor(configService: ConfigService<AppConfig, true>) {
    super();
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
      maxHp: SKELETON_STARTING_HP,
      mana: Infinity,
      movement: Infinity,
      mapName: SKELETON_HOME_MAP,
      row,
      col,
      expReward: SKELETON_EXP_REWARD,
      undead: true,
    });
  }

  private wanderAll(): void {
    const map = getMap(SKELETON_HOME_MAP);
    const deltas = Object.values(DIRECTION_DELTAS);

    for (const monster of this.monsters.values()) {
      if (this.engaged.has(monster.id)) continue;

      const delta = deltas[Math.floor(Math.random() * deltas.length)];
      if (!delta) continue;

      const nextRow = monster.row + delta.dr;
      const nextCol = monster.col + delta.dc;

      // Locked to the Labyrinth — refuse any step that would leave the map
      // or land on the exit tile. It just stays put this tick instead.
      if (map.isInBounds(nextRow, nextCol) && !map.getExitAt(nextRow, nextCol)) {
        const fromRow = monster.row;
        const fromCol = monster.col;
        monster.row = nextRow;
        monster.col = nextCol;
        const event: MonsterMoveEvent = {
          monster,
          mapName: monster.mapName,
          fromRow,
          fromCol,
          toRow: nextRow,
          toCol: nextCol,
        };
        this.emit('moved', event);
      }
    }
  }

  private respawnIfBelowMax(): void {
    if (this.monsters.size < SKELETON_MAX_COUNT) {
      this.spawnSkeleton();
    }
  }

  removeMonster(id: string): boolean {
    this.engaged.delete(id);
    return this.monsters.delete(id);
  }

  // Toggled by GameGateway when a fight starts/ends (kill, flee,
  // redirecting to a different target, or the connection dropping) — see
  // clearCombat, the single place every combat-ending path routes through.
  setEngaged(id: string, engaged: boolean): void {
    if (engaged) {
      this.engaged.add(id);
    } else {
      this.engaged.delete(id);
    }
  }

  // Used by the auto-attack loop to re-check a specific target on every
  // tick, since it only has the id it locked onto when combat started.
  getMonsterById(id: string): Monster | undefined {
    return this.monsters.get(id);
  }

  getMonsterAt(mapName: MapName, row: number, col: number): Monster | undefined {
    for (const monster of this.monsters.values()) {
      if (monster.mapName === mapName && monster.row === row && monster.col === col) {
        return monster;
      }
    }
    return undefined;
  }

  // Partial, case-insensitive match against the monster's kind — "attack
  // skel" and "attack skeleton" both find a skeleton standing in the given
  // cell. Only meaningful within a single room: this never searches beyond
  // the given position.
  findMonsterByNameAt(mapName: MapName, row: number, col: number, query: string): Monster | undefined {
    const needle = query.toLowerCase();
    for (const monster of this.monsters.values()) {
      if (monster.mapName === mapName && monster.row === row && monster.col === col && monster.kind.includes(needle)) {
        return monster;
      }
    }
    return undefined;
  }

  // Same partial, case-insensitive match as findMonsterByNameAt, but across
  // every monster regardless of location — used by "where <mob>" to find
  // one anywhere the player might sense it, not just their own room.
  findMonsterByName(query: string): Monster | undefined {
    const needle = query.toLowerCase();
    for (const monster of this.monsters.values()) {
      if (monster.kind.includes(needle)) {
        return monster;
      }
    }
    return undefined;
  }

  // Applies combat damage to a monster, removing it once its hp drops to 0
  // or below. Returns whether it died so the caller (which knows about
  // players/exp, neither of which this service is aware of) can react.
  applyDamage(id: string, amount: number): { died: boolean } {
    const monster = this.monsters.get(id);
    if (!monster) {
      return { died: true };
    }
    monster.hp -= amount;
    if (monster.hp <= 0) {
      this.removeMonster(id);
      return { died: true };
    }
    return { died: false };
  }

  getAll(): Monster[] {
    return Array.from(this.monsters.values());
  }

  // What a monster kind leaves behind on death — always empty for kinds
  // without a loot table (only skeletons have one right now, kept keyed
  // by kind rather than the `undead` flag since future undead kinds could
  // have a different pool, or none). Skeletons always drop a body part,
  // plus a separate BONE_DAGGER_DROP_CHANCE roll for a bone dagger, so a
  // single kill can yield zero, one, or two items. Each item's skill
  // reward/chance comes from items/item-definitions.ts — the same lookup
  // GameGateway.handleDrop uses, so an item's properties don't depend on
  // which of those two paths put it on the ground.
  getDeathDrops(kind: MonsterKind): DeathDrop[] {
    if (kind !== 'skeleton') return [];

    const drops: DeathDrop[] = [];
    const partName = SKELETON_BODY_PARTS[Math.floor(Math.random() * SKELETON_BODY_PARTS.length)];
    if (partName) {
      drops.push({ name: partName, skill: skillForItemName(partName) });
    }
    if (Math.random() < BONE_DAGGER_DROP_CHANCE) {
      drops.push({ name: 'bone dagger', skill: skillForItemName('bone dagger') });
    }
    return drops;
  }
}
