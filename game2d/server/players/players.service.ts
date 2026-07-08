import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Player } from './player.entity.js';
import type { MapName, Race } from '../../shared/constants.js';

export interface NewPlayerInput {
  username: string;
  passwordHash: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
}

export interface PlayerPosition {
  map: MapName;
  row: number;
  col: number;
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
}
