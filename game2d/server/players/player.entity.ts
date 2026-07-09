import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { STARTING_MAP, type MapName, type Race } from '../../shared/constants.js';

// Position fields place a character back where it left off; attribute/
// vital/level/skill fields back the combat system (see
// server/combat/formulas.ts) — mirroring the text game's own
// player.schema.ts conventions (starting attributes of 1, starting
// hp/mana/movement of 100, a percent-learned skills map) even though this
// project's combat is much smaller (one skill, no equipment/inventory).
// A real Postgres table (not Mongo-style documents), since game2d expects
// to grow joined tables later (inventory, guilds, ...) — the table itself
// is defined in docker/postgres/init-postgres.sql; this entity just
// mirrors it.
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

  @Column({ type: 'int', default: 1 })
  strength!: number;

  @Column({ type: 'int', default: 1 })
  intelligence!: number;

  @Column({ type: 'int', default: 1 })
  wisdom!: number;

  @Column({ type: 'int', default: 1 })
  dexterity!: number;

  @Column({ type: 'int', default: 1 })
  constitution!: number;

  @Column({ type: 'int', default: 100 })
  hp!: number;

  @Column({ name: 'max_hp', type: 'int', default: 100 })
  maxHp!: number;

  @Column({ type: 'int', default: 100 })
  mana!: number;

  @Column({ name: 'max_mana', type: 'int', default: 100 })
  maxMana!: number;

  @Column({ type: 'int', default: 100 })
  movement!: number;

  @Column({ name: 'max_movement', type: 'int', default: 100 })
  maxMovement!: number;

  @Column({ type: 'int', default: 1 })
  level!: number;

  @Column({ type: 'int', default: 0 })
  exp!: number;

  // Skill name -> percent learned (1-100). Just "punch" today.
  @Column({ type: 'jsonb', default: () => `'{"punch": 1}'` })
  skills!: Record<string, number>;

  @Column({ name: 'last_login', type: 'timestamptz', default: () => 'now()' })
  lastLogin!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
