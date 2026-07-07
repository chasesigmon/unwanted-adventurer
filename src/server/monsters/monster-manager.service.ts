import { EventEmitter } from 'events';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getMap } from '../game/maps.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { skillForItemName } from '../items/item-definitions.js';
import type { AppConfig } from '../config/configuration.js';
import type { MapName } from '../../shared/constants.js';
import type { ItemSkillReward } from '../items/dropped-item.js';
import type { Monster, MonsterClass, MonsterKind } from './monster.js';

// Same bare pool either way — what distinguishes a skeleton's drop from a
// goblin's is the *name* it's given at drop time (see getDeathDrops):
// plain ("leg") for an undead kind, "wild goblin <part>" for wild goblin —
// see items/item-definitions.ts's wildGoblinBodyPartSkill.
const BODY_PARTS = ['leg', 'arm', 'hand', 'skull', 'rib'];
const BONE_DAGGER_DROP_CHANCE = 0.2;

// Both monster kinds are entry-level, so level 1 keeps a fresh level-1
// player's attack-bonus formula neutral against them (see GameGateway
// .attributeAttackBonus) — only leveling up (or a future stronger
// monster kind) actually swings that formula either way.
const MONSTER_LEVEL = 1;

// "Give all monsters the same base starting str/int/wis/dex/con stats" —
// one shared baseline for every MonsterKind, matching a fresh player's
// own starting value (1) so a level-1 player vs. a level-1 monster is
// exactly neutral by default.
const MONSTER_BASE_ATTRIBUTE = 1;

// One config per roaming species — everything spawnMonster/wanderAll/
// respawnIfBelowMax need to treat a kind generically instead of hardcoding
// "skeleton"/"Labyrinth" everywhere. Adding a new roaming monster kind is
// just another entry here.
interface MonsterSpecies {
  kind: MonsterKind;
  homeMap: MapName;
  maxCount: number;
  startingHp: number;
  expReward: number;
  monsterClass: MonsterClass;
}

const MONSTER_SPECIES: MonsterSpecies[] = [
  // "add 5 more" to the previous count of 10.
  { kind: 'wild skeleton', homeMap: 'Labyrinth', maxCount: 15, startingHp: 20, expReward: 10, monsterClass: 'undead' },
  { kind: 'wild goblin', homeMap: 'Great Plains', maxCount: 30, startingHp: 15, expReward: 8, monsterClass: 'normal' },
];

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

// Autonomous NPCs, independent of any player connection: spawn every
// species in MONSTER_SPECIES up to its own maxCount on boot (each in its
// own homeMap), wander them all randomly on a shared timer, and top each
// species back up individually (one at a time) on a slower shared timer
// whenever it's below its own max. Everything here is in-memory only —
// monsters aren't persisted and the population resets on restart.
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
    for (const species of MONSTER_SPECIES) {
      for (let i = 0; i < species.maxCount; i++) {
        this.spawnMonster(species);
      }
    }

    this.wanderTimer = setInterval(() => this.wanderAll(), this.wanderIntervalMs);
    this.wanderTimer.unref();

    this.respawnTimer = setInterval(() => this.respawnBelowMax(), this.respawnIntervalMs);
    this.respawnTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.wanderTimer) clearInterval(this.wanderTimer);
    if (this.respawnTimer) clearInterval(this.respawnTimer);
  }

  private randomCellIn(mapName: MapName): { row: number; col: number } {
    const map = getMap(mapName);
    let row: number;
    let col: number;
    do {
      row = Math.floor(Math.random() * map.rows);
      col = Math.floor(Math.random() * map.cols);
    } while (map.getExitAt(row, col));
    return { row, col };
  }

  private spawnMonster(species: MonsterSpecies): void {
    const { row, col } = this.randomCellIn(species.homeMap);
    const id = `${species.kind.replace(/\s+/g, '-')}-${this.nextId++}`;
    this.monsters.set(id, {
      id,
      kind: species.kind,
      hp: species.startingHp,
      maxHp: species.startingHp,
      mana: Infinity,
      movement: Infinity,
      mapName: species.homeMap,
      row,
      col,
      expReward: species.expReward,
      monsterClass: species.monsterClass,
      level: MONSTER_LEVEL,
      strength: MONSTER_BASE_ATTRIBUTE,
      intelligence: MONSTER_BASE_ATTRIBUTE,
      wisdom: MONSTER_BASE_ATTRIBUTE,
      dexterity: MONSTER_BASE_ATTRIBUTE,
      constitution: MONSTER_BASE_ATTRIBUTE,
    });
  }

  private wanderAll(): void {
    const deltas = Object.values(DIRECTION_DELTAS);

    for (const monster of this.monsters.values()) {
      if (this.engaged.has(monster.id)) continue;

      // Each monster wanders within its own mapName — species now live on
      // different maps (Labyrinth vs. Great Plains), not just one shared
      // home map.
      const map = getMap(monster.mapName);
      const delta = deltas[Math.floor(Math.random() * deltas.length)];
      if (!delta) continue;

      const nextRow = monster.row + delta.dr;
      const nextCol = monster.col + delta.dc;

      // Refuse any step that would leave the map or land on an exit tile
      // — it just stays put this tick instead.
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

  private respawnBelowMax(): void {
    for (const species of MONSTER_SPECIES) {
      const currentCount = this.getAll().filter((m) => m.kind === species.kind).length;
      if (currentCount < species.maxCount) {
        this.spawnMonster(species);
      }
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

  // What a monster kind leaves behind on death — kept keyed by kind rather
  // than monsterClass since future kinds sharing a class could still have
  // a different pool, or none. Every current kind always drops a body
  // part; only wild skeleton has the extra BONE_DAGGER_DROP_CHANCE roll for
  // a bone dagger (unchanged from before), so a skeleton kill can yield one
  // or two items while a goblin kill always yields exactly one. A wild
  // skeleton's part is named plainly ("leg") — always undead resistance,
  // see item-definitions.ts's ITEM_DEFINITIONS; a wild goblin's is named
  // "wild goblin <part>" so it teaches normal-monster resistance instead
  // (see wildGoblinBodyPartSkill) rather than colliding with the plain
  // name. Each item's skill reward/chance comes from
  // items/item-definitions.ts — the same lookup GameGateway.handleDrop
  // uses, so an item's properties don't depend on which of those two paths
  // put it on the ground.
  getDeathDrops(kind: MonsterKind): DeathDrop[] {
    const partName = BODY_PARTS[Math.floor(Math.random() * BODY_PARTS.length)];
    const drops: DeathDrop[] = [];
    if (partName) {
      const name = kind === 'wild goblin' ? `wild goblin ${partName}` : partName;
      drops.push({ name, skill: skillForItemName(name) });
    }
    if (kind === 'wild skeleton' && Math.random() < BONE_DAGGER_DROP_CHANCE) {
      drops.push({ name: 'bone dagger', skill: skillForItemName('bone dagger') });
    }
    return drops;
  }
}
