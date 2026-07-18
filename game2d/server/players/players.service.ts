import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Player } from './player.entity.js';
import type { Gender, HairColor, MapName, Race, SkinTone, HouseName, SpecializationPath } from '../../shared/constants.js';
import type { QuestProgress } from '../../shared/quests.js';
import type { PetSnapshot } from '../../shared/pets.js';

export interface NewPlayerInput {
  username: string;
  accountId: number;
  race: Race;
  // Provided for every playable race now (a later follow-up ask restored
  // race as a real choice) — only human's own texture actually varies by
  // them, but they're still stored/shown for the other 4 too.
  gender?: Gender;
  hairColor?: HairColor;
  skinTone?: SkinTone;
  // Starting attribute spread (a later follow-up ask) — see
  // shared/constants.ts's RACE_STARTING_STATS; optional only because
  // every column already defaults to 1, not because any real call site
  // omits them.
  strength?: number;
  intelligence?: number;
  wisdom?: number;
  dexterity?: number;
  constitution?: number;
  luck?: number;
  map: MapName;
  row: number;
  col: number;
  skills: Record<string, number>;
  // Optional — a brand new character starts with an empty inventory
  // unless the caller gives it one (see auth.service.ts's createCharacter).
  inventory?: string[];
  // Optional — a brand new character starts with nothing equipped unless
  // the caller gives it something (see auth.service.ts's createCharacter,
  // which hands every new human wizard an already-equipped starting
  // wand).
  equipment?: Record<string, string>;
  // "New players upon creation should start with 3 trains and 5
  // practices" (a later follow-up ask) — optional only because the
  // column already defaults to 0, not because auth.service.ts's own
  // createCharacter omits them.
  statPointsAvailable?: number;
  practicePointsAvailable?: number;
}

export interface PlayerPosition {
  map: MapName;
  row: number;
  col: number;
  // Movement points change on every single move (see MV_COST_PER_TILE) —
  // persisted alongside position rather than waiting for the much less
  // frequent updateStats write.
  mv?: number;
}

export interface PlayerStatsUpdate {
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  mv?: number;
  maxMv?: number;
  bp?: number;
  strength?: number;
  intelligence?: number;
  wisdom?: number;
  dexterity?: number;
  constitution?: number;
  luck?: number;
  canteenDrinks?: number;
  level?: number;
  exp?: number;
  skills?: Record<string, number>;
  inventory?: string[];
  equipment?: Record<string, string>;
  gold?: number;
  mimicableRaces?: string[];
  mimicForm?: string | null;
  deathCount?: number;
  statPointsAvailable?: number;
  practicePointsAvailable?: number;
  condemned?: boolean;
  secretDoorUnlocked?: boolean;
  secretChestUnlocked?: boolean;
  mapUnlocked?: boolean;
  hunger?: number;
  thirst?: number;
  quests?: Record<string, QuestProgress>;
  house?: HouseName | null;
  specialization?: SpecializationPath | null;
  visitedPois?: string[];
  recallPointId?: string | null;
  killedMonsterKinds?: string[];
  // A follow-up bug fix: "the pet is a permanent part of the player's
  // group... shouldn't disappear" — see player.entity.ts's own `pet`
  // column doc comment.
  pet?: PetSnapshot | null;
}

@Injectable()
export class PlayersService {
  constructor(@InjectRepository(Player) private readonly playersRepo: Repository<Player>) {}

  findByUsernameCaseInsensitive(username: string): Promise<Player | null> {
    return this.playersRepo
      .createQueryBuilder('player')
      .where('lower(player.username) = lower(:username)', { username })
      .getOne();
  }

  findByUsername(username: string): Promise<Player | null> {
    return this.playersRepo.findOneBy({ username });
  }

  // Every character belonging to one account (see characters.controller.ts's
  // GET /characters) — ordered newest-first so a freshly created character
  // shows up at the top of the select screen.
  findByAccountId(accountId: number): Promise<Player[]> {
    return this.playersRepo.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }

  async create(input: NewPlayerInput): Promise<Player> {
    const player = this.playersRepo.create({ ...input, lastLogin: new Date() });
    return this.playersRepo.save(player);
  }

  async touchLastLogin(username: string): Promise<void> {
    await this.playersRepo.update({ username }, { lastLogin: new Date() });
  }

  async updatePosition(username: string, position: PlayerPosition): Promise<void> {
    await this.playersRepo.update({ username }, position);
  }

  // Attributes/vitals/level/exp/skills, persisted after combat (damage
  // taken, exp gained, a level-up, skill growth). Position is intentionally
  // separate (updatePosition) since it's written far more often.
  async updateStats(username: string, updates: PlayerStatsUpdate): Promise<void> {
    await this.playersRepo.update({ username }, updates);
  }

  // Permanent, unlike condemned (which just locks a character out while
  // keeping the row around) — a follow-up ask: "the ability for people to
  // delete players from their character selection page." Ownership is
  // verified by the CALLER (see auth.service.ts's deleteCharacter) before
  // this ever runs.
  async deleteByUsername(username: string): Promise<void> {
    await this.playersRepo.delete({ username });
  }
}
