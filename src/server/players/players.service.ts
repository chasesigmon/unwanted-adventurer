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

export interface PlayerStats {
  hp: number;
  mana: number;
  movement: number;
  exp: number;
  level: number;
  // Fixed at 1 for a fresh character, but +1 each on every level-up (see
  // GameGateway.resolveAttackExchange) — so unlike race, these do need to
  // persist here.
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  skills: string[];
  inventory: string[];
  consumeExp: number;
  equipment: Record<string, string>;
  gold: number;
  autoSacrifice: boolean;
}

@Injectable()
export class PlayersService {
  constructor(@InjectModel(Player.name) private readonly playerModel: Model<Player>) {}

  // Case-insensitive: used for register's uniqueness check and login lookup,
  // since usernames should be treated as case-insensitive-unique.
  findByUsernameCaseInsensitive(username: string): Promise<PlayerDocument | null> {
    return this.playerModel.findOne({ username: new RegExp(`^${username}$`, 'i') });
  }

  // Exact match: used once a username has already been resolved (e.g. from
  // a verified JWT), where the stored casing is already known.
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

  async updateStats(username: string, stats: PlayerStats): Promise<void> {
    await this.playerModel.updateOne({ username }, { $set: stats });
  }
}
