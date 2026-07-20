import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import {
  STARTING_MAP,
  type Gender,
  type HairColor,
  type MapName,
  type Race,
  type SkinTone,
  type HouseName,
  type SpecializationPath,
} from '../../shared/constants.js';
import type { QuestProgress } from '../../shared/quests.js';
import type { PetSnapshot, TamedBeastSnapshot } from '../../shared/pets.js';

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

  // A later follow-up balance pass ("examine the player's stats and
  // increase or decrease things based on balance") bumped every starting
  // attribute from 1 to 5 — at 1, a stat contributes NOTHING to any of its
  // own formulas until a player has sunk enough training points to clear
  // that formula's own divisor (e.g. armorVsPhysicalFor's floor(dexterity
  // /10)), which with only ~11 lifetime training points by level 40 (see
  // TRAINING_POINTS_PER_5_LEVELS) meant most stats sat at 1 — contributing
  // literally nothing — for a player's entire career unless deliberately
  // stacked. 5 gives every fresh character a small, real baseline in
  // every stat's own formula from character creation on, without
  // touching the training-point income rate itself.
  @Column({ type: 'int', default: 5 })
  strength!: number;

  @Column({ type: 'int', default: 5 })
  intelligence!: number;

  @Column({ type: 'int', default: 5 })
  wisdom!: number;

  @Column({ type: 'int', default: 5 })
  dexterity!: number;

  @Column({ type: 'int', default: 5 })
  constitution!: number;

  // No mechanical effect yet — reserved for future use, deliberately not
  // wired into anything (level-up bonuses, combat formulas, ...) yet.
  @Column({ type: 'int', default: 5 })
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

  // Movement points (a later follow-up ask re-added this resource) —
  // 'real' (not 'int'), same fractional-decay precedent hunger/thirst
  // already use, since a move costs 0.5 mv (see MV_COST_PER_TILE).
  // Starting mv matches hp/mana's own 100 (a later follow-up ask), down
  // from the original 200 — see STARTING_MV in combat/formulas.ts.
  @Column({ type: 'real', default: 100 })
  mv!: number;

  @Column({ name: 'max_mv', type: 'real', default: 100 })
  maxMv!: number;

  // Hemomancer's own resource (a later follow-up ask) — granted at 100
  // the moment a player becomes a Hemomancer (see handleChooseSpecialization),
  // 0 for everyone else. No max_bp column — MAX_BP is a flat constant
  // (shared/skills.ts), never scales with level/stats. Uncapped at the
  // FLOOR (unlike hp/mana/mv) — see applyStatTick's own bp regen and
  // handleCastSapHealth's below-zero HP penalty.
  @Column({ type: 'int', default: 0 })
  bp!: number;

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

  @Column({ type: 'int', default: 20 })
  gold!: number;

  // Item 17: banked gold — a single shared balance regardless of which
  // town's Bank you deposited at (Kortho and Floro both read/write this
  // same column), separate from carried `gold` above so a death corpse
  // (item 16) never exposes it.
  @Column({ name: 'banked_gold', type: 'int', default: 0 })
  bankedGold!: number;

  // Leftover columns from the since-removed /mimic and /revert commands
  // (a later follow-up ask) — no longer populated with anything
  // meaningful, kept only to avoid a live DB column-drop migration.
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

  // "Training points" (a later follow-up ask renamed/repaced the cadence
  // of this same mechanic — it used to grant one every level, now every
  // 5th) — stat points, stacking across multiple levels if unspent, spent
  // one at a time via the character sheet's own +/- buttons (see
  // game.gateway.ts's handleAllocateStatPoint). The DB column name stays
  // the same to avoid an unnecessary rename migration.
  @Column({ name: 'stat_points_available', type: 'int', default: 0 })
  statPointsAvailable!: number;

  // "Practice points" (a later follow-up ask replaced the old podium-
  // reading skill system entirely) — 3 granted every level, spent at a
  // classroom/specialization teacher's own click-to-learn modal (see
  // game.gateway.ts's handleLearnSkill).
  @Column({ name: 'practice_points_available', type: 'int', default: 0 })
  practicePointsAvailable!: number;

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

  // Eating & drinking (a follow-up ask) — see the equivalent columns' own
  // comment in docker/postgres/init-postgres.sql for what these mean.
  // 'real' (not 'int') since a later follow-up ask slowed decay to
  // 0.4/tick — the fractional value is real and persisted; only ever
  // rounded down for DISPLAY (see src/ui/modalCore.ts's wholeNumber).
  @Column({ type: 'real', default: 100 })
  hunger!: number;

  @Column({ type: 'real', default: 100 })
  thirst!: number;

  // Quest id -> progress (see shared/quests.ts's own QuestProgress).
  @Column({ type: 'jsonb', default: () => "'{}'" })
  quests!: Record<string, QuestProgress>;

  // The house/specialization system (a follow-up ask) — both null until
  // chosen, permanent afterward (see game.gateway.ts's handleChooseHouse/
  // handleChooseSpecialization).
  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  house!: HouseName | null;

  @Column({ type: 'varchar', length: 16, nullable: true, default: null })
  specialization!: SpecializationPath | null;

  // Recall's own "have I been there" gate (a later follow-up ask) — a
  // flat array of shared/recall.ts RecallPoint ids, appended to the first
  // time the player ever enters that point of interest's own map (see
  // game.gateway.ts's handleMove).
  @Column({ name: 'visited_pois', type: 'jsonb', default: () => "'[]'" })
  visitedPois!: string[];

  // A later follow-up ask reworked recall to a single settable point
  // ("the player must set one location to be their recall choice at a
  // time") — the RecallPoint.id (see shared/recall.ts) they last set via
  // "Set <name> as recall point", or null until they ever do. Also the
  // player's own default respawn destination (see game.gateway.ts's
  // respawnDefeatedPlayer) once set, falling back to Grimoak Castle.
  @Column({ name: 'recall_point_id', type: 'varchar', length: 32, nullable: true, default: null })
  recallPointId!: string | null;

  // Summoner's own kill-tracking (a later follow-up ask) — see
  // shared/types.ts's own doc comment.
  @Column({ name: 'killed_monster_kinds', type: 'jsonb', default: () => "'[]'" })
  killedMonsterKinds!: string[];

  // A follow-up bug fix: "the pet is a permanent part of the player's
  // group unless they are terminated/deleted... the pet disappears from
  // the group after updates" — PetManagerService only ever kept pets
  // in-memory (same tradeoff as monsters/corpses, which are fine to lose
  // on a restart since they're just world content, not something a
  // player owns) — a REAL restart (not just a hot code reload) wiped
  // every player's pet outright. The full PetSnapshot is persisted here
  // (see game.gateway.ts's persistStats, which now always includes it)
  // and restored into PetManagerService the moment its owner reconnects
  // (see handleConnection) — dead ones included, so a fallen pet still
  // shows as "— fallen" in the group panel rather than vanishing, per
  // this same ask's own "even when dead the pet should remain part of
  // the group" — reviving one is a still-future mechanic.
  @Column({ type: 'jsonb', nullable: true, default: null })
  pet!: PetSnapshot | null;

  // The Druid's own "Tame Beast" spell (a later follow-up ask) — same
  // persist-across-logins shape as `pet` above, but null once the tamed
  // beast dies (see TamedBeastManagerService.applyDamage) rather than
  // sticking around fallen — see shared/pets.ts's own TamedBeastSnapshot
  // doc comment for the full reasoning.
  @Column({ name: 'tamed_beast', type: 'jsonb', nullable: true, default: null })
  tamedBeast!: TamedBeastSnapshot | null;

  // Item 11's Transform spell — "there needs to be a tracking system for
  // unique beasts a druid tames" — every distinct MonsterKind this player
  // has ever successfully tamed (see handleCastTameBeast), independent of
  // whether that specific tamed beast is still alive/active; Transform
  // lets them become any kind in this list, not just their current one.
  // Same "unique kinds ever seen" shape as killedMonsterKinds above.
  @Column({ name: 'tamed_beast_kinds', type: 'jsonb', default: () => "'[]'" })
  tamedBeastKinds!: string[];

  @Column({ name: 'last_login', type: 'timestamptz', default: () => 'now()' })
  lastLogin!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
