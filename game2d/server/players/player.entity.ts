import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { STARTING_MAP, type Gender, type HairColor, type MapName, type Race, type SkinTone } from '../../shared/constants.js';

// Position fields place a character back where it left off; attribute/
// vital/level/skill fields back the combat system (see
// server/combat/formulas.ts) — mirroring the text game's own
// player.schema.ts conventions (starting attributes of 1, starting
// hp/mana of 100, a percent-learned skills map) even though this
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

  // Which account owns this character (see accounts/account.entity.ts) —
  // nullable so any character row created before this account layer
  // existed stays valid, just not selectable through the new account
  // flow. Login/auth no longer happens at the character level at all
  // (see auth.service.ts's selectCharacter) — a character used to carry
  // its own password_hash directly; that's gone now that the owning
  // account is what authenticates.
  @Index()
  @Column({ name: 'account_id', type: 'int', nullable: true })
  accountId!: number | null;

  @Column({ type: 'varchar', length: 16, default: 'goblin' })
  race!: Race;

  // Human-only customization (item 4) — null for every non-'human' race.
  // Combined with gender, these pick which base spritesheet (male/
  // female) and which 2 tint overlays (skin, hair) render this character
  // — see characterSprites.ts.
  @Column({ type: 'varchar', length: 8, nullable: true })
  gender!: Gender | null;

  @Column({ name: 'hair_color', type: 'varchar', length: 16, nullable: true })
  hairColor!: HairColor | null;

  @Column({ name: 'skin_tone', type: 'varchar', length: 16, nullable: true })
  skinTone!: SkinTone | null;

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

  // No mechanical effect yet — reserved for future use, deliberately not
  // wired into anything (level-up bonuses, combat formulas, ...) yet.
  @Column({ type: 'int', default: 1 })
  luck!: number;

  // Drinks of water remaining in the player's canteen (see
  // shared/items.ts's CANTEEN_CAPACITY) — refilled by irrigo.
  @Column({ name: 'canteen_drinks', type: 'int', default: 6 })
  canteenDrinks!: number;

  @Column({ type: 'int', default: 100 })
  hp!: number;

  @Column({ name: 'max_hp', type: 'int', default: 100 })
  maxHp!: number;

  @Column({ type: 'int', default: 100 })
  mana!: number;

  @Column({ name: 'max_mana', type: 'int', default: 100 })
  maxMana!: number;

  @Column({ type: 'int', default: 1 })
  level!: number;

  @Column({ type: 'int', default: 0 })
  exp!: number;

  // Skill name -> percent learned (1-100). Just "punch" today.
  @Column({ type: 'jsonb', default: () => `'{"punch": 1}'` })
  skills!: Record<string, number>;

  // Item labels looted from corpses (see server/worlds/corpses.service.ts) —
  // plain strings, no item definitions/stacking yet.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  inventory!: string[];

  // Slot name -> equipped item label. Just "weapon" today.
  @Column({ type: 'jsonb', default: () => "'{}'" })
  equipment!: Record<string, string>;

  // A separate counter from `exp` — incremented by consuming body parts
  // from the inventory (see combat/formulas.ts's CONSUME_EXP_PER_ITEM),
  // mirroring the text game's own consumeExp field. Doesn't drive any
  // further mechanic in this project yet (no evolution system here).
  @Column({ name: 'consume_exp', type: 'int', default: 0 })
  consumeExp!: number;

  @Column({ type: 'int', default: 20 })
  gold!: number;

  // Slime-only mimic/revert tracking (see shared/skills.ts) — every
  // race/monster-kind name whose body part this slime has ever consumed,
  // and whichever one (if any) it's currently disguised as.
  @Column({ name: 'mimicable_races', type: 'jsonb', default: () => "'[]'" })
  mimicableRaces!: string[];

  @Column({ name: 'mimic_form', type: 'varchar', length: 32, nullable: true, default: null })
  mimicForm!: string | null;

  // Condeath tracking (item 23) — every death counts, regardless of
  // cause (monster counter-attack or PvP). Every 5th death costs a point
  // of constitution (see game.gateway.ts's applyCondeathPenalty); at
  // CONDEATH_LIMIT total deaths the character becomes `condemned` and
  // can never log back in — the ACCOUNT itself isn't touched (a future
  // multi-character-per-account system is expected to let a condemned
  // character's owner just start a new one), so this is deliberately a
  // flag on the character row, not a deletion.
  @Column({ name: 'death_count', type: 'int', default: 0 })
  deathCount!: number;

  @Column({ type: 'boolean', default: false })
  condemned!: boolean;

  // The secret room system (a follow-up ask) — see the equivalent columns'
  // own comment in docker/postgres/init-postgres.sql for what each means.
  @Column({ name: 'secret_door_unlocked', type: 'boolean', default: false })
  secretDoorUnlocked!: boolean;

  @Column({ name: 'secret_chest_unlocked', type: 'boolean', default: false })
  secretChestUnlocked!: boolean;

  @Column({ name: 'map_unlocked', type: 'boolean', default: false })
  mapUnlocked!: boolean;

  @Column({ name: 'last_login', type: 'timestamptz', default: () => 'now()' })
  lastLogin!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
