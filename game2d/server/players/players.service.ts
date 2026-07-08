import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Player, type PlayerDocument } from './player.schema.js';
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
  constructor(@InjectModel(Player.name) private readonly playerModel: Model<Player>) {}

  findByUsernameCaseInsensitive(username: string): Promise<PlayerDocument | null> {
    return this.playerModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
  }

  findByUsername(username: string): Promise<PlayerDocument | null> {
    return this.playerModel.findOne({ username });
  }

  async create(input: NewPlayerInput): Promise<PlayerDocument> {
    return this.playerModel.create({ ...input, lastLogin: new Date() });
  }

  async touchLastLogin(username: string): Promise<void> {
    await this.playerModel.updateOne({ username }, { $set: { lastLogin: new Date() } });
  }

  async updatePosition(username: string, position: PlayerPosition): Promise<void> {
    await this.playerModel.updateOne({ username }, { $set: position });
  }
}
