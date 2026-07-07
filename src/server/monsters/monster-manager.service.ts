import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getMap } from '../game/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { LESSER_UNDEAD_RESISTANCE, BONE_FINGER_DAGGER_STRIKE } from '../players/skills.js';
import type { AppConfig } from '../config/configuration.js';
import type { MapName } from '../../shared/constants.js';
import type { ItemSkillReward } from '../items/dropped-item.js';
import type { Monster, MonsterKind } from './monster.js';

const SKELETON_MAX_COUNT = 10;
const SKELETON_STARTING_HP = 20;
const SKELETON_EXP_REWARD = 10;
const SKELETON_HOME_MAP: MapName = 'Labyrinth';
const SKELETON_BODY_PARTS = ['leg', 'arm', 'hand', 'skull', 'rib'];
const BODY_PART_SKILL_CHANCE = 0.2;
const BONE_DAGGER_DROP_CHANCE = 0.2;
const BONE_DAGGER_SKILL_CHANCE = 0.05;

export interface DeathDrop {
  name: string;
  skill?: ItemSkillReward;
}

// Autonomous NPCs, independent of any player connection: spawn
// SKELETON_MAX_COUNT skeletons in the Labyrinth on boot, wander them
// randomly on a timer, and top the population back up (one at a time) on a
// slower timer whenever it's below the max. Everything here is in-memory
// only — monsters aren't persisted and the population resets on restart.
@Injectable()
export class MonsterManagerService implements OnModuleInit, OnModuleDestroy {
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
  // have a different pool, or none). Skeletons always drop a body part
  // (20% chance of teaching "lesser undead resistance" when consumed),
  // plus a separate BONE_DAGGER_DROP_CHANCE roll for a bone dagger (5%
  // chance of teaching "bone finger dagger strike" instead) — so a single
  // kill can yield zero, one, or two items, each with its own skill odds.
  getDeathDrops(kind: MonsterKind): DeathDrop[] {
    if (kind !== 'skeleton') return [];

    const drops: DeathDrop[] = [];
    const partName = SKELETON_BODY_PARTS[Math.floor(Math.random() * SKELETON_BODY_PARTS.length)];
    if (partName) {
      drops.push({ name: partName, skill: { reward: LESSER_UNDEAD_RESISTANCE, chance: BODY_PART_SKILL_CHANCE } });
    }
    if (Math.random() < BONE_DAGGER_DROP_CHANCE) {
      drops.push({ name: 'bone dagger', skill: { reward: BONE_FINGER_DAGGER_STRIKE, chance: BONE_DAGGER_SKILL_CHANCE } });
    }
    return drops;
  }
}
