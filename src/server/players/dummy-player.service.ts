import { Injectable, type OnModuleInit } from '@nestjs/common';
import { getMap } from '../game/maps.js';
import type { MapName, Race } from '../../shared/constants.js';

const DUMMY_LEVEL = 1;
const DUMMY_BASE_ATTRIBUTE = 1;
const DUMMY_MAX_HP = 100;

// Fixed "test/dummy players" — practice targets for "murder <player>",
// each pre-equipped with a bone dagger. Not real accounts (no login, no
// socket), but everything that treats a *real* connected player as
// attackable/visible (scan, look, where, who, examine, murder) also
// checks this registry — see GameGateway's otherPlayersAt/
// otherPlayerSocketAt-equivalents for dummies.
const DUMMY_PLAYER_CONFIGS: Array<{ username: string; race: Race; homeMap: MapName }> = [
  { username: 'TrainingGoblin', race: 'goblin', homeMap: 'Labyrinth' },
  { username: 'TrainingDragonborn', race: 'dragonborn', homeMap: 'Labyrinth' },
  { username: 'TrainingSkeleton', race: 'skeleton', homeMap: 'Great Plains' },
  { username: 'TrainingSlime', race: 'slime', homeMap: 'Great Plains' },
];

export interface DummyPlayer {
  id: string;
  username: string;
  race: Race;
  mapName: MapName;
  row: number;
  col: number;
  level: number;
  hp: number;
  maxHp: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  equipment: Record<string, string>;
  inventory: string[];
}

@Injectable()
export class DummyPlayerService implements OnModuleInit {
  private readonly dummies = new Map<string, DummyPlayer>();

  onModuleInit(): void {
    for (const config of DUMMY_PLAYER_CONFIGS) {
      this.spawn(config);
    }
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

  private spawn(config: { username: string; race: Race; homeMap: MapName }): void {
    const { row, col } = this.randomCellIn(config.homeMap);
    this.dummies.set(`dummy-${config.username}`, {
      id: `dummy-${config.username}`,
      username: config.username,
      race: config.race,
      mapName: config.homeMap,
      row,
      col,
      level: DUMMY_LEVEL,
      hp: DUMMY_MAX_HP,
      maxHp: DUMMY_MAX_HP,
      strength: DUMMY_BASE_ATTRIBUTE,
      intelligence: DUMMY_BASE_ATTRIBUTE,
      wisdom: DUMMY_BASE_ATTRIBUTE,
      dexterity: DUMMY_BASE_ATTRIBUTE,
      constitution: DUMMY_BASE_ATTRIBUTE,
      equipment: { weapon: 'bone dagger' },
      inventory: [],
    });
  }

  getAll(): DummyPlayer[] {
    return Array.from(this.dummies.values());
  }

  getById(id: string): DummyPlayer | undefined {
    return this.dummies.get(id);
  }

  // Partial, case-insensitive match against a dummy standing in a specific
  // cell — same style as MonsterManagerService.findMonsterByNameAt.
  findAt(mapName: MapName, row: number, col: number, query: string): DummyPlayer | undefined {
    const needle = query.toLowerCase();
    return this.getAll().find(
      (d) => d.mapName === mapName && d.row === row && d.col === col && d.username.toLowerCase().includes(needle)
    );
  }

  // Same match, but anywhere — used by "where <player>".
  findByName(query: string): DummyPlayer | undefined {
    const needle = query.toLowerCase();
    return this.getAll().find((d) => d.username.toLowerCase().includes(needle));
  }

  applyDamage(id: string, amount: number): { died: boolean } {
    const dummy = this.dummies.get(id);
    if (!dummy) return { died: true };
    dummy.hp = Math.max(0, dummy.hp - amount);
    return { died: dummy.hp <= 0 };
  }

  // Called once the corpse (holding their equipment/inventory) has
  // already been created — resets them for the next tester at the given
  // location (the same universal player-respawn point "murder" sends
  // everyone to, not necessarily their original home map).
  respawn(id: string, mapName: MapName, row: number, col: number): void {
    const dummy = this.dummies.get(id);
    if (!dummy) return;
    dummy.mapName = mapName;
    dummy.row = row;
    dummy.col = col;
    dummy.hp = dummy.maxHp;
    // Always a fresh bone dagger — these are meant to be murdered
    // repeatedly for testing, not a depleting resource.
    dummy.equipment = { weapon: 'bone dagger' };
    dummy.inventory = [];
  }
}
