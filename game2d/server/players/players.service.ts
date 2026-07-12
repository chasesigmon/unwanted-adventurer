import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Player } from './player.entity.js';
import type { Gender, HairColor, MapName, Race, SkinTone } from '../../shared/constants.js';

export interface NewPlayerInput {
  username: string;
  accountId: number;
  race: Race;
  // Only meaningful (and only ever provided) for race: 'human'.
  gender?: Gender;
  hairColor?: HairColor;
  skinTone?: SkinTone;
  map: MapName;
  row: number;
  col: number;
  skills: Record<string, number>;
  // Optional — a brand new character starts with an empty inventory
  // unless the caller gives it one (see auth.service.ts's createCharacter,
  // which hands every new human wizard a starting wand).
  inventory?: string[];
}

export interface PlayerPosition {
  map: MapName;
  row: number;
  col: number;
}

export interface PlayerStatsUpdate {
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  strength?: number;
  intelligence?: number;
  wisdom?: number;
  dexterity?: number;
  constitution?: number;
  level?: number;
  exp?: number;
  skills?: Record<string, number>;
  inventory?: string[];
  equipment?: Record<string, string>;
  consumeExp?: number;
  gold?: number;
  mimicableRaces?: string[];
  mimicForm?: string | null;
  deathCount?: number;
  condemned?: boolean;
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
}
