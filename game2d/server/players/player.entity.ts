import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { STARTING_MAP, type MapName, type Race } from '../../shared/constants.js';

// Deliberately minimal — just enough to place a character in the world
// and remember it between sessions. No stats/skills/equipment/inventory:
// none of that exists in this project (see the root project's own
// src/server/players/player.schema.ts for what a much larger version of
// this looks like, in the text game). A real Postgres table (not
// Mongo-style documents), since game2d expects to grow joined tables
// later (inventory, guilds, ...) — the table itself is defined in
// docker/postgres/init-postgres.sql; this entity just mirrors it.
@Entity({ name: 'players' })
export class Player {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ type: 'varchar', length: 16, unique: true })
  username!: string;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'goblin' })
  race!: Race;

  @Column({ type: 'varchar', length: 32, default: STARTING_MAP })
  map!: MapName;

  @Column({ type: 'int' })
  row!: number;

  @Column({ type: 'int' })
  col!: number;

  @Column({ name: 'last_login', type: 'timestamptz', default: () => 'now()' })
  lastLogin!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
