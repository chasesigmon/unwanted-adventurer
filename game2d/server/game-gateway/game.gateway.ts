import { randomUUID } from 'crypto';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { PlayersService } from '../players/players.service.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { CorpseManagerService, bodyPartLabelFor, raceForBodyPart } from '../worlds/corpse-manager.service.js';
import { PetManagerService } from '../pets/pet-manager.service.js';
import { AnimatedMonsterManagerService } from '../pets/animated-monster-manager.service.js';
import {
  PET_KINDS,
  PET_COMMANDS,
  PET_ATTACK_DAMAGE,
  FOLLOWER_EQUIPMENT_SLOTS,
  FOLLOWER_WEAPON_DAMAGE_BONUS,
  type PetKind,
  type PetCommand,
} from '../../shared/pets.js';
import { CHAT_COMMANDS } from '../../shared/commands.js';
import { WorldClockService } from '../worlds/world-clock.service.js';
import { findVendor } from '../worlds/vendors.js';
import { MONSTER_SPECIES } from '../monsters/monster.js';
import { NPCS } from '../worlds/npcs.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionStoreService } from '../auth/session-store.service.js';
import { ActiveConnectionsService } from '../auth/active-connections.service.js';
import { SocketConnectionLimiterService } from '../rate-limit/socket-connection-limiter.service.js';
import { CommandRateLimiter, type CommandRateLimiterOptions } from '../rate-limit/command-rate-limiter.js';
import {
  getMap,
  startingPositionFor,
  CAVERNA_CHEST_POSITION,
  CAVERNA_SECRET_DOOR_POSITION,
  CAVERNA_SECRET_DOOR_INSIDE_POSITION,
} from '../../shared/maps.js';
import { resolveMove } from '../worlds/resolveMove.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { STARTING_MAP, DIRECTIONS, MAP_NAMES, HOUSE_NAMES, SPECIALIZATION_PATHS, SPECIALIZATION_LEVEL_REQUIREMENT, houseForMap, specializationForMap } from '../../shared/constants.js';
import {
  type CombatantStats,
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  STARTING_LEVEL,
  STARTING_GOLD,
  GOBLIN_MAX_LEVEL,
  STARTING_EXP,
  STARTING_ATTRIBUTE,
  STARTING_VITAL,
  STARTING_MV,
  MV_COST_PER_TILE,
  STARTING_SKILL_PERCENT,
  MAX_SKILL_PERCENT,
  RACE_INNATE_SKILLS,
  SKILL_GROWTH_CHANCE,
  BIG_SKILL_GROWTH_CHANCE,
  BIG_SKILL_GROWTH_AMOUNT,
  TRAINING_POINTS_PER_5_LEVELS,
  TRAINING_POINT_LEVEL_INTERVAL,
  PRACTICE_POINTS_PER_LEVEL,
  perLevelVitalGain,
  HP_PER_CONSTITUTION,
  MANA_PER_INTELLIGENCE,
  intelligenceSpellBonus,
  rollLuckSpellSuccessBonus,
  rollLuckGrowthBonus,
  PLAYER_KILL_EXP_REWARD,
  punchDamage,
  expGainFor,
  applyExpGain,
  weaponBonusFor,
  EQUIPMENT_SLOT_FOR_ITEM,
  EQUIPMENT_SLOTS,
  WEAPON_DAMAGE_BONUS,
  BASE_ARMOR_CLASS,
  armorClassFor,
  armorEquipmentBonus,
  dexterityEquipmentBonus,
  intelligenceEquipmentBonus,
  isRingItem,
  resolveRingSlot,
  startingSkills,
  resistanceGrantForItem,
  RESISTANCE_SKILL_STARTING_PERCENT,
  BONE_FINGER_STRIKE_SKILL,
  BONE_FINGER_STRIKE_GRANT_CHANCE,
  computeBoneFingerStrikeDamage,
  GLARE_SKILL,
  SKILL_COOLDOWN_MS,
  skillGrowthMessage,
  computeDodgeChance,
  computeParryChance,
  computeShieldBlockChance,
  computeExtraAttackChance,
  computeLacerateChance,
  enhancedDamageBonus,
  monsterDamageReduction,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LACERATE_SKILL,
} from '../combat/formulas.js';
import type { Monster } from '../monsters/monster.js';
import type { AppConfig } from '../config/configuration.js';
import type {
  PlayerSnapshot,
  SyncPayload,
  GameServer,
  GameSocket,
  CombatEventPayload,
  UseItemAck,
  RestState,
  BuyAck,
  PetCommandAck,
  CommandFollowerAttackAck,
  FollowerItemAck,
  AnimatedMonsterCommandAck,
  EatBrainsAck,
  SacrificeAck,
  MoveAck,
  CanteenActionAck,
  CastSpellAck,
  AugueTargetPayload,
  CastReseraAck,
  OpenChestAck,
  TakeChestItemAck,
  MapStatePayload,
  StoneBlockSnapshot,
  TileTargetPayload,
  AllocatableStat,
  AllocateStatPointAck,
} from '../../shared/types.js';
import { TOWN_MAPS } from '../../shared/constants.js';
import {
  emitsLight,
  TORCH_ITEM,
  timeOfDayLabel,
  isWithinLightRadius,
  isWithinShopReach,
  isWithinRadius,
  isBedBlocked,
  BED_REACH_TILES,
  isNearBench,
  isBenchBlocked,
  isPortalBlocked,
} from '../../shared/lighting.js';
import { WAND_ITEM, isWandItem } from '../../shared/equipment.js';
import {
  LIGHT_SKILL,
  WATERFILL_SKILL,
  HASTE_SKILL,
  ARCANE_BOLT_SKILL,
  WAND_BOLT_SKILL,
  UNLOCK_SKILL,
  SPELL_ATTACK_RANGE_TILES,
  STUN_SKILL,
  DISARM_SKILL,
  AEGIS_SKILL,
  STONE_WALL_SKILL,
  ANIMATE_DEAD_SKILL,
  ANIMATE_DEAD_MANA_COST,
  ANIMATE_DEAD_HP_MULTIPLIER,
  animatedMonsterCapFor,
  LEARNABLE_SKILLS,
  skillLevelRequirement,
  practicePointCostFor,
  SKILL_SPECIALIZATION_REQUIREMENT,
  RECALL_SKILL,
  RECALL_MANA_COST,
  BARRIER_SKILL,
  BARRIER_MANA_COST,
  BARRIER_DURATION_MS,
  BARRIER_RADIUS_TILES,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  SHAMAN_ENHANCE_DAMAGE_MANA_COST,
  SHAMAN_ENHANCE_DAMAGE_DURATION_MS,
  SHAMAN_ENHANCE_DAMAGE_BONUS,
  FIRE_BOLT_SKILL,
  WATER_BOLT_SKILL,
  AIR_BOLT_SKILL,
  EARTH_BOLT_SKILL,
  ELEMENTAL_BOLT_MANA_COST,
  ELEMENTAL_BOLT_DAMAGE,
  EARTH_BOLT_STUN_TICKS,
  WATER_BOLT_SLOW_TICKS,
  AIR_BOLT_KNOCKBACK_TILES,
  LESSER_HEAL_SKILL,
  LESSER_HEAL_MANA_COST,
  LESSER_HEAL_AMOUNT,
  ENHANCED_UNDEAD_DAMAGE_SKILL,
  ENHANCED_UNDEAD_DAMAGE_BONUS,
  startingPercentFor,
  LESSER_SELF_HEAL_SKILL,
  LESSER_SELF_HEAL_MANA_COST,
  LESSER_SELF_HEAL_AMOUNT,
  WISP_TRANSFORMATION_SKILL,
  WISP_TRANSFORMATION_MANA_COST,
  WISP_TRANSFORMATION_DURATION_MS,
  BATTLEMAGE_ENHANCED_ARMOR_SKILL,
  BATTLEMAGE_ENHANCED_ARMOR_BONUS,
  BATTLEMAGE_ENHANCED_DAMAGE_SKILL,
  BATTLEMAGE_ENHANCED_DAMAGE_BONUS,
  KINETIC_STRIKE_SKILL,
  KINETIC_STRIKE_MANA_COST,
  KINETIC_STRIKE_DAMAGE,
  KINETIC_STRIKE_KNOCKBACK_TILES,
  MAX_BP,
  BP_REGEN_MULTIPLIER,
  SAP_HEALTH_SKILL,
  SAP_HEALTH_BP_COST,
  SAP_HEALTH_AMOUNT,
  SAP_HEALTH_HP_PENALTY,
  MONSTER_SUMMONS_SKILL,
  MONSTER_SUMMONS_MANA_COST,
  MONSTER_SUMMONS_HP_BONUS,
  MONSTER_SUMMONS_DAMAGE_BONUS,
  DEMON_IMP_KIND,
  SUMMON_DEMON_IMP_SKILL,
  SUMMON_DEMON_IMP_MANA_COST,
  DEMON_IMP_HP,
  DEMON_IMP_DAMAGE,
  INVISIBILITY_SKILL,
  INVISIBILITY_MANA_COST,
  INVISIBILITY_DURATION_MS,
  CREATE_DUPLICATE_SKILL,
  CREATE_DUPLICATE_MANA_COST,
  CREATE_DUPLICATE_HP_MULTIPLIER,
  CREATE_DUPLICATE_DURATION_MS,
} from '../../shared/skills.js';
import {
  CANTEEN_ITEM,
  CANTEEN_CAPACITY,
  isFillableItem,
  manaCrystalForLevel,
  isManaCrystal,
  CUP_OF_WATER_ITEM,
  JERKY_ITEM,
  THIRST_RESTORE_PERCENT,
  HUNGER_RESTORE_PERCENT,
  MAX_HUNGER_THIRST,
  SALMON_ITEM,
  SALMON_HUNGER_RESTORE_PERCENT,
  HP_POTION_ITEM,
  MP_POTION_ITEM,
  POTION_RESTORE_AMOUNT,
} from '../../shared/items.js';
import { questDefinition, QUESTS, LEARN_SPELLS_QUEST_ID, allObjectivesDone } from '../../shared/quests.js';
import { recallPointForMap, recallPointById } from '../../shared/recall.js';
import { MONSTER_KINDS } from '../../shared/constants.js';
import type { Direction, MapName, MonsterClass, MonsterKind, Race } from '../../shared/constants.js';

const directionSchema = z.enum(DIRECTIONS);
const equipmentSlotSchema = z.enum(EQUIPMENT_SLOTS);
const useSkillSchema = z.object({ direction: directionSchema, skill: z.string() });
const augueTargetSchema = z.object({ targetKind: z.enum(['player', 'npc', 'monster']), targetId: z.string() });
// Lesser heal (a later follow-up ask) — nullable since "no friendly
// target selected" is a valid, explicitly-specced request (heal self).
const lesserHealTargetSchema = z.object({ targetKind: z.enum(['player', 'npc', 'monster']), targetId: z.string() }).nullable();

// One player's ongoing fight — engageCombat creates/refreshes one of
// these instead of resolving a hit immediately; combatTick is the only
// place that ever actually resolves damage from it.
interface CombatSession {
  targetKind: 'monster' | 'npc' | 'player';
  targetId: string;
  skill: string;
  // Consecutive combatTicks the target's been out of reach — see
  // COMBAT_DISENGAGE_TICKS.
  missedTicks: number;
  // Undefined means "melee" — the exact adjacency-1 check every skill has
  // always used. Set (a follow-up ask's ranged wand-bolt auto-attack,
  // WAND_BOLT_RANGE_TILES) for a square-radius reach instead, checked in
  // combatTick.
  range?: number;
}
const MONSTER_TICK_INTERVAL_MS = 3000;
// Phase C's "speed-matching" ask — close to but slightly slower than the
// player's own MOVE_COOLDOWN_MS (220ms, src/game/mapRender.ts) so a
// following pet/animated monster visibly keeps pace without ever
// outrunning the player it's following.
const FOLLOWER_STEP_MS = 300;
// Zombie-only "Eat Brains" (see handleEatBrains) — "a 4 tick cooldown"
// measured in the game's actual world tick: the same randomized 30-40s
// global stat tick that advances worldHour (see globalStatTick/
// currentTick below), NOT the 3s monster wander tick. 4 of those ticks is
// ~2-2.7 minutes, not a fixed duration.
const EAT_BRAINS_COOLDOWN_TICKS = 4;
const EAT_BRAINS_HEAL_PERCENT = 20;
// Casting lucem ON costs mana; turning it off is free (item 3's
// follow-up ask). While it stays lit, it keeps draining a smaller amount
// every global stat tick (see globalStatTick) — same "recoverable through
// normal means" tradeoff every other mana/hp cost in this project has.
// "Lucem should cost 5 mana" (a later follow-up ask, down from 10).
const LUCEM_CAST_MANA_COST = 5;
const LUCEM_UPKEEP_MANA_COST = 3;
// A follow-up ask's success formula — (skill percent + this, capped at
// MAX_SKILL_PERCENT) is the % chance a cast actually takes hold. Shared by
// every timed spell (lucem, irrigo, celeritas) so "irrigo should have
// the same chance of succeeding... that lucem does" (a later follow-up
// ask) is automatically true rather than a second formula to keep in
// sync.
const SPELL_CAST_SUCCESS_BONUS = 10;
// How long a timed spell (lucem, celeritas) stays active once cast,
// real-world — a later follow-up ask ("lucem should last 3 minutes...
// before it goes out"), scaling up toward double that as skill% climbs to
// MAX_SKILL_PERCENT (see spellDurationMs). Checked once per global stat
// tick (see checkLucemExpiry/checkCeleritasExpiry), the same
// "periodic check, not its own timer" shape as a torch's own burnout.
const SPELL_DURATION_BASE_MS = 3 * 60 * 1000;
function spellDurationMs(skillPercent: number): number {
  return SPELL_DURATION_BASE_MS + Math.round((skillPercent / MAX_SKILL_PERCENT) * SPELL_DURATION_BASE_MS);
}
// Irrigo itself (item 8's follow-up ask) — a flat mana cost per cast,
// whether it succeeds in filling something or not (an already-full
// target still counts as "you tried," same as a missed punch still costs
// nothing extra but the attempt itself was real).
// "Irrigo should cost 5 mana" (a later follow-up ask, down from 10).
const IRRIGO_CAST_MANA_COST = 5;
// Same shape/mana cost/success formula as lucem, just no wand requirement
// (a self-buff, not tied to a carried light source).
// "Celeritas should cost 7 mana" (a later follow-up ask, down from 10).
const CELERITAS_CAST_MANA_COST = 7;
// Arcane Bolt (a later follow-up ask renamed this from "augue") — a
// targeted bolt, unlike lucem/irrigo/celeritas above. No mana cost (not
// requested); its own cooldown lives in shared/skills.ts's
// SKILL_COOLDOWN_MS (checked the same generic way Glare's is, see
// handleCastAugue) instead of a bespoke constant here.
// Base damage 20 (a follow-up ask, up from 10).
const AUGUE_DAMAGE = 20;
const AUGUE_RANGE_TILES = SPELL_ATTACK_RANGE_TILES;
// A follow-up ask: a successful augue hit also leaves the target
// burning — 1 extra damage on each of the next 2 combat ticks (~3s
// apart), with its own combat message each time (see tickAugueBurns,
// driven off the same MONSTER_TICK_INTERVAL_MS loop every other timed
// combat effect here already uses).
const AUGUE_BURN_DAMAGE_PER_TICK = 1;
const AUGUE_BURN_TICKS = 2;
// The wand's own ranged basic attack (a follow-up ask) — flat damage
// (like the punch formula's base, but simplified), resolved every
// combat tick same as any other queued attack (see combatTick's own
// WAND_BOLT_SKILL branch), no cooldown of its own beyond that natural
// ~3s cadence.
// Base damage 9 (a follow-up ask, up from 5) — "the player's base
// [ranged] damage while a wand is equipped."
const WAND_BOLT_DAMAGE = 9;
const WAND_BOLT_RANGE_TILES = SPELL_ATTACK_RANGE_TILES;
// Resera costs mana like every other cast (not explicitly requested, but
// consistent with lucem/celeritas/augue).
const RESERA_CAST_MANA_COST = 10;
// "Both spells [stupefaciunt/exarme] should cost 10 mana"/"the spell
// [scutum] should cost 10 mana" — one shared constant since all three
// (and murus lapideus, see below) land on the exact same figure.
const SPELL_ATTACK_MANA_COST = 10;
// "Cause them to be stunned in place for 2 combat ticks."
const STUPEFACIUNT_STUN_TICKS = 2;
// "Lasts for 1 minute" (scutum's own shield duration — a FIXED duration,
// unlike lucem/celeritas's skill%-scaling spellDurationMs, since nothing
// asked for scutum to scale with skill).
const SCUTUM_DURATION_MS = 60 * 1000;
// "Scutum while active should reduce all damage by 3" (a later follow-up
// ask) — a flat reduction, same shape as monsterDamageReduction, applied
// to every source of damage a player can take (see
// resolveMonsterCounterAttack/resolveHitOnPlayer).
const SCUTUM_DAMAGE_REDUCTION = 3;
// "Range of 10 feet" — a tile-based distance, same unit every other reach
// check here uses despite the flavor-text "feet."
const MURUS_LAPIDEUS_RANGE_TILES = 10;
const MURUS_LAPIDEUS_HP = 20;
// "Increase the duration of the stone to 30 seconds" (a later follow-up
// ask, up from 20s) "or until destroyed by a monster."
const MURUS_LAPIDEUS_DURATION_MS = 30 * 1000;
// "Takes 1 reduced damage from an enemy since it is a stone and is
// defensive" — subtracted from whatever a monster's own hit would be
// (see MonsterManagerService's stone-block damager callback above).
const MURUS_LAPIDEUS_DAMAGE_REDUCTION = 1;
// Skeleton-only "Glare" — measured in COMBAT ticks (see combatTickCount
// below), the same ~3s cadence hits themselves land on, NOT the slow
// 30-40s world tick Eat Brains uses above. Only applied when a skeleton
// deliberately queues Glare as their combat skill (see engageCombat) —
// it lapses GLARE_PARALYSIS_ROUNDS combat ticks after the last time it
// was cast, so staying locked down requires re-casting it, not just
// throwing ordinary punches.
const GLARE_PARALYSIS_ROUNDS = 2;
// How many consecutive combat ticks a player's target is allowed to be
// out of reach before that combat session quietly ends — long enough to
// survive a monster's own greedy chase catching up, short enough that a
// target who's genuinely fled doesn't stay "in combat" forever.
const COMBAT_DISENGAGE_TICKS = 3;
// A torch's total burn time, real-world — ticks down only while actually
// equipped (see lightTorch/pauseTorch/checkTorchBurnout), pausing (not
// resetting) whenever it's taken off. Checked once per global stat tick
// (every 30-40s) rather than its own timer — plenty precise for a
// 15-minute budget.
const TORCH_LIFETIME_MS = 15 * 60 * 1000;
// A flat 30s interval (a setTimeout chain, not setInterval, purely so a
// future tweak to re-introduce jitter would only touch scheduleStatTick)
// heals hp/mana by one shared random percent of each stat's own max, the
// percent range depending on restState.
const HOURS_PER_DAY = 24;
const STAT_TICK_MS = 30_000;
// "Update the hunger & thirst to lose .4 per stat tick instead" (a later
// follow-up ask, slowed from a flat 1/tick) — see applyStatTick.
const HUNGER_THIRST_DECAY_PER_TICK = 0.3;
// The Learn Spells quest's own completion reward (a follow-up ask) — see
// handleCompleteQuest/maybeGrowSpellSkill's own enhancedLearningBonusFor.
// 20 game hours (a later follow-up ask, up from 12) — 20 stat ticks at
// STAT_TICK_MS(30s) each is exactly 10 real-world minutes.
const ENHANCED_LEARNING_TICKS = 20;
const ENHANCED_LEARNING_BONUS_PERCENT = 10;
// A follow-up ask: every quest (all 4) also grants a flat supply reward
// on top of its own exp — see handleCompleteQuest.
const QUEST_REWARD_WATER_COUNT = 5;
const QUEST_REWARD_JERKY_COUNT = 5;
// Two follow-up asks: exp for actually learning a new spell from a
// classroom podium (see each handleReadXBook's own "newly learned"
// branch), and a smaller amount every time an already-known spell grows
// (see maybeGrowSpellSkill above).
const SPELL_LEARN_EXP_REWARD = 50;
const SPELL_GROWTH_EXP_REWARD = 10;
const HEAL_PERCENT_RANGE: Record<RestState, [number, number]> = {
  awake: [7, 10],
  resting: [9, 12],
  sleeping: [10, 15],
};
// A later follow-up ask: "increasing intelligence points will also help
// increase the amount of mana gained on rest" — +2% extra mana regen
// percent per intelligence point (see applyStatTick's own manaPercent),
// on top of whichever restState percent above; hp is unaffected.
const INTELLIGENCE_MANA_REGEN_BONUS_PER_POINT = 0.02;
const STAT_TICK_FLAVOR: Record<RestState, string> = {
  awake: 'You catch your breath',
  resting: 'You rest quietly',
  sleeping: 'You stir in your sleep',
};
// Every map with an actively-spawned monster species — driven off the
// species table itself so a future maxCount bump doesn't also need a
// broadcast-list edit here.
const ACTIVE_MONSTER_MAPS: MapName[] = [...new Set(MONSTER_SPECIES.filter((s) => s.maxCount > 0).map((s) => s.homeMap))];

// The socket-level counterpart to the auth HTTP surface — connection
// lifecycle (rate-limit -> JWT -> Redis session validation -> per-socket
// command rate limiting), movement, and a small contact-based combat
// system (one skill: punch). Still much smaller than the text game's own
// GameGateway (no equipment, no dodge/parry, no multi-round auto-battle —
// a punch is a single instant action).
@WebSocketGateway()
export class GameGateway implements OnGatewayInit<GameServer>, OnGatewayConnection<GameSocket>, OnGatewayDisconnect<GameSocket> {
  @WebSocketServer()
  private server!: GameServer;

  private readonly commandLimiters = new Map<string, CommandRateLimiter>();
  // Skeleton-only Glare (see applyGlare/isParalyzed) — an expiry WORLD
  // TICK NUMBER per target (see currentTick below), keyed
  // "player:<username>" / "monster:<id>" / "npc:<id>" so all three target
  // kinds share one map without colliding on id. Entirely in-memory/
  // ephemeral, same tradeoff as everything else combat-related here.
  private readonly paralyzedUntilTick = new Map<string, number>();
  // A shared world clock, advanced by 1 hour on the same tick as the
  // global stat-tick heal — resets to midnight on server restart, same
  // tradeoff as the text game's own worldHour. Broadcast to every
  // connected socket regardless of map (see globalStatTick) so the
  // client can render a gradually shifting day/night overlay.
  private worldHour = 0;
  // Counts globalStatTick firings (a flat STAT_TICK_MS apart) — the
  // actual "world tick" unit Eat Brains cooldowns are measured in, as
  // opposed to the much faster, fixed-interval MONSTER_TICK_INTERVAL_MS
  // (wander/respawn/corpse-expiry), which isn't a "combat tick" at all.
  private currentTick = 0;
  // Counts the shared MONSTER_TICK_INTERVAL_MS firings (a fixed ~3s apart)
  // — the actual "combat tick" unit combatTick/wanderAll's aggro-timeout
  // and Glare's paralysis window are measured in, as opposed to the much
  // slower, randomized currentTick above (world-clock/Eat-Brains only).
  private combatTickCount = 0;
  // A successful augue's own lingering burn (a follow-up ask) — ticked
  // down once per combat tick in tickAugueBurns, pushed onto here by
  // handleCastAugue's own success branches. Several can coexist (even on
  // the same target, if augue lands again before an earlier burn
  // expires) — a plain array is enough since each only lives 2 ticks.
  // spellLabel drives the burn-tick message only ("Lingering flames from
  // X burn...") — defaults to 'augue' at every pre-existing push site;
  // fire bolt (a later follow-up ask, same DoT mechanic reused verbatim)
  // pushes 'fire bolt' instead.
  private augueBurns: Array<{ targetKind: 'npc' | 'monster'; targetId: string; mapName: MapName; ticksRemaining: number; casterUsername: string; spellLabel: string }> =
    [];
  // One active fight per player, keyed by username — set by engageCombat
  // (right-click or a queued action-bar skill) and resolved once per
  // combatTick, not instantly on click. See combatTick/engageCombat.
  private readonly playerCombat = new Map<string, CombatSession>();
  private readonly commandLimiterOptions: CommandRateLimiterOptions;

  constructor(
    private readonly playersService: PlayersService,
    private readonly worldManager: WorldManagerService,
    private readonly monsterManager: MonsterManagerService,
    private readonly corpseManager: CorpseManagerService,
    private readonly petManager: PetManagerService,
    private readonly animatedMonsterManager: AnimatedMonsterManagerService,
    private readonly worldClock: WorldClockService,
    private readonly authService: AuthService,
    private readonly sessionStore: SessionStoreService,
    private readonly activeConnections: ActiveConnectionsService,
    private readonly connectionLimiter: SocketConnectionLimiterService,
    configService: ConfigService<AppConfig, true>
  ) {
    this.commandLimiterOptions = {
      max: configService.get('commandRateLimitMax', { infer: true }),
      refillPerSec: configService.get('commandRateLimitRefillPerSec', { infer: true }),
    };
  }

  afterInit(server: GameServer): void {
    this.activeConnections.setServer(server);

    // Break the Monsters<->Worlds circular-dependency risk with a plain
    // callback instead of a compile-time module cycle: this is the one
    // place both services are already available together.
    this.monsterManager.setPlayerOccupancyChecker((mapName, row, col) => this.worldManager.isPlayerAt(mapName, row, col));
    // Same reasoning as the occupancy checker above — lets a monster
    // that's aggroed onto a player (see combatTick/setAggro) chase them
    // without a circular Monsters<->Worlds dependency.
    this.monsterManager.setPlayerLocator((username) => {
      const loc = this.worldManager.getLocation(username);
      return loc ? { mapName: loc.mapName, row: loc.row, col: loc.col } : undefined;
    });
    // Murus lapideus (a later follow-up ask) — same callback-injection
    // reasoning as the two above, since GameGateway (not
    // MonsterManagerService) owns the stone-block registry.
    this.monsterManager.setStoneBlockCallbacks(
      (id) => {
        const block = this.stoneBlocks.get(id);
        return block ? { mapName: block.mapName, row: block.row, col: block.col } : undefined;
      },
      (id, amount, attackerLabel) => {
        const block = this.stoneBlocks.get(id);
        if (!block) return undefined;
        const dealt = Math.max(0, amount - MURUS_LAPIDEUS_DAMAGE_REDUCTION);
        block.hp = Math.max(0, block.hp - dealt);
        const died = block.hp <= 0;
        if (died) this.stoneBlocks.delete(id);

        // A follow-up ask: "show a message when the monster hits
        // anything that concerns the player... including the stone" —
        // private to the block's own owner (see combatNotice's own doc
        // comment), not broadcast to the room.
        const ownerSocketId = this.activeConnections.getActiveSocketId(block.ownerUsername);
        const ownerSocket = ownerSocketId ? this.server.sockets.sockets.get(ownerSocketId) : undefined;
        if (ownerSocket) {
          ownerSocket.emit(
            'combatNotice',
            died
              ? `The ${attackerLabel} smashes your Blockman to rubble!`
              : `The ${attackerLabel} hits your Blockman for ${dealt} damage (${block.hp}/${block.maxHp} hp).`
          );
        }

        return died ? 0 : block.hp;
      }
    );
    // Barrier (a later follow-up ask) — same callback-injection reasoning
    // as the stone-block callbacks above, since GameGateway (not
    // MonsterManagerService) owns the activeBarriers registry.
    this.monsterManager.setBarrierZoneChecker((mapName, row, col) => this.isWithinBarrierZone(mapName, row, col));
    // Diabolist's own demon imp (a later follow-up ask) — same
    // callback-injection reasoning as the stone-block callbacks above,
    // since GameGateway (not MonsterManagerService) owns
    // AnimatedMonsterManagerService.
    this.monsterManager.setDemonImpCallbacks(
      (ownerUsername) => {
        const imp = this.animatedMonsterManager.getSnapshotsForOwner(ownerUsername).find((m) => m.monsterKind === DEMON_IMP_KIND && m.alive);
        return imp ? { id: imp.id, mapName: imp.map, row: imp.row, col: imp.col } : undefined;
      },
      (ownerUsername, id, amount) => {
        const result = this.animatedMonsterManager.applyDamage(ownerUsername, id, amount);
        return result ? result.monster.hp : undefined;
      }
    );
    // Illusionist's own invisibility (a later follow-up ask) — same
    // callback-injection reasoning as the demon imp callbacks above,
    // since invisibility state lives on SocketData (this class), not in
    // MonsterManagerService.
    this.monsterManager.setInvisibilityChecker((username) => {
      const socketId = this.activeConnections.getActiveSocketId(username);
      const socket = socketId ? (this.server.sockets.sockets.get(socketId) as GameSocket | undefined) : undefined;
      return socket?.data.invisibleActive ?? false;
    });
    this.monsterManager.spawnInitial();

    // The 'z' hotkey's own follower-attack movement (a later follow-up
    // ask) — same callback-injection reasoning as every other cross-
    // manager lookup above, so PetManagerService/AnimatedMonsterManagerService
    // don't need a direct dependency on MonsterManagerService just to find
    // where a monster target currently is.
    const followerTargetLocator = (kind: 'monster' | 'player', id: string) => this.locateCombatTarget(kind, id);
    this.petManager.setTargetLocator(followerTargetLocator);
    this.animatedMonsterManager.setTargetLocator(followerTargetLocator);

    // Phase C's own "speed-matching" ask — a pet/animated monster used to
    // only step once per MONSTER_TICK_INTERVAL_MS (3s, the same tick
    // combat/wandering runs on), falling miles behind a player who moves
    // every MOVE_COOLDOWN_MS (220ms, src/game/mapRender.ts) at ordinary
    // walking speed. This dedicated, faster interval handles ONLY
    // follower movement (tickAll) — attack cadence/damage output is
    // unaffected, still resolved on the original slower tick below via
    // checkContacts (a read-only adjacency check against wherever this
    // faster loop has already moved the follower to).
    setInterval(() => {
      const petMaps = this.petManager.tickAll();
      const animatedMonsterMaps = this.animatedMonsterManager.tickAll();
      for (const mapName of new Set<MapName>([...petMaps, ...animatedMonsterMaps])) {
        this.server.to(mapName).emit('map:state', this.mapStateFor(mapName));
      }
    }, FOLLOWER_STEP_MS);

    setInterval(() => {
      this.combatTickCount += 1;
      this.combatTick();
      this.tickAugueBurns();
      this.checkDuplicateExpiry();
      this.monsterManager.wanderAll(this.combatTickCount);
      this.resolveMonsterInitiatedAttack(this.combatTickCount);
      this.monsterManager.respawnBelowMax();
      // Read-only adjacency check against each 'attack'-commanded
      // follower's CURRENT position (already moved by the faster
      // interval above) — resolveFollowerContact deals the actual damage
      // and starts the owner's own auto-attack if they aren't already
      // fighting.
      for (const contact of this.petManager.checkContacts()) {
        this.resolveFollowerContact(contact.ownerUsername, contact.targetKind, contact.targetId, 'pet');
      }
      for (const contact of this.animatedMonsterManager.checkContacts()) {
        this.resolveFollowerContact(contact.ownerUsername, contact.targetKind, contact.targetId, 'animatedMonster', contact.id);
      }
      const expiredCorpseMaps = this.corpseManager.removeExpired();
      const stoneBlockMaps = this.removeExpiredStoneBlocks();
      const mapsToBroadcast = new Set<MapName>([...ACTIVE_MONSTER_MAPS, ...expiredCorpseMaps, ...stoneBlockMaps]);
      for (const mapName of mapsToBroadcast) {
        this.server.to(mapName).emit('map:state', this.mapStateFor(mapName));
      }
      // A follow-up bug fix: "scutum ended (0s) but the shield didn't go
      // away immediately" — these used to only be checked once per
      // global stat tick (every 30-40s, see scheduleStatTick), so an
      // expired timed spell could sit "done" client-side (the Affects
      // countdown is computed live off the SAME absolute timestamp) for
      // up to that long before the server actually cleared it. Checking
      // them on this much faster ~3s tick instead closes that gap for
      // lucem/celeritas/scutum alike.
      for (const socket of this.server.sockets.sockets.values()) {
        const client = socket as GameSocket;
        this.checkLucemExpiry(client);
        this.checkCeleritasExpiry(client);
        this.checkScutumExpiry(client);
        this.checkBarrierExpiry(client);
        this.checkEnhanceDamageExpiry(client);
        this.checkWispTransformationExpiry(client);
        this.checkInvisibilityExpiry(client);
      }
    }, MONSTER_TICK_INTERVAL_MS);

    // Resumes wherever the world clock last left off (see WorldClockService)
    // instead of always starting the tick loop from worldHour's field
    // default (0/midnight) — a dev server restarts constantly, and
    // resetting to midnight every time is what actually made every fresh
    // connection look permanently dark, not a lighting bug.
    void this.worldClock.getStartingHour().then((hour) => {
      this.worldHour = hour;
      this.scheduleStatTick();
    });

    server.use(async (socket, next) => {
      const ip = socket.handshake.address;
      if (this.connectionLimiter.isRateLimited(ip)) {
        next(new Error('Too many connection attempts. Please slow down.'));
        return;
      }

      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Missing session token.'));
        return;
      }

      let payload: Awaited<ReturnType<AuthService['verifyCharacterToken']>>;
      try {
        // Rejects an account-level token (one that hasn't picked a
        // character yet) just as reliably as an invalid one — the game
        // socket only ever accepts a real character session.
        payload = await this.authService.verifyCharacterToken(token);
      } catch {
        next(new Error('Invalid or expired session.'));
        return;
      }

      const valid = await this.sessionStore.isSessionValid('character', payload.username, payload.sessionId);
      if (!valid) {
        next(new Error('Session expired or replaced elsewhere.'));
        return;
      }

      socket.data.username = payload.username;
      next();
    });
  }

  private scheduleStatTick(): void {
    setTimeout(() => this.globalStatTick(), STAT_TICK_MS).unref();
  }

  private globalStatTick(): void {
    this.currentTick += 1;
    this.worldHour = (this.worldHour + 1) % HOURS_PER_DAY;
    this.worldClock.persistHour(this.worldHour);
    this.server.emit('worldTime', { hour: this.worldHour, tick: this.currentTick });
    for (const socket of this.server.sockets.sockets.values()) {
      this.applyStatTick(socket as GameSocket);
      this.checkTorchBurnout(socket as GameSocket);
      // Lucem/celeritas/scutum expiry moved to the much faster ~3s
      // combat-tick interval (see its own setInterval above) — a bug fix
      // for scutum's shield lingering up to this whole 30-40s tick past
      // its own countdown hitting 0.
    }
    // Phase C's "sleep/wake" ask — same cadence players regen on.
    for (const mapName of this.petManager.regenAll()) {
      this.server.to(mapName).emit('map:state', this.mapStateFor(mapName));
    }
    this.scheduleStatTick();
  }

  // A shared random percent (of each stat's own max) heals hp and mana
  // together — the percent range depends on restState, same shape as the
  // text game's own applyStatTick.
  private applyStatTick(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;

    const [min, max] = HEAL_PERCENT_RANGE[client.data.restState];
    let percent = min + Math.random() * (max - min);
    // "An extra 15% of gains on top of the normal sleep gains" for
    // sleeping in an actual Dorms bed rather than just on the floor (a
    // later follow-up ask).
    if (client.data.restState === 'sleeping' && client.data.sleepingInBed) {
      percent *= 1.15;
    }
    // "If a player sits or rests on one of the benches in any of the
    // rooms it should offer an extra 10% gain" (a follow-up ask) — a
    // bench's own tile always blocks movement (see isBenchBlocked), so
    // being adjacent to one IS "sitting on" it (see isNearBench). Only
    // for restState 'resting' specifically — sleeping already has its own
    // distinct dorm-bed bonus above.
    const restingOnBench = client.data.restState === 'resting' && isNearBench(client.data.map, client.data.row, client.data.col);
    if (restingOnBench) {
      percent *= 1.1;
    }
    const healed = (current: number, statMax: number, healPercent: number) =>
      Math.min(statMax, current + Math.round((healPercent / 100) * statMax));

    const hp = healed(client.data.hp, client.data.maxHp, percent);
    // A later follow-up ask: "increasing intelligence points will also
    // help increase the amount of mana gained on rest" — mana regen
    // specifically (not hp) gets an extra multiplicative bonus per
    // intelligence point, on top of whichever restState percent above.
    const manaPercent = percent * (1 + client.data.intelligence * INTELLIGENCE_MANA_REGEN_BONUS_PER_POINT);
    let mana = healed(client.data.mana, client.data.maxMana, manaPercent);
    // Movement points (a later follow-up ask re-added this resource) —
    // same plain restState-percent regen hp gets, no stat bonus (unlike
    // mana's intelligence bonus above).
    const mv = healed(client.data.mv, client.data.maxMv, percent);
    // Hemomancer's own BP (a later follow-up ask) — "recover similar to
    // mana on every stat tick, but times 2." healed()'s own Math.min cap
    // works fine even from a negative starting value (see
    // handleCastSapHealth's own below-zero overdraft) — it just moves bp
    // toward/through 0 without a floor, same as the "should be able to go
    // below 0" spec.
    const bp = healed(client.data.bp, MAX_BP, manaPercent * BP_REGEN_MULTIPLIER);

    // Lucem's ongoing upkeep (item 3's follow-up ask) — drains a little
    // mana every tick while lit, applied after this tick's own regen so
    // the two net against each other. Running the player dry just puts
    // the wand out, same "runs out and stops" tradeoff a torch's own
    // burnout already has, rather than ever going negative.
    let wandJustWentOut = false;
    if (client.data.wandLit) {
      if (mana <= LUCEM_UPKEEP_MANA_COST) {
        mana = 0;
        client.data.wandLit = false;
        client.data.wandLitUntil = null;
        wandJustWentOut = true;
      } else {
        mana -= LUCEM_UPKEEP_MANA_COST;
      }
    }

    // Eating & drinking (a follow-up ask) — originally 1 point (of 100)
    // lost per world-clock hour, slowed to 0.4/tick by a later follow-up
    // ask; this tick IS one hour (see globalStatTick's own worldHour
    // advance just above), floored at 0 rather than going negative.
    // Restored 20 points at a time by drinking/eating (see applyConsume/
    // handleDrinkItem). Stays fractional in memory/the DB now (see
    // player.entity.ts's own 'real' column type) — only ever rounded
    // down for DISPLAY (see src/ui/modalCore.ts's wholeNumber), never
    // here, or the 0.4 decrements would never actually accumulate.
    const hunger = Math.max(0, client.data.hunger - HUNGER_THIRST_DECAY_PER_TICK);
    const thirst = Math.max(0, client.data.thirst - HUNGER_THIRST_DECAY_PER_TICK);

    if (
      hp === client.data.hp &&
      mana === client.data.mana &&
      mv === client.data.mv &&
      bp === client.data.bp &&
      hunger === client.data.hunger &&
      thirst === client.data.thirst &&
      !wandJustWentOut
    ) {
      return;
    }

    client.data.hp = hp;
    client.data.mana = mana;
    client.data.mv = mv;
    client.data.bp = bp;
    client.data.hunger = hunger;
    client.data.thirst = thirst;
    this.worldManager.updateState(client.data.username, wandJustWentOut ? { hp, mana, mv, bp, wandLit: false } : { hp, mana, mv, bp });
    void this.persistStats(client);
    this.systemMessage(client, `${STAT_TICK_FLAVOR[client.data.restState]} and recover some hp/mana.`);
    if (wandJustWentOut) {
      this.systemMessage(client, "Your wand flickers out — you're out of mana to sustain it.");
      client.emit('sync', { player: this.snapshotFor(client) });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    }
    client.emit('statTick', {
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      mv: client.data.mv,
      maxMv: client.data.maxMv,
      bp: client.data.bp,
      hunger: client.data.hunger,
      thirst: client.data.thirst,
    });
  }

  private snapshotFor(client: GameSocket): PlayerSnapshot {
    return {
      username: client.data.username,
      race: client.data.race,
      gender: client.data.gender,
      hairColor: client.data.hairColor,
      skinTone: client.data.skinTone,
      map: client.data.map,
      row: client.data.row,
      col: client.data.col,
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      mv: client.data.mv,
      maxMv: client.data.maxMv,
      bp: client.data.bp,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      luck: client.data.luck,
      canteenDrinks: client.data.canteenDrinks,
      skills: client.data.skills,
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      restState: client.data.restState,
      sleepingInBed: client.data.sleepingInBed,
      dancing: client.data.dancing,
      hasLight: emitsLight(client.data.equipment) || client.data.wandLit,
      wandLit: client.data.wandLit,
      celeritasActive: client.data.celeritasActive,
      scutumActive: client.data.scutumActive,
      barrierActive: client.data.barrierActive,
      enhanceDamageActive: client.data.enhanceDamageActive,
      wispActive: client.data.wispActive,
      invisibleActive: client.data.invisibleActive,
      wandLitUntil: client.data.wandLitUntil,
      celeritasActiveUntil: client.data.celeritasActiveUntil,
      scutumActiveUntil: client.data.scutumActiveUntil,
      barrierActiveUntil: client.data.barrierActiveUntil,
      enhanceDamageActiveUntil: client.data.enhanceDamageActiveUntil,
      wispActiveUntil: client.data.wispActiveUntil,
      invisibleActiveUntil: client.data.invisibleActiveUntil,
      gold: client.data.gold,
      mimicableRaces: client.data.mimicableRaces,
      mimicForm: client.data.mimicForm,
      eatBrainsReadyAtTick: client.data.eatBrainsReadyAtTick,
      skillCooldowns: client.data.skillCooldowns,
      armorClass: armorClassFor(client.data.dexterity + dexterityEquipmentBonus(client.data.equipment), armorEquipmentBonus(client.data.equipment)),
      deathCount: client.data.deathCount,
      statPointsAvailable: client.data.statPointsAvailable,
      practicePointsAvailable: client.data.practicePointsAvailable,
      mapUnlocked: client.data.mapUnlocked,
      secretDoorUnlocked: client.data.secretDoorUnlocked,
      secretChestUnlocked: client.data.secretChestUnlocked,
      hunger: client.data.hunger,
      thirst: client.data.thirst,
      quests: client.data.quests,
      enhancedLearningUntil: client.data.enhancedLearningUntil,
      house: client.data.house ?? undefined,
      specialization: client.data.specialization ?? undefined,
      visitedPois: client.data.visitedPois,
      killedMonsterKinds: client.data.killedMonsterKinds,
    };
  }

  // Murus lapideus (a later follow-up ask) — tracked entirely here rather
  // than in WorldManagerService/MonsterManagerService, since it's neither
  // a player nor a wild monster; keyed by its own id.
  private stoneBlocks = new Map<
    string,
    { id: string; ownerUsername: string; mapName: MapName; row: number; col: number; hp: number; maxHp: number; expiresAt: number }
  >();

  private stoneBlockSnapshotsForMap(mapName: MapName): StoneBlockSnapshot[] {
    const snapshots: StoneBlockSnapshot[] = [];
    for (const b of this.stoneBlocks.values()) {
      if (b.mapName !== mapName) continue;
      snapshots.push({ id: b.id, map: b.mapName, row: b.row, col: b.col, hp: b.hp, maxHp: b.maxHp });
    }
    return snapshots;
  }

  // Barrier (a later follow-up ask) — the dome's own fixed origin, keyed
  // by the caster's username (only one barrier per player, same "one
  // active thing" shape scutum's own toggle already has). Consulted by
  // handleMove (a player can't leave their own dome) and
  // MonsterManagerService's own isBarrierZone callback (no monster can
  // enter ANY player's dome).
  private activeBarriers = new Map<string, { mapName: MapName; row: number; col: number }>();

  private isWithinBarrierZone(mapName: MapName, row: number, col: number): boolean {
    for (const barrier of this.activeBarriers.values()) {
      if (barrier.mapName !== mapName) continue;
      if (Math.abs(barrier.row - row) <= BARRIER_RADIUS_TILES && Math.abs(barrier.col - col) <= BARRIER_RADIUS_TILES) return true;
    }
    return false;
  }

  // The Illusionist's own create duplicate (a later follow-up ask) — the
  // ONE animated-monster type here with a FIXED lifespan (every other
  // one lasts until logged out or killed), keyed by the animated
  // monster's own id since a future cap change could allow more than one
  // at once. See checkDuplicateExpiry, polled the same tick loop as
  // every other timed effect here.
  private activeDuplicates = new Map<string, { ownerUsername: string; expiresAt: number }>();

  private checkDuplicateExpiry(): void {
    if (this.activeDuplicates.size === 0) return;
    const changedMaps = new Set<MapName>();
    const now = Date.now();
    for (const [id, entry] of this.activeDuplicates) {
      if (now < entry.expiresAt) continue;
      const owner = this.worldManager.getLocation(entry.ownerUsername);
      if (owner) changedMaps.add(owner.mapName);
      this.animatedMonsterManager.remove(entry.ownerUsername, id);
      this.activeDuplicates.delete(id);
    }
    for (const mapName of changedMaps) {
      this.server.to(mapName).emit('map:state', this.mapStateFor(mapName));
    }
  }

  // Every map:state broadcast (25+ call sites) goes through here now
  // (a later follow-up ask added stone blocks, which
  // WorldManagerService.getMapState has no way to know about) so none of
  // them need updating individually.
  private mapStateFor(mapName: MapName): MapStatePayload {
    const state = this.worldManager.getMapState(mapName);
    state.stoneBlocks = this.stoneBlockSnapshotsForMap(mapName);
    state.pets = this.petManager.getSnapshotsForMap(mapName);
    state.animatedMonsters = this.animatedMonsterManager.getSnapshotsForMap(mapName);
    return state;
  }

  // "Lasts for 20 seconds or until destroyed by a monster" — the
  // destroyed-early case is handled by the stone-block damager callback
  // above (deletes on hp<=0); this just catches the timeout case, once
  // per combat tick same cadence as CorpseManagerService.removeExpired.
  private removeExpiredStoneBlocks(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    const now = Date.now();
    for (const [id, block] of this.stoneBlocks) {
      if (now >= block.expiresAt) {
        this.stoneBlocks.delete(id);
        changedMaps.add(block.mapName);
      }
    }
    return changedMaps;
  }

  // Simplified stand-in for the text game's full 8-slot town-guard
  // disguise check — this project only has one equipment slot (weapon),
  // so "properly equipped enough to pass" just means having it filled.
  private canEnterTown(client: GameSocket): boolean {
    return Boolean(client.data.equipment.weapon);
  }

  private attackerStatsFor(client: GameSocket): CombatantStats {
    return {
      level: client.data.level,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      luck: client.data.luck,
    };
  }

  private async persistPosition(client: GameSocket): Promise<void> {
    try {
      await this.playersService.updatePosition(client.data.username, {
        map: client.data.map,
        row: client.data.row,
        col: client.data.col,
        mv: client.data.mv,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player position:', message);
    }
  }

  private async persistStats(client: GameSocket): Promise<void> {
    try {
      await this.playersService.updateStats(client.data.username, {
        hp: client.data.hp,
        maxHp: client.data.maxHp,
        mana: client.data.mana,
        maxMana: client.data.maxMana,
        mv: client.data.mv,
        maxMv: client.data.maxMv,
        bp: client.data.bp,
        strength: client.data.strength,
        intelligence: client.data.intelligence,
        wisdom: client.data.wisdom,
        dexterity: client.data.dexterity,
        constitution: client.data.constitution,
        luck: client.data.luck,
        canteenDrinks: client.data.canteenDrinks,
        level: client.data.level,
        exp: client.data.exp,
        skills: client.data.skills,
        inventory: client.data.inventory,
        equipment: client.data.equipment,
        gold: client.data.gold,
        mimicableRaces: client.data.mimicableRaces,
        mimicForm: client.data.mimicForm,
        deathCount: client.data.deathCount,
        statPointsAvailable: client.data.statPointsAvailable,
        practicePointsAvailable: client.data.practicePointsAvailable,
        condemned: client.data.deathCount >= GameGateway.CONDEATH_LIMIT,
        secretDoorUnlocked: client.data.secretDoorUnlocked,
        secretChestUnlocked: client.data.secretChestUnlocked,
        mapUnlocked: client.data.mapUnlocked,
        hunger: client.data.hunger,
        thirst: client.data.thirst,
        quests: client.data.quests,
        house: client.data.house,
        specialization: client.data.specialization,
        visitedPois: client.data.visitedPois,
        killedMonsterKinds: client.data.killedMonsterKinds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not persist player stats:', message);
    }
  }

  // Applies exp gain, rolling any level-ups (attribute/vital bonuses, a
  // full heal to the new max) — mirrors the text game's own
  // GameGateway.grantExp. Also nudges WorldManagerService's cached copy
  // of this player's state so occupancy/combat lookups against them by
  // OTHER players stay accurate. A goblin already at GOBLIN_MAX_LEVEL
  // gets no exp at all from further kills (matches the text game exactly
  // — the only race with a level cap, since it's the only one with a
  // defined evolution target); a gain that would push a goblin PAST the
  // cap is clamped down to exactly level 10 with exp zeroed, rather than
  // banking the overflow. Returns whether they leveled up and any
  // cap-related flavor message to show.
  private grantExp(client: GameSocket, gained: number): { leveledUp: boolean; message?: string } {
    if (client.data.race === 'goblin' && client.data.level >= GOBLIN_MAX_LEVEL) {
      return {
        leveledUp: false,
        message: `A goblin cannot progress past level ${GOBLIN_MAX_LEVEL} — consume body parts and evolve into a Hobgoblin to grow further.`,
      };
    }

    const before = client.data.level;
    let { level, exp } = applyExpGain({ level: client.data.level, exp: client.data.exp }, gained);
    let cappedMessage: string | undefined;
    if (client.data.race === 'goblin' && level > GOBLIN_MAX_LEVEL) {
      level = GOBLIN_MAX_LEVEL;
      exp = 0;
      cappedMessage = `You have reached the maximum level for a goblin! Consume body parts and evolve into a Hobgoblin to grow further.`;
    }
    const levelsGained = level - before;
    client.data.level = level;
    client.data.exp = exp;

    // A later follow-up ask replaced the old automatic "+1 to every
    // attribute" level-up bonus entirely: leveling up now grants training
    // points (stacking if unspent) the player allocates themselves — see
    // handleAllocateStatPoint. hp/mana still fully refill on a level-up
    // itself as a bonus, same as before.
    if (levelsGained > 0) {
      // Training points only come every TRAINING_POINT_LEVEL_INTERVAL(5)
      // levels — counts how many multiples of 5 were actually crossed, so
      // a big exp gain jumping several levels at once grants exactly as
      // many as leveling up that many times one at a time would.
      const trainingPointsGained =
        Math.floor(level / TRAINING_POINT_LEVEL_INTERVAL) * TRAINING_POINTS_PER_5_LEVELS -
        Math.floor(before / TRAINING_POINT_LEVEL_INTERVAL) * TRAINING_POINTS_PER_5_LEVELS;
      client.data.statPointsAvailable += trainingPointsGained;
      client.data.practicePointsAvailable += PRACTICE_POINTS_PER_LEVEL * levelsGained;
      // A later follow-up ask: automatic hp/mp growth per level, on top of
      // whatever the player deliberately spends on constitution/
      // intelligence — rolled once per level actually crossed (a big exp
      // gain that jumps several levels at once grows just as much as
      // leveling up that many times one at a time would).
      for (let i = 0; i < levelsGained; i++) {
        client.data.maxHp += perLevelVitalGain(client.data.constitution);
        client.data.maxMana += perLevelVitalGain(client.data.intelligence);
      }
      client.data.hp = client.data.maxHp;
      client.data.mana = client.data.maxMana;
    }

    this.worldManager.updateState(client.data.username, {
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      statPointsAvailable: client.data.statPointsAvailable,
      practicePointsAvailable: client.data.practicePointsAvailable,
    });

    // A level-up changes attributes/max-vitals beyond what the 'combat'
    // event's attacker* fields carry — a fresh, fully authoritative sync
    // keeps the character sheet (and everything else) correct without
    // waiting for a reconnect.
    if (levelsGained > 0) {
      client.emit('sync', { player: this.snapshotFor(client) });
    }
    return { leveledUp: levelsGained > 0, message: cappedMessage };
  }

  // The character sheet's own stat-point allocation (a later follow-up
  // ask, replacing the old automatic per-level attribute bonus) — spends
  // ONE available point on whichever attribute the player picked.
  // Constitution/intelligence also bump their own derived vital (max hp/
  // mana) by the same fixed amount every other point-of-constitution/
  // intelligence already grants elsewhere (see HP_PER_CONSTITUTION/
  // MANA_PER_INTELLIGENCE) — current hp/mana shift by the same delta too,
  // rather than a full heal, so this can't be used to sneak in free
  // healing.
  @SubscribeMessage('allocateStatPoint')
  handleAllocateStatPoint(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): AllocateStatPointAck {
    const parsed = z.object({ stat: z.enum(['strength', 'intelligence', 'wisdom', 'dexterity', 'constitution', 'luck']) }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid stat.' };
    }
    if (client.data.statPointsAvailable <= 0) {
      return { ok: false, message: "You don't have any stat points to allocate." };
    }

    const stat: AllocatableStat = parsed.data.stat;
    client.data.statPointsAvailable -= 1;
    client.data[stat] += 1;
    if (stat === 'constitution') {
      client.data.maxHp += HP_PER_CONSTITUTION;
      client.data.hp += HP_PER_CONSTITUTION;
    } else if (stat === 'intelligence') {
      client.data.maxMana += MANA_PER_INTELLIGENCE;
      client.data.mana += MANA_PER_INTELLIGENCE;
    }

    this.worldManager.updateState(client.data.username, {
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      luck: client.data.luck,
      statPointsAvailable: client.data.statPointsAvailable,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    return { ok: true };
  }

  // A quest-giver's own quest offer (a follow-up ask) — see
  // src/game/WorldScene.ts's questGiver click handler for the reach check
  // and dialogue modal this backs. A no-op (still ok: true) if the quest
  // was already started, rather than an error — clicking "Quest: Learn
  // spells" a second time shouldn't feel like a failure.
  @SubscribeMessage('startQuest')
  handleStartQuest(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ questId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid quest.' };
    }
    const quest = questDefinition(parsed.data.questId);
    if (!quest) {
      return { ok: false, message: "That quest doesn't exist." };
    }
    if (client.data.quests[quest.id] !== undefined) {
      return { ok: true };
    }
    client.data.quests = { ...client.data.quests, [quest.id]: {} };
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    return { ok: true, message: `Quest added: ${quest.title}` };
  }

  // Turning a finished quest back in (a follow-up ask: "they should have
  // to click to complete the quest") — only succeeds once every objective
  // is actually done (isObjectiveDone/allObjectivesDone are the same
  // shared check the quest log's own progress display uses) and it
  // hasn't already been turned in. Grants the quest's flat exp reward,
  // plus (Learn Spells only) a 12-tick enhanced-learning buff.
  @SubscribeMessage('completeQuest')
  handleCompleteQuest(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ questId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid quest.' };
    }
    const quest = questDefinition(parsed.data.questId);
    if (!quest) {
      return { ok: false, message: "That quest doesn't exist." };
    }
    const progress = client.data.quests[quest.id];
    if (!progress) {
      return { ok: false, message: "You haven't started that quest." };
    }
    if (progress.completedAt) {
      return { ok: false, message: "You've already completed that quest." };
    }
    if (
      !allObjectivesDone(quest, progress, client.data.skills, client.data.inventory, {
        mapUnlocked: client.data.mapUnlocked,
        houseChosen: Boolean(client.data.house),
      })
    ) {
      return { ok: false, message: "You haven't finished that quest yet." };
    }

    client.data.quests = { ...client.data.quests, [quest.id]: { ...progress, completedAt: Date.now() } };
    // Every quest also grants 5 cups of water and 5 jerky (a follow-up
    // ask) — flat across all 4 quests, not per-quest-defined, so this
    // stays here rather than in each QuestDefinition itself.
    client.data.inventory = [
      ...client.data.inventory,
      ...Array<string>(QUEST_REWARD_WATER_COUNT).fill(CUP_OF_WATER_ITEM),
      ...Array<string>(QUEST_REWARD_JERKY_COUNT).fill(JERKY_ITEM),
    ];
    const grantResult = this.grantExp(client, quest.rewardExp);
    const messages = [
      `Quest complete: ${quest.title} (+${quest.rewardExp} exp, +${QUEST_REWARD_WATER_COUNT} cups of water, +${QUEST_REWARD_JERKY_COUNT} jerky)`,
    ];
    if (grantResult.message) messages.push(grantResult.message);
    // A follow-up bug fix: "after turning in the Learn Spells quest, I
    // levelled up but it did not show that message in Combat" — a quest
    // completion has no 'combat' event of its own to piggyback the
    // ordinary kill-driven level-up notice on (see WorldScene's
    // applyCombatEvent), so this has to say it explicitly. Same reminder
    // text as that client-side message.
    if (grantResult.leveledUp) {
      messages.push(`${client.data.username} reaches level ${client.data.level}! Open your character sheet to allocate your stat points.`);
    }

    if (quest.id === LEARN_SPELLS_QUEST_ID) {
      // "20 game hours (ticks) worth of enhanced spell learning for every
      // spell by 10%" — see maybeGrowSpellSkill's own enhancedLearningBonusFor
      // check. Stat ticks fire on a fixed STAT_TICK_MS cadence, so this
      // many ticks from now is exactly the same absolute-expiry-timestamp
      // shape wandLitUntil/celeritasActiveUntil already use.
      client.data.enhancedLearningUntil = Date.now() + ENHANCED_LEARNING_TICKS * STAT_TICK_MS;
      messages.push(`Enhanced learning active for ${ENHANCED_LEARNING_TICKS} hours!`);
    }

    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    const message = messages.join(' ');
    // combatNotice (not systemMessage/'chat') so this actually shows up in
    // the Combat log tab, not Chat — same bug as above, just for the
    // quest-complete message itself this time, not just the level-up line.
    client.emit('combatNotice', message);
    return { ok: true, message };
  }

  // The new house-assignment teacher's own dialogue (a follow-up ask) —
  // permanent once chosen; a direct-emit attempt at re-choosing (or
  // choosing an invalid house) is rejected rather than silently
  // overwriting an existing choice.
  @SubscribeMessage('chooseHouse')
  handleChooseHouse(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ house: z.enum(HOUSE_NAMES) }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid house.' };
    }
    if (client.data.house) {
      return { ok: false, message: 'You have chosen your house already. Let glory and fame be yours!' };
    }
    client.data.house = parsed.data.house;
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    const message = `You have been sorted into ${parsed.data.house}!`;
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // The Specialization room's own path choice (a follow-up ask) —
  // level-10-gated (mirroring the dialogue's own live level check),
  // permanent once chosen. No mechanics wired to the choice itself yet
  // ("mechanics on the paths will come in the future").
  @SubscribeMessage('chooseSpecialization')
  handleChooseSpecialization(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ path: z.enum(SPECIALIZATION_PATHS) }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid path.' };
    }
    if (client.data.level < SPECIALIZATION_LEVEL_REQUIREMENT) {
      return { ok: false, message: `Return to me when you are level ${SPECIALIZATION_LEVEL_REQUIREMENT}.` };
    }
    if (client.data.specialization) {
      return { ok: false, message: 'Your path has been chosen, may you make it your own.' };
    }
    client.data.specialization = parsed.data.path;
    // "On becoming a Hemomancer, a player should gain an extra stat 'bp'
    // ... the player should start with 100/100 bp" (a later follow-up
    // ask) — granted once, right here, not from character creation.
    if (parsed.data.path === 'hemomancer') {
      client.data.bp = MAX_BP;
    }
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    const message = `You have chosen the path of ${parsed.data.path}.`;
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // The classroom/specialization teacher click-to-learn modal (a later
  // follow-up ask replaced the old podium-reading skill system entirely:
  // "the player should be able to click on the teacher... and a modal
  // should pop up with skills & spells available") — spends practice
  // points instead of gold/a random chance, gated by level and (for
  // Necromancer's animate dead, the first skill to migrate onto this)
  // an optional specialization requirement. Every specialization spell
  // added from here on reuses this same handler.
  @SubscribeMessage('learnSkill')
  handleLearnSkill(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ skill: z.string() }).safeParse(payload);
    if (!parsed.success || !(LEARNABLE_SKILLS as readonly string[]).includes(parsed.data.skill)) {
      return { ok: false, message: 'Invalid skill.' };
    }
    const { skill } = parsed.data;

    if (client.data.skills[skill] !== undefined) {
      return { ok: false, message: `You already know ${skill}.` };
    }
    const requiredLevel = skillLevelRequirement(skill);
    if (client.data.level < requiredLevel) {
      return { ok: false, message: `Return to me when you are level ${requiredLevel}.` };
    }
    const requiredSpecialization = SKILL_SPECIALIZATION_REQUIREMENT[skill];
    if (requiredSpecialization && client.data.specialization !== requiredSpecialization) {
      return { ok: false, message: `Only those who walk the ${requiredSpecialization}'s path may learn this.` };
    }
    const cost = practicePointCostFor(skill);
    if (client.data.practicePointsAvailable < cost) {
      return { ok: false, message: `You need ${cost} practice point${cost === 1 ? '' : 's'} to learn ${skill}.` };
    }

    client.data.practicePointsAvailable -= cost;
    client.data.skills = { ...client.data.skills, [skill]: startingPercentFor(skill) };
    this.worldManager.updateState(client.data.username, {
      skills: client.data.skills,
      practicePointsAvailable: client.data.practicePointsAvailable,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    const message = `You have learned ${skill}.`;
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // A small chance per attack/defense (hit or miss doesn't matter here,
  // there's no miss chance at all in this project) to grow the given
  // skill by 1 point, same shape as the text game's own skill growth.
  // Returns the notice message if it actually grew.
  // `extraChancePercent` (a later follow-up ask, spell casts only — see
  // maybeGrowSpellSkill below) adds a luck-rolled percentage-point bonus
  // on top of the ordinary SKILL_GROWTH_CHANCE roll.
  private maybeGrowSkill(client: GameSocket, skill: string, extraChancePercent = 0): string | undefined {
    const current = client.data.skills[skill] ?? STARTING_SKILL_PERCENT;
    if (current >= MAX_SKILL_PERCENT) return undefined;
    const chance = SKILL_GROWTH_CHANCE + extraChancePercent / 100;
    if (Math.random() >= chance) return undefined;
    // A later follow-up ask: "within the 5% chance that skills can
    // increase, there is [also] a 20% chance the skill/spell can
    // increase by 2%" — a second, independent roll on top of the growth
    // chance that already just succeeded.
    const amount = Math.random() < BIG_SKILL_GROWTH_CHANCE ? BIG_SKILL_GROWTH_AMOUNT : 1;
    const next = Math.min(MAX_SKILL_PERCENT, current + amount);
    client.data.skills = { ...client.data.skills, [skill]: next };
    this.worldManager.updateState(client.data.username, { skills: client.data.skills });
    return skillGrowthMessage(skill, next);
  }

  // Every spell handler calls this instead of the plain maybeGrowSkill
  // (a later follow-up ask: "when casting a spell add between luck/2 and
  // luck x5 chance to the player's chance of getting better at a spell/
  // skill") — layers the luck-rolled bonus on top of the same base
  // SKILL_GROWTH_CHANCE every other (non-spell) skill use still gets
  // unmodified.
  private maybeGrowSpellSkill(client: GameSocket, skill: string): string | undefined {
    const growthMessage = this.maybeGrowSkill(client, skill, rollLuckGrowthBonus(client.data.luck) + this.enhancedLearningBonusFor(client));
    if (!growthMessage) return undefined;
    // "When a player gets better at a spell they should gain 10
    // experience points" (a follow-up ask) — spells specifically (every
    // call site here is a spell), not ordinary combat skills like punch/
    // dagger, which grow through the plain maybeGrowSkill above instead.
    const grantResult = this.grantExp(client, SPELL_GROWTH_EXP_REWARD);
    let message = `${growthMessage} (+${SPELL_GROWTH_EXP_REWARD} exp)`;
    if (grantResult.message) message = `${message} ${grantResult.message}`;
    if (grantResult.leveledUp) {
      // No 'combat' event to piggyback the ordinary level-up notice on
      // here either (same gap handleCompleteQuest just fixed) — same
      // exact reminder text.
      client.emit('combatNotice', `${client.data.username} reaches level ${client.data.level}! Open your character sheet to allocate your stat points.`);
    }
    return message;
  }

  // "Every time a player learns a new spell from a classroom they should
  // gain 50 experience points" (a follow-up ask) — called from each
  // handleReadXBook's own "newly learned" branch, right after granting
  // the skill itself. Returns a suffix to append to that handler's own
  // success message, same "(+N exp)" shape maybeGrowSpellSkill uses.
  private grantSpellLearnExp(client: GameSocket): string {
    const grantResult = this.grantExp(client, SPELL_LEARN_EXP_REWARD);
    let suffix = ` (+${SPELL_LEARN_EXP_REWARD} exp)`;
    if (grantResult.message) suffix = `${suffix} ${grantResult.message}`;
    if (grantResult.leveledUp) {
      client.emit('combatNotice', `${client.data.username} reaches level ${client.data.level}! Open your character sheet to allocate your stat points.`);
    }
    return suffix;
  }

  // The Learn Spells quest's own completion reward (a follow-up ask) —
  // +10 percentage points on every spell's own growth roll, for
  // ENHANCED_LEARNING_TICKS stat ticks after turning the quest in (see
  // handleCompleteQuest). 0 once it's expired or was never granted.
  private enhancedLearningBonusFor(client: GameSocket): number {
    return client.data.enhancedLearningUntil && client.data.enhancedLearningUntil > Date.now() ? ENHANCED_LEARNING_BONUS_PERCENT : 0;
  }

  // Which skill an attack's own weapon skill-growth chance targets:
  // wielding a dagger grows dagger, bare hands grows punch — you can't
  // possibly get better at punching while wielding a weapon (see the
  // combat-resolution call sites).
  private attackGrowthSkill(client: GameSocket): string {
    const weapon = client.data.equipment.weapon;
    return weapon && weapon.toLowerCase().includes('dagger') ? DAGGER_SKILL : PUNCH_SKILL;
  }

  // The combat-log verb for an attack — a dagger stabs, bare hands punch.
  private attackVerb(client: GameSocket): string {
    const weapon = client.data.equipment.weapon;
    return weapon && weapon.toLowerCase().includes('dagger') ? 'stabs' : 'punches';
  }

  // Dodge/parry are rolled first (either one fully negates the hit);
  // shield block is only even attempted once both have failed. Growth:
  // dodge/parry only grow when they actually trigger, shield block grows
  // on any attempt (wearing a shield) regardless of outcome — same order
  // and growth rules as the text game's resolveAttackExchange.
  private resolveDefense(
    defenderStats: CombatantStats,
    defenderSkills: Record<string, number>,
    defenderEquipment: Record<string, string>,
    attackerStats: CombatantStats
  ): { avoided: boolean; verb?: string; skill?: string } {
    const dodged = Math.random() < computeDodgeChance(defenderStats, defenderSkills, attackerStats);
    const parried = !dodged && Math.random() < computeParryChance(defenderStats, defenderSkills, defenderEquipment, attackerStats);
    if (dodged || parried) {
      return { avoided: true, verb: dodged ? 'dodge' : 'parry', skill: dodged ? DODGE_SKILL : PARRY_SKILL };
    }

    const blockChance = computeShieldBlockChance(defenderSkills, defenderEquipment, defenderStats.constitution);
    const attemptingBlock = blockChance > 0;
    const blocked = attemptingBlock && Math.random() < blockChance;
    return { avoided: blocked, verb: blocked ? 'block' : undefined, skill: attemptingBlock ? SHIELD_BLOCK_SKILL : undefined };
  }

  // Race-specific extra swings on top of the base attack, rolled
  // independently of each other so a single punch can proc more than one:
  // hobgoblin's second/third attack (each also grows 2% on every attack
  // thrown, hit or miss, same as every other skill in this project) plus
  // a flat enhanced-damage bonus, and dragonborn's lacerate (innate at
  // MAX_SKILL_PERCENT, so nothing left to grow).
  private rollExtraAttacks(client: GameSocket, growthMessages: string[], isUndeadTarget = false): { swings: number; enhancedBonus: number } {
    let swings = 1;
    // Shaman's own "enhance damage" (a later follow-up ask) — a flat
    // +5 while active, independent of race, stacking with hobgoblin's own
    // innate enhanced-damage bonus below if a player somehow has both.
    let enhancedBonus = client.data.enhanceDamageActive ? SHAMAN_ENHANCE_DAMAGE_BONUS : 0;

    // Cleric's own "enhanced undead damage" (a later follow-up ask) — a
    // flat +5 vs a target classified undead ONLY (see isUndeadTarget at
    // each call site), regardless of race/other bonuses above. Starts (and
    // stays) at MAX_SKILL_PERCENT — see startingPercentFor — so there's
    // nothing left to grow, same "innate at the cap" treatment as
    // dragonborn's lacerate above.
    if (isUndeadTarget && client.data.skills[ENHANCED_UNDEAD_DAMAGE_SKILL] !== undefined) {
      enhancedBonus += ENHANCED_UNDEAD_DAMAGE_BONUS;
    }

    // Battlemage's own "enhanced damage" (a later follow-up ask, distinct
    // from both of the above) — a CHANCE (not a flat guarantee) rolled on
    // every ranged/physical attack MADE, growing every time regardless of
    // whether it triggers, same shape as hobgoblin's second/third attack.
    if (client.data.skills[BATTLEMAGE_ENHANCED_DAMAGE_SKILL] !== undefined) {
      const battlemageGrowth = this.maybeGrowSkill(client, BATTLEMAGE_ENHANCED_DAMAGE_SKILL);
      if (battlemageGrowth) growthMessages.push(battlemageGrowth);
      if (Math.random() < computeExtraAttackChance(client.data.skills[BATTLEMAGE_ENHANCED_DAMAGE_SKILL])) {
        enhancedBonus += BATTLEMAGE_ENHANCED_DAMAGE_BONUS;
      }
    }

    if (client.data.race === 'hobgoblin') {
      if (Math.random() < computeExtraAttackChance(client.data.skills[SECOND_ATTACK_SKILL] ?? 0)) {
        swings++;
        growthMessages.push('Your second attack triggers!');
      }
      const secondGrowth = this.maybeGrowSkill(client, SECOND_ATTACK_SKILL);
      if (secondGrowth) growthMessages.push(secondGrowth);

      if (Math.random() < computeExtraAttackChance(client.data.skills[THIRD_ATTACK_SKILL] ?? 0)) {
        swings++;
        growthMessages.push('Your third attack triggers!');
      }
      const thirdGrowth = this.maybeGrowSkill(client, THIRD_ATTACK_SKILL);
      if (thirdGrowth) growthMessages.push(thirdGrowth);

      const enhancedGrowth = this.maybeGrowSkill(client, ENHANCED_DAMAGE_SKILL);
      if (enhancedGrowth) growthMessages.push(enhancedGrowth);
      enhancedBonus += enhancedDamageBonus(client.data.skills[ENHANCED_DAMAGE_SKILL] ?? 0);
    }

    if (client.data.race === 'dragonborn') {
      if (Math.random() < computeLacerateChance(client.data.skills[LACERATE_SKILL] ?? 0)) {
        swings++;
        growthMessages.push('Your lacerate triggers — an extra laceration attack!');
      }
    }

    return { swings, enhancedBonus };
  }

  // Skeleton-only: every hit landed on a still-living target refreshes
  // its paralysis window (see GLARE_PARALYSIS_MS) — the target can't act
  // back until GLARE_PARALYSIS_MS after the skeleton's LAST hit, so
  // staying in the fight keeps them locked down. Call sites decide what
  // "can't act" means for their target kind (skip a counter-attack for a
  // monster/dummy; refuse move/punch for a player — see handleMove/
  // handlePunch).
  private applyGlare(client: GameSocket, targetKey: string): void {
    if (client.data.race !== 'skeleton') return;
    this.paralyzedUntilTick.set(targetKey, this.combatTickCount + GLARE_PARALYSIS_ROUNDS);
  }

  private isParalyzed(targetKey: string): boolean {
    const untilTick = this.paralyzedUntilTick.get(targetKey);
    return untilTick !== undefined && this.combatTickCount < untilTick;
  }

  // Starts (or resumes) a torch's burn-down clock — called the instant
  // one becomes the equipped shield-slot item.
  private lightTorch(client: GameSocket): void {
    client.data.torchLitAt = Date.now();
  }

  // Freezes the clock wherever it is — called the instant a lit torch
  // stops being the equipped shield-slot item (unequipped, or swapped for
  // something else), "saving" the remaining burn time for later.
  private pauseTorch(client: GameSocket): void {
    if (client.data.torchLitAt === null) return;
    const elapsed = Date.now() - client.data.torchLitAt;
    client.data.torchRemainingMs = Math.max(0, client.data.torchRemainingMs - elapsed);
    client.data.torchLitAt = null;
  }

  // Checked once per global stat tick (see globalStatTick) for every
  // connected client — extinguishes (and discards) a torch that's burned
  // through its full TORCH_LIFETIME_MS while continuously equipped.
  private checkTorchBurnout(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (client.data.torchLitAt === null) return;
    const elapsed = Date.now() - client.data.torchLitAt;
    if (elapsed < client.data.torchRemainingMs) return;

    const equipment = { ...client.data.equipment };
    delete equipment.shield;
    client.data.equipment = equipment;
    client.data.torchLitAt = null;
    client.data.torchRemainingMs = TORCH_LIFETIME_MS;

    this.worldManager.updateState(client.data.username, { equipment: client.data.equipment });
    void this.persistStats(client);
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, 'Your torch burns out and crumbles to ash.');
  }

  // Checked once per global stat tick, same shape as checkTorchBurnout —
  // extinguishes a lit wand once it's stayed on for its full
  // spellDurationMs (a later follow-up ask: "lucem should last 3 minutes
  // in real life... before it goes out").
  private checkLucemExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.wandLit || client.data.wandLitUntil === null) return;
    if (Date.now() < client.data.wandLitUntil) return;

    client.data.wandLit = false;
    client.data.wandLitUntil = null;
    this.worldManager.updateState(client.data.username, { wandLit: false });
    void this.persistStats(client);
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, 'Your wand flickers out — the light spell has run its course.');
  }

  // Same idea again, for celeritas — no other player sees this
  // toggle (unlike wandLit's hasLight), so no map:state broadcast needed.
  private checkCeleritasExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.celeritasActive || client.data.celeritasActiveUntil === null) return;
    if (Date.now() < client.data.celeritasActiveUntil) return;

    client.data.celeritasActive = false;
    client.data.celeritasActiveUntil = null;
    this.worldManager.updateState(client.data.username, { celeritasActive: false });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, 'The spring leaves your step as the spell wears off.');
  }

  // Scutum (a later follow-up ask) — same periodic-expiry shape as
  // lucem/celeritas above, but there's no manual toggle-off: it just runs
  // for its own fixed duration (SCUTUM_DURATION_MS) and then wears off on
  // its own.
  private checkScutumExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.scutumActive || client.data.scutumActiveUntil === null) return;
    if (Date.now() < client.data.scutumActiveUntil) return;

    client.data.scutumActive = false;
    client.data.scutumActiveUntil = null;
    this.worldManager.updateState(client.data.username, { scutumActive: false });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, 'Your shimmering shield fades away.');
  }

  // Barrier (a later follow-up ask) — same periodic-expiry shape as
  // scutum above; also clears this player's own activeBarriers entry so
  // monsters can wander back into the (now-dissolved) zone and the
  // movement-confinement gate in handleMove stops applying.
  private checkBarrierExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.barrierActive || client.data.barrierActiveUntil === null) return;
    if (Date.now() < client.data.barrierActiveUntil) return;

    client.data.barrierActive = false;
    client.data.barrierActiveUntil = null;
    this.activeBarriers.delete(client.data.username);
    this.worldManager.updateState(client.data.username, { barrierActive: false });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, 'Your barrier dissolves.');
  }

  // Shaman's enhance damage (a later follow-up ask) — same periodic-
  // expiry shape as scutum above, no worldManager thread since nothing
  // else needs to render it (see PlayerSnapshot's enhanceDamageActive).
  private checkEnhanceDamageExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.enhanceDamageActive || client.data.enhanceDamageActiveUntil === null) return;
    if (Date.now() < client.data.enhanceDamageActiveUntil) return;

    client.data.enhanceDamageActive = false;
    client.data.enhanceDamageActiveUntil = null;
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, 'The extra power fades from your strikes.');
  }

  // Wisp transformation (a later follow-up ask) — same periodic-expiry
  // shape as scutum/barrier above; DOES need the worldManager thread
  // (unlike enhance damage) since other nearby players need to see the
  // caster's sprite swap back.
  private checkWispTransformationExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.wispActive || client.data.wispActiveUntil === null) return;
    if (Date.now() < client.data.wispActiveUntil) return;

    client.data.wispActive = false;
    client.data.wispActiveUntil = null;
    this.worldManager.updateState(client.data.username, { wispActive: false });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, 'You transform back into your regular form.');
  }

  // Invisibility (a later follow-up ask) — same periodic-expiry shape as
  // wisp transformation above (DOES need the worldManager thread, since
  // other nearby players' clients need to know to start rendering this
  // player's sprite again).
  private checkInvisibilityExpiry(client: GameSocket): void {
    if (!client.data.username || !this.worldManager.getLocation(client.data.username)) return;
    if (!client.data.invisibleActive || client.data.invisibleActiveUntil === null) return;
    if (Date.now() < client.data.invisibleActiveUntil) return;

    client.data.invisibleActive = false;
    client.data.invisibleActiveUntil = null;
    this.worldManager.updateState(client.data.username, { invisibleActive: false });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, 'You fade back into visibility.');
  }

  // "If the player attacks while invisible then the effect should go
  // away and they should become visible again" (a later follow-up ask)
  // — called from every BASIC-attack entry point (punch/useSkill/
  // engageRangedAttack), unlike wisp's own no-attack rule which BLOCKS
  // the attack outright: invisibility just ends as a side effect, the
  // attack itself still goes through. No-op if not currently invisible.
  private breakInvisibilityIfActive(client: GameSocket): void {
    if (!client.data.invisibleActive) return;
    client.data.invisibleActive = false;
    client.data.invisibleActiveUntil = null;
    this.worldManager.updateState(client.data.username, { invisibleActive: false });
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, 'Your invisibility shatters as you attack!');
  }

  // A monster/dummy that survives a punch fights back — a flat punch
  // (or, if it's carrying a weapon, a weapon-style hit; see main.ts's
  // held-weapon overlay for the visual side), subject to the PLAYER's own
  // dodge/parry/shield-block and (for real monsters) resistance skill.
  // Only ever called if the target actually survived the player's own
  // swings; returns the counter-attack's own combat-log line, folded into
  // the same emitCombat call as the player's attack rather than a second
  // broadcast.
  // A resistance skill only grows if the player already has it (earned
  // first via resistanceGrantForItem) — unlike every other skill here,
  // it's never auto-granted from nothing just by being hit. Rolled
  // whether the attack actually landed or was avoided ("every hit/miss"),
  // same as any other skill's growth chance.
  private maybeGrowResistanceSkill(client: GameSocket, monsterClass: MonsterClass | undefined, growthMessages: string[]): void {
    if (!monsterClass) return;
    const skill = monsterClass === 'undead' ? LESSER_UNDEAD_MONSTER_RESISTANCE : LESSER_NORMAL_MONSTER_RESISTANCE;
    if (client.data.skills[skill] === undefined) return;
    const growth = this.maybeGrowSkill(client, skill);
    if (growth) growthMessages.push(growth);
  }

  // A monster/dummy's own attack skill/weapon, if it has either — a real
  // monster (see Monster.skills) fights back with its own punch or
  // (carrying one) weapon skill through the exact same punchDamage()
  // formula a player uses; the training dummy has neither (undefined),
  // so it falls back to a bare-handed 0%-skill swing, same shape as
  // before but no longer a made-up flat number either.
  private resolveMonsterCounterAttack(
    client: GameSocket,
    attackerStats: CombatantStats,
    attackerLabel: string,
    monsterClass: MonsterClass | undefined,
    growthMessages: string[],
    attacker?: { skills: Record<string, number>; carriedItems: string[]; attackDamage?: number }
  ): string {
    // Barrier (a later follow-up ask) — full immunity from every monster
    // attack while active, not just a damage reduction like scutum. Monsters
    // can't even enter the dome (see MonsterManagerService's own
    // isBarrierBlocked check), so this is mostly a defense-in-depth
    // guard against whatever was already adjacent the instant it went up.
    if (client.data.barrierActive) {
      return `The ${attackerLabel}'s attack is stopped cold by your barrier!`;
    }
    const defense = this.resolveDefense(this.attackerStatsFor(client), client.data.skills, client.data.equipment, attackerStats);
    if (defense.skill) {
      const growth = this.maybeGrowSkill(client, defense.skill);
      if (growth) growthMessages.push(growth);
    }
    this.maybeGrowResistanceSkill(client, monsterClass, growthMessages);
    // Battlemage's own "enhanced armor" (a later follow-up ask) — grows
    // on every hit taken, same "rolled whether landed or avoided" shape
    // as the resistance skills above.
    if (client.data.skills[BATTLEMAGE_ENHANCED_ARMOR_SKILL] !== undefined) {
      const armorGrowth = this.maybeGrowSkill(client, BATTLEMAGE_ENHANCED_ARMOR_SKILL);
      if (armorGrowth) growthMessages.push(armorGrowth);
    }
    if (defense.avoided) {
      return defense.verb === 'block'
        ? `You block the ${attackerLabel}'s counter-attack with your shield!`
        : `You ${defense.verb} the ${attackerLabel}'s counter-attack!`;
    }

    const hasWeapon = attacker?.carriedItems.some((item) => item.toLowerCase().includes('dagger')) ?? false;
    const skillPercent = attacker ? (attacker.skills[hasWeapon ? DAGGER_SKILL : PUNCH_SKILL] ?? 0) : 0;
    const weaponBonus = hasWeapon ? (WEAPON_DAMAGE_BONUS['bone dagger'] ?? 0) : 0;
    const defenderAC = armorClassFor(client.data.dexterity + dexterityEquipmentBonus(client.data.equipment), armorEquipmentBonus(client.data.equipment));
    // A species with its own flat attackDamage (a later follow-up ask:
    // "the imps have a physical attack/punch that should do 5 damage per
    // hit") counter-attacks for exactly that instead of the shared
    // punchDamage() formula.
    const rawDamage = attacker?.attackDamage ?? punchDamage(attackerStats, this.attackerStatsFor(client), skillPercent, weaponBonus, defenderAC);
    const reduction = monsterClass ? monsterDamageReduction(monsterClass, client.data.skills) : 0;
    const scutumReduction = client.data.scutumActive ? SCUTUM_DAMAGE_REDUCTION : 0;
    // Battlemage's own "enhanced armor" — "a CHANCE based on learned
    // percent to grant +5 armor/reduced damage for every hit the player
    // takes," same scaledSkillChance-based roll as hobgoblin's second/
    // third attack, applied here per hit rather than as a flat guarantee.
    const battlemageArmorReduction =
      client.data.skills[BATTLEMAGE_ENHANCED_ARMOR_SKILL] !== undefined &&
      Math.random() < computeExtraAttackChance(client.data.skills[BATTLEMAGE_ENHANCED_ARMOR_SKILL])
        ? BATTLEMAGE_ENHANCED_ARMOR_BONUS
        : 0;
    const damage = Math.max(0, rawDamage - reduction - scutumReduction - battlemageArmorReduction);
    const verb = hasWeapon ? 'stabs' : 'punches';

    client.data.hp = Math.max(0, client.data.hp - damage);
    const died = client.data.hp <= 0;
    if (died) {
      this.respawnDefeatedPlayer(client);
    } else {
      this.worldManager.updateState(client.data.username, { hp: client.data.hp });
    }

    if (damage <= 0) return `The ${attackerLabel} ${verb} at you, but the blow glances off.`;
    return died
      ? `The ${attackerLabel} ${verb} you back for ${damage} damage, defeating you!`
      : `The ${attackerLabel} ${verb} you back for ${damage} damage.`;
  }

  // A later follow-up ask: "when it finally got into range... it didn't
  // attack the player ever" — the imp's own reactive counter-attack (see
  // resolveMonsterCounterAttack above) only ever fires because the
  // PLAYER'S own swing landed that same tick; an aggro'd monster just
  // standing adjacent while the player ISN'T attacking (fled, or simply
  // hasn't swung yet) never did anything back. This is the proactive
  // half: every combat tick, any monster with an aggro'd player target
  // AND a species-level attackDamage (only imps today — see monster.ts's
  // own doc comment) that's adjacent to that exact player throws its own
  // hit, independent of whether the player attacked this tick. Skips a
  // monster that already resolved a reactive counter this same tick (see
  // Monster.lastCounterAttackTick) so it can't hit the same player twice
  // in one tick.
  private resolveMonsterInitiatedAttack(currentTick: number): void {
    for (const { monster, targetUsername } of this.monsterManager.getAggroedMonsters()) {
      if (monster.attackDamage === undefined) continue;
      if (monster.lastCounterAttackTick === currentTick) continue;
      if (this.isParalyzed(`monster:${monster.id}`)) continue;

      const socketId = this.activeConnections.getActiveSocketId(targetUsername);
      const client = socketId ? (this.server.sockets.sockets.get(socketId) as GameSocket | undefined) : undefined;
      if (!client || client.data.map !== monster.mapName) continue;
      // Strict cardinal adjacency, same shape melee's own inRange check
      // uses — a monster mid-chase (still closing distance) shouldn't
      // throw a punch from range.
      if (Math.abs(client.data.row - monster.row) + Math.abs(client.data.col - monster.col) !== 1) continue;

      monster.lastCounterAttackTick = currentTick;
      const growthMessages: string[] = [];
      const message = this.resolveMonsterCounterAttack(client, monster, monster.kind, monster.monsterClass, growthMessages, monster);
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      // The private combatNotice channel (see its own first use, the
      // stone-block-hit notifications) rather than the room-broadcast
      // 'combat' event — that event's own `attacker` field is always a
      // real PLAYER username elsewhere (used to look up a sprite/position
      // for the fireball/counter-swing animations), which a monster's own
      // kind string doesn't fit; this is simpler and correctly private to
      // just the player being hit either way.
      const growthSuffix = growthMessages.length > 0 ? ` ${growthMessages.join(' ')}` : '';
      client.emit('combatNotice', `${message}${growthSuffix}`);
    }
  }

  // Condeath (item 23) — a permanent-death "lives" system, separate from
  // the ordinary respawn every death already triggers. Every death counts
  // (whether from a monster counter-attack or a PvP kill); every 5th
  // costs a point of constitution (and the hp that comes with it, see
  // HP_PER_CONSTITUTION); at the 65th, the character is condemned
  // outright — locked out of ever logging back in (see handleConnection's
  // own check) without touching the account/username itself.
  private static readonly CONDEATH_LIMIT = 65;
  private static readonly CONDEATH_CON_PENALTY_EVERY = 5;

  private applyCondeathPenalty(client: GameSocket): void {
    client.data.deathCount += 1;

    if (client.data.deathCount % GameGateway.CONDEATH_CON_PENALTY_EVERY === 0 && client.data.constitution > 1) {
      client.data.constitution -= 1;
      client.data.maxHp = Math.max(10, client.data.maxHp - HP_PER_CONSTITUTION);
      client.data.hp = Math.min(client.data.hp, client.data.maxHp);
      this.worldManager.updateState(client.data.username, { constitution: client.data.constitution, maxHp: client.data.maxHp });
      this.systemMessage(client, 'The weight of your deaths wears on you — you feel permanently weaker (-1 constitution).');
    }

    if (client.data.deathCount >= GameGateway.CONDEATH_LIMIT) {
      void this.persistStats(client).then(() => {
        client.emit('session:kicked', {
          message: `You have died for the ${client.data.deathCount}th time and met CONDEATH — this character can never be played again.`,
        });
        client.disconnect(true);
      });
      return;
    }
    void this.persistStats(client);
  }

  // Resets a defeated player back to the starting map at full hp — shared
  // by a player kill (resolveHitOnPlayer) and a monster's own
  // counter-attack (resolveMonsterCounterAttack). Doesn't grant exp or
  // leave a corpse (only a player killer does that); this just puts them
  // back on their feet somewhere.
  private respawnDefeatedPlayer(targetClient: GameSocket): void {
    const previousMap = targetClient.data.map;
    const spawn = startingPositionFor(STARTING_MAP);
    targetClient.data.map = STARTING_MAP;
    targetClient.data.row = spawn.row;
    targetClient.data.col = spawn.col;
    targetClient.data.hp = targetClient.data.maxHp;

    this.worldManager.updateState(targetClient.data.username, {
      mapName: targetClient.data.map,
      row: targetClient.data.row,
      col: targetClient.data.col,
      hp: targetClient.data.hp,
    });

    if (previousMap !== targetClient.data.map) {
      void targetClient.leave(previousMap);
      void targetClient.join(targetClient.data.map);
    }
    this.applyCondeathPenalty(targetClient);
    targetClient.emit('sync', { player: this.snapshotFor(targetClient) });
  }

  async handleConnection(client: GameSocket): Promise<void> {
    const { username } = client.data;
    this.commandLimiters.set(client.id, new CommandRateLimiter(this.commandLimiterOptions));
    this.activeConnections.setActiveSocket(username, client.id);

    let doc = null;
    try {
      doc = await this.playersService.findByUsername(username);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    // Condeath (item 23) — a condemned character can never log back in.
    // The row (and its account) is never deleted, just permanently
    // locked; same "kick with an explanation" mechanism a duplicate
    // login already uses elsewhere (see ActiveConnectionsService).
    if (doc?.condemned) {
      client.emit('session:kicked', {
        message: `${username} has met CONDEATH after ${doc.deathCount} deaths and can never be played again.`,
      });
      client.disconnect(true);
      return;
    }

    const spawn = startingPositionFor(STARTING_MAP);
    client.data.race = doc?.race ?? 'human';
    client.data.gender = doc?.gender ?? null;
    client.data.hairColor = doc?.hairColor ?? null;
    client.data.skinTone = doc?.skinTone ?? null;
    client.data.map = doc?.map ?? STARTING_MAP;
    client.data.row = doc?.row ?? spawn.row;
    client.data.col = doc?.col ?? spawn.col;
    client.data.level = doc?.level ?? STARTING_LEVEL;
    client.data.exp = doc?.exp ?? STARTING_EXP;
    client.data.strength = doc?.strength ?? STARTING_ATTRIBUTE;
    client.data.intelligence = doc?.intelligence ?? STARTING_ATTRIBUTE;
    client.data.wisdom = doc?.wisdom ?? STARTING_ATTRIBUTE;
    client.data.dexterity = doc?.dexterity ?? STARTING_ATTRIBUTE;
    client.data.constitution = doc?.constitution ?? STARTING_ATTRIBUTE;
    client.data.luck = doc?.luck ?? STARTING_ATTRIBUTE;
    client.data.canteenDrinks = doc?.canteenDrinks ?? CANTEEN_CAPACITY;
    client.data.hp = doc?.hp ?? STARTING_VITAL;
    client.data.maxHp = doc?.maxHp ?? STARTING_VITAL;
    client.data.mana = doc?.mana ?? STARTING_VITAL;
    client.data.maxMana = doc?.maxMana ?? STARTING_VITAL;
    client.data.mv = doc?.mv ?? STARTING_MV;
    client.data.maxMv = doc?.maxMv ?? STARTING_MV;
    client.data.bp = doc?.bp ?? 0;
    client.data.skills = doc?.skills ?? startingSkills(client.data.race);
    // Backfills any race-innate skill an EXISTING account is still
    // missing (e.g. created before a registration bug — now fixed — used
    // to skip granting the full starting kit at all). An innate ability
    // is something the race is simply born with, not something that
    // should require a fresh character to pick up.
    for (const innateSkill of RACE_INNATE_SKILLS[client.data.race] ?? []) {
      if (client.data.skills[innateSkill] === undefined) {
        client.data.skills = { ...client.data.skills, [innateSkill]: MAX_SKILL_PERCENT };
      }
    }
    client.data.inventory = doc?.inventory ?? [];
    // Every wizard carries a canteen (item 7) — backfilled here for any
    // existing account that doesn't have one yet, same "granted
    // retroactively on next login" treatment the race-innate skill
    // backfill above uses.
    if (!client.data.inventory.includes(CANTEEN_ITEM)) {
      client.data.inventory = [...client.data.inventory, CANTEEN_ITEM];
    }
    client.data.equipment = doc?.equipment ?? {};
    client.data.gold = doc?.gold ?? STARTING_GOLD;
    client.data.mimicableRaces = (doc?.mimicableRaces ?? []) as (Race | MonsterKind)[];
    client.data.mimicForm = (doc?.mimicForm ?? null) as (Race | MonsterKind) | null;
    client.data.deathCount = doc?.deathCount ?? 0;
    // Eating & drinking (a follow-up ask) — starts full for a brand new
    // character, backfilled to full for any existing one too (see
    // docker/postgres/init-postgres.sql's column DEFAULT, applied
    // retroactively by Postgres to every pre-existing row).
    client.data.hunger = doc?.hunger ?? MAX_HUNGER_THIRST;
    client.data.thirst = doc?.thirst ?? MAX_HUNGER_THIRST;
    client.data.quests = doc?.quests ?? {};
    // The Learn Spells quest's own timed reward — never persisted, same
    // tradeoff as wandLitUntil/celeritasActiveUntil (a fresh connection
    // always starts with it off, even mid-buff).
    client.data.enhancedLearningUntil = null;
    // Stacks across levels if never spent (a later follow-up ask) — see
    // handleAllocateStatPoint.
    client.data.statPointsAvailable = doc?.statPointsAvailable ?? 0;
    client.data.practicePointsAvailable = doc?.practicePointsAvailable ?? 0;
    // Never persisted — a fresh connection always starts awake, same as
    // the text game's own restState.
    client.data.restState = 'awake';
    client.data.sleepingInBed = false;
    // Never persisted — a fresh connection always starts standing still,
    // same tradeoff as restState.
    client.data.dancing = false;
    // Never persisted either — a fresh connection always starts off
    // cooldown.
    client.data.eatBrainsReadyAtTick = 0;
    // A torch already equipped from a previous session is treated as
    // freshly re-lit rather than remembering how far it had burned down —
    // torchRemainingMs isn't persisted, same tradeoff as everything else
    // here.
    client.data.torchRemainingMs = TORCH_LIFETIME_MS;
    client.data.torchLitAt = client.data.equipment.shield === TORCH_ITEM ? Date.now() : null;
    // Never persisted — a fresh connection always starts every skill off
    // cooldown, same tradeoff as restState/eatBrainsReadyAtTick above.
    client.data.skillCooldowns = {};
    // A wand never relights itself on reconnect (unlike a torch) — always
    // starts unlit; same tradeoff as restState.
    client.data.wandLit = false;
    client.data.wandLitUntil = null;
    // Same tradeoff again — celeritas never carries over either.
    client.data.celeritasActive = false;
    client.data.celeritasActiveUntil = null;
    // Same tradeoff again — scutum never carries over either.
    client.data.scutumActive = false;
    client.data.scutumActiveUntil = null;
    // Same tradeoff again — barrier never carries over either (its own
    // fixed-origin registry entry wouldn't survive a reconnect anyway).
    client.data.barrierActive = false;
    client.data.barrierActiveUntil = null;
    // Same tradeoff again — enhance damage never carries over either.
    client.data.enhanceDamageActive = false;
    client.data.enhanceDamageActiveUntil = null;
    // Same tradeoff again — wisp transformation never carries over either.
    client.data.wispActive = false;
    client.data.wispActiveUntil = null;
    // Same tradeoff again — invisibility never carries over either.
    client.data.invisibleActive = false;
    client.data.invisibleActiveUntil = null;
    // The secret room system (a follow-up ask) — persisted, unlike the
    // cooldowns above; loaded straight from the player doc, defaulting to
    // false for any character that predates this feature (every existing
    // character, Baltar included).
    client.data.secretDoorUnlocked = doc?.secretDoorUnlocked ?? false;
    client.data.secretChestUnlocked = doc?.secretChestUnlocked ?? false;
    client.data.mapUnlocked = doc?.mapUnlocked ?? false;
    // The house/specialization system (a follow-up ask) — persisted,
    // null until chosen (see handleChooseHouse/handleChooseSpecialization).
    client.data.house = doc?.house ?? null;
    client.data.specialization = doc?.specialization ?? null;
    client.data.visitedPois = doc?.visitedPois ?? [];
    client.data.killedMonsterKinds = doc?.killedMonsterKinds ?? [];

    this.worldManager.addPlayer(username, {
      race: client.data.race,
      gender: client.data.gender,
      hairColor: client.data.hairColor,
      skinTone: client.data.skinTone,
      mapName: client.data.map,
      row: client.data.row,
      col: client.data.col,
      level: client.data.level,
      exp: client.data.exp,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      mv: client.data.mv,
      maxMv: client.data.maxMv,
      bp: client.data.bp,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      luck: client.data.luck,
      canteenDrinks: client.data.canteenDrinks,
      skills: client.data.skills,
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      restState: client.data.restState,
      gold: client.data.gold,
      mimicableRaces: client.data.mimicableRaces,
      mimicForm: client.data.mimicForm,
      eatBrainsReadyAtTick: client.data.eatBrainsReadyAtTick,
      skillCooldowns: client.data.skillCooldowns,
      deathCount: client.data.deathCount,
      statPointsAvailable: client.data.statPointsAvailable,
      practicePointsAvailable: client.data.practicePointsAvailable,
      wandLit: client.data.wandLit,
      celeritasActive: client.data.celeritasActive,
      scutumActive: client.data.scutumActive,
      barrierActive: client.data.barrierActive,
      wispActive: client.data.wispActive,
      invisibleActive: client.data.invisibleActive,
      dancing: client.data.dancing,
    });
    void client.join(client.data.map);

    client.emit('sync', { player: this.snapshotFor(client) });
    // Every player should agree on the current time of day the instant
    // they connect, rather than waiting for the next 30-40s stat tick —
    // otherwise a fresh connection sits at the client's own "unknown yet"
    // default (see main.ts's worldTimeKnown) for up to that long.
    client.emit('worldTime', { hour: this.worldHour, tick: this.currentTick });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  async handleDisconnect(client: GameSocket): Promise<void> {
    const { username, map } = client.data;
    this.commandLimiters.delete(client.id);
    this.activeConnections.clearActiveSocketIfCurrent(username, client.id);

    if (this.worldManager.getLocation(username)) {
      await this.persistPosition(client);
    }
    this.worldManager.removePlayer(username);
    // "Lasts the entire time the player is logged in" — unlike a pet
    // (which persists across sessions), an animated monster is removed
    // the moment its owner disconnects.
    this.animatedMonsterManager.removeAllForOwner(username);

    if (map) {
      this.server.to(map).emit('map:state', this.mapStateFor(map));
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: GameSocket, @MessageBody() rawDirection: unknown): Promise<MoveAck> {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) {
      return { ok: false, player: this.snapshotFor(client), message: 'Slow down — too many moves.' };
    }

    if (this.isParalyzed(`player:${client.data.username}`)) {
      return { ok: false, player: this.snapshotFor(client), message: "You are paralyzed by a skeleton's glare and cannot move!" };
    }

    const parsed = directionSchema.safeParse(rawDirection);
    if (!parsed.success) {
      return { ok: false, player: this.snapshotFor(client), message: 'Unknown direction.' };
    }

    this.wakeIfNeeded(client);
    this.stopDancingIfNeeded(client);

    const { username } = client.data;

    // Town-entry gate — previewed with the same pure resolveMove the
    // actual move uses (no side effects), so an ungated player is turned
    // away at the gate without ever mutating their cached position.
    const loc = this.worldManager.getLocation(username);
    let preview: ReturnType<typeof resolveMove> | undefined;
    if (loc) {
      preview = resolveMove(loc, parsed.data);
      if (preview.ok && preview.transitioned && TOWN_MAPS.includes(preview.mapName) && !this.canEnterTown(client)) {
        return {
          ok: false,
          player: this.snapshotFor(client),
          message: `The guards of ${preview.mapName} bar your way — you need a weapon equipped to pass.`,
        };
      }
      // The secret room's own door (a follow-up ask) — locked per-player
      // until resera'd open (see handleCastResera); same "preview first,
      // no side effects" shape as the town gate above.
      if (preview.ok && preview.transitioned && preview.mapName === 'Caverna Secretissima' && !client.data.secretDoorUnlocked) {
        return { ok: false, player: this.snapshotFor(client), message: 'The door is locked.' };
      }
      // House gate (a follow-up ask: "the player should only be allowed
      // in their assigned common room/dorms... emberclaw students should
      // not be allowed in duskwing") — houseForMap returns undefined for
      // every map that isn't a house's own Common Room/Dorms, so this is
      // a no-op everywhere else.
      if (preview.ok && preview.transitioned) {
        const requiredHouse = houseForMap(preview.mapName);
        if (requiredHouse && client.data.house !== requiredHouse) {
          return { ok: false, player: this.snapshotFor(client), message: `Only ${requiredHouse} students may enter here.` };
        }
      }
      // Specialization chamber gate (a later follow-up ask: "players can
      // only enter the specialization room of what specialization they
      // have chosen") — same shape as the house gate above.
      if (preview.ok && preview.transitioned) {
        const requiredSpecialization = specializationForMap(preview.mapName);
        if (requiredSpecialization && client.data.specialization !== requiredSpecialization) {
          return { ok: false, player: this.snapshotFor(client), message: 'Only students of this specialization may enter here.' };
        }
      }
      // Barrier (a later follow-up ask: "the player will not be able to
      // leave the barrier while it is active") — the candidate tile has
      // to stay within the caster's OWN dome; recasting is still the only
      // way to drop it early (see handleCastBarrier).
      if (preview.ok) {
        const ownBarrier = this.activeBarriers.get(client.data.username);
        if (ownBarrier && (ownBarrier.mapName !== preview.mapName || !this.isWithinBarrierZone(preview.mapName, preview.row, preview.col))) {
          return { ok: false, player: this.snapshotFor(client), message: 'Your barrier holds you in place.' };
        }
      }
    }

    const result = this.worldManager.processMove(username, parsed.data);
    if (!result) {
      return { ok: false, player: this.snapshotFor(client), message: 'Your session was lost. Please reconnect.' };
    }

    if (!result.ok) {
      // A follow-up ask: "remove the 'You can't go that way' message for
      // the portals" — walking into one is still blocked (see
      // isPortalBlocked/isOccupied), but silently, since it's a
      // deliberately-solid piece of scenery rather than a mistake worth
      // narrating. `preview` (computed above for the town-gate check) is
      // the same in-bounds, pre-occupancy candidate tile the player was
      // trying to step onto, before isOccupied vetoed it.
      const blockedByPortal = preview?.ok && isPortalBlocked(preview.mapName, preview.row, preview.col);
      return blockedByPortal
        ? { ok: false, player: this.snapshotFor(client) }
        : { ok: false, player: this.snapshotFor(client), message: "You can't go that way." };
    }

    const previousMap = client.data.map;
    client.data.map = result.mapName;
    client.data.row = result.row;
    client.data.col = result.col;
    // Movement points (a later follow-up ask re-added this resource) —
    // floors at 0 rather than going negative or blocking the move.
    client.data.mv = Math.max(0, client.data.mv - MV_COST_PER_TILE);
    this.worldManager.updateState(username, { mv: client.data.mv });

    void this.persistPosition(client);

    if (result.transitioned) {
      void client.leave(previousMap);
      void client.join(result.mapName);
      this.server.to(previousMap).emit('map:state', this.mapStateFor(previousMap));
      // Recall's own "have I been there" gate (a later follow-up ask) —
      // marks a point of interest visited the first time the player ever
      // steps onto its own map.
      const recallPoint = recallPointForMap(result.mapName);
      if (recallPoint && !client.data.visitedPois.includes(recallPoint.id)) {
        client.data.visitedPois = [...client.data.visitedPois, recallPoint.id];
        void this.persistStats(client);
      }
    }
    const newMapState = this.mapStateFor(result.mapName);
    this.server.to(result.mapName).emit('map:state', newMapState);

    const message = result.transitioned ? `You enter ${result.mapName}.` : undefined;
    // mapState rides along on a transition (a follow-up bug fix — see
    // MoveAck's own doc comment for why the broadcast above alone isn't
    // enough).
    return { ok: true, player: this.snapshotFor(client), message, mapState: result.transitioned ? newMapState : undefined };
  }

  // Kill-count quest objectives (a follow-up ask's imp-extermination
  // quest, and any future one shaped like it) PLUS Summoner's own unique-
  // kind kill-tracking (a later follow-up ask: "once the player becomes
  // a Summoner, begin tracking all of the unique monsters that they
  // kill") — called from every monster-kill site (melee, wand bolt,
  // augue, the elemental bolts/kinetic strike/sap health via
  // resolveElementalBolt, the augue burn tick). Silent no-op once a
  // quest isn't active/already turned in/that objective's own target
  // count is already met AND the caster isn't a Summoner (or already has
  // this kind recorded), so this is safe to call unconditionally on
  // every kill.
  private recordMonsterKill(client: GameSocket, monsterKind: string): void {
    let changed = false;
    const quests = { ...client.data.quests };
    for (const quest of Object.values(QUESTS)) {
      const progress = quests[quest.id];
      if (!progress || progress.completedAt) continue;
      for (const objective of quest.objectives) {
        if (objective.kind !== 'killMonster' || objective.monsterKind !== monsterKind) continue;
        const current = progress.killCounts?.[objective.id] ?? 0;
        if (current >= (objective.count ?? 1)) continue;
        const nextCount = current + 1;
        quests[quest.id] = { ...progress, killCounts: { ...progress.killCounts, [objective.id]: nextCount } };
        changed = true;
        if (nextCount >= (objective.count ?? 1)) {
          this.systemMessage(client, `Quest objective complete: ${objective.label} (${quest.title})`);
        }
      }
    }
    if (client.data.specialization === 'summoner' && !client.data.killedMonsterKinds.includes(monsterKind)) {
      client.data.killedMonsterKinds = [...client.data.killedMonsterKinds, monsterKind];
      changed = true;
    }
    if (!changed) return;
    client.data.quests = quests;
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
  }

  // A right-click punch always plays its swing animation (broadcast via
  // the 'punch' event below) — but it only actually deals damage if an
  // NPC/monster/other player is standing exactly one tile ahead, in the
  // direction thrown ("basically touching" contact range). Whoever's
  // ahead (there can only ever be one occupant per tile — see
  // WorldManagerService's collision) takes the hit; a 'combat' event
  // carries the result to everyone sharing the map.
  @SubscribeMessage('punch')
  handlePunch(@ConnectedSocket() client: GameSocket, @MessageBody() rawDirection: unknown): void {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) return;

    if (this.isParalyzed(`player:${client.data.username}`)) {
      this.systemMessage(client, "You are paralyzed by a skeleton's glare and cannot attack!");
      return;
    }
    // Druid's own wisp transformation (a later follow-up ask) — "the
    // player should not be able to attack while in wisp form."
    if (client.data.wispActive) {
      this.systemMessage(client, "You can't attack while in wisp form.");
      return;
    }
    this.breakInvisibilityIfActive(client);

    const parsed = directionSchema.safeParse(rawDirection);
    if (!parsed.success) return;

    this.engageInDirection(client, parsed.data, this.attackGrowthSkill(client));
  }

  // The action-bar's explicit-skill counterpart to punch above — same
  // contact-range direction targeting, but names exactly which learned
  // skill to queue (bone finger strike, glare) instead of always
  // defaulting to punch/dagger.
  @SubscribeMessage('useSkill')
  handleUseSkill(@ConnectedSocket() client: GameSocket, @MessageBody() raw: unknown): void {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) return;

    const parsed = useSkillSchema.safeParse(raw);
    if (!parsed.success) return;
    if (client.data.skills[parsed.data.skill] === undefined) return;

    if (this.isParalyzed(`player:${client.data.username}`)) {
      this.systemMessage(client, "You are paralyzed by a skeleton's glare and cannot attack!");
      return;
    }
    if (client.data.wispActive) {
      this.systemMessage(client, "You can't attack while in wisp form.");
      return;
    }
    this.breakInvisibilityIfActive(client);

    const cooldownUntil = client.data.skillCooldowns[parsed.data.skill];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      this.systemMessage(client, `${parsed.data.skill} is still recharging (${secondsLeft}s left).`);
      return;
    }

    this.engageInDirection(client, parsed.data.direction, parsed.data.skill);
  }

  // The wand's own ranged auto-attack (a follow-up ask) — right-click
  // arms/refreshes a sustained combat session against the given target,
  // resolved automatically every combat tick (see combatTick's own
  // WAND_BOLT_SKILL branch/resolveRangedAutoAttack) for as long as the
  // target stays within WAND_BOLT_RANGE_TILES and the wand stays
  // equipped — no walking-into-melee-range involved, unlike
  // engageInDirection's own contact-only shape.
  @SubscribeMessage('engageRangedAttack')
  handleEngageRangedAttack(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) return { ok: false };
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to auto-attack at range.' };
    }
    if (this.isParalyzed(`player:${client.data.username}`)) {
      const message = "You are paralyzed by a skeleton's glare and cannot attack!";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (client.data.wispActive) {
      const message = "You can't attack while in wisp form.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    this.breakInvisibilityIfActive(client);
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid target.' };

    const targetLoc = this.locateCombatTarget(parsed.data.targetKind, parsed.data.targetId);
    if (!targetLoc || targetLoc.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, targetLoc.row, targetLoc.col, WAND_BOLT_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with your wand." };
    }

    this.playerCombat.set(client.data.username, {
      targetKind: parsed.data.targetKind,
      targetId: parsed.data.targetId,
      skill: WAND_BOLT_SKILL,
      missedTicks: 0,
      range: WAND_BOLT_RANGE_TILES,
    });
    if (parsed.data.targetKind === 'monster') {
      this.monsterManager.setAggro(parsed.data.targetId, client.data.username, this.combatTickCount);
    }
    return { ok: true };
  }

  // A later follow-up bug fix: "the imp did not start moving toward the
  // player when the player attacked" — fired once by WorldScene's
  // tryEngage the moment a melee approach STARTS (target not yet
  // adjacent), purely to arm the monster's own aggro immediately instead
  // of waiting for the player to close the entire distance alone and
  // throw an actual punch. No ack, no damage — just a cheap "start
  // chasing me back" signal.
  @SubscribeMessage('engageMelee')
  handleEngageMelee(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): void {
    const limiter = this.commandLimiters.get(client.id);
    if (limiter && !limiter.tryConsume()) return;
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success || parsed.data.targetKind !== 'monster') return;
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) return;
    this.monsterManager.setAggro(monster.id, client.data.username, this.combatTickCount);
  }

  // The 'x' hotkey (a later follow-up ask) — clears whatever combat
  // session (melee, via engageCombat, or ranged, via
  // handleEngageRangedAttack) is currently armed, whichever it is. Purely
  // stops the automatic every-tick attack loop; doesn't touch the
  // player's own target selection (client-side only).
  @SubscribeMessage('disengage')
  handleDisengage(@ConnectedSocket() client: GameSocket): void {
    this.playerCombat.delete(client.data.username);
  }

  // Starts a skill's cooldown (item 22) — only skills with an entry in
  // SKILL_COOLDOWN_MS have one at all (today, just Glare); called right
  // after a queued skill actually resolves (see resolveHitOnMonster/Npc/
  // Player), not at engage time, so spamming useSkill while a hit is
  // still pending doesn't start the clock early.
  // Every spell should honor its own learned skill percent (a later
  // follow-up ask: "Augue seems to be working every time" — several
  // spells were rolling no success check at all, always landing their
  // effect once cooldown/mana/range passed). Same (skill percent +
  // SPELL_CAST_SUCCESS_BONUS, capped at 100)% formula resera/lucem/
  // celeritas/irrigo already used — pulled out here now that it's about
  // to be reused by augue/stupefaciunt/exarme/scutum/murus lapideus too,
  // instead of copy-pasting the same two lines a 5th-9th time.
  private rollSpellSuccess(client: GameSocket, skill: string): boolean {
    const skillPercent = client.data.skills[skill] ?? STARTING_SKILL_PERCENT;
    // Intelligence/luck (a later follow-up ask) both nudge every spell's
    // own success chance: intelligence a flat +1% per point, luck a
    // CHANCE (luck x 10%) of an extra +10% for this one cast — see each
    // function's own doc comment in combat/formulas.ts.
    const intelligenceBonus = intelligenceSpellBonus(client.data.intelligence + intelligenceEquipmentBonus(client.data.equipment));
    const luckBonus = rollLuckSpellSuccessBonus(client.data.luck);
    // A later follow-up ask removed the new-player low-level handicap
    // bonus entirely (skill percent now starts at a flat 70% for
    // everything learned through the teacher click-to-learn modal, so the
    // extra training-wheels bonus is no longer needed).
    const successChance = Math.min(MAX_SKILL_PERCENT, skillPercent + SPELL_CAST_SUCCESS_BONUS + intelligenceBonus + luckBonus);
    return Math.random() * 100 < successChance;
  }

  private startSkillCooldown(client: GameSocket, skill: string): void {
    const durationMs = SKILL_COOLDOWN_MS[skill];
    if (durationMs === undefined) return;
    client.data.skillCooldowns = { ...client.data.skillCooldowns, [skill]: Date.now() + durationMs };
    this.worldManager.updateState(client.data.username, { skillCooldowns: client.data.skillCooldowns });
    // Without this, the client's own myProfile.skillCooldowns only ever
    // refreshed on the next full 'sync' (level-up, respawn, map change),
    // which could be minutes away — the action bar/Skills modal cooldown
    // wipe (item 5) silently never appeared in the meantime even though
    // the cooldown was very much real server-side.
    client.emit('sync', { player: this.snapshotFor(client) });
  }

  // Shared by punch/useSkill: throws the swing animation immediately
  // (instant, cosmetic feedback that the input landed) and, if an
  // NPC/monster/other player is standing exactly one tile ahead, arms or
  // refreshes a combat session with the given skill — the actual hit
  // isn't resolved here at all, only by the next combatTick (see item 6:
  // "only hits should be performed during the combat tick").
  private engageInDirection(client: GameSocket, direction: Direction, skill: string): void {
    this.wakeIfNeeded(client);
    this.server.to(client.data.map).emit('punch', { username: client.data.username, direction });

    const delta = DIRECTION_DELTAS[direction];
    const mapName = client.data.map;
    const targetRow = client.data.row + delta.dr;
    const targetCol = client.data.col + delta.dc;

    const monster = this.monsterManager.findMonsterAt(mapName, targetRow, targetCol);
    if (monster) {
      this.engageCombat(client, 'monster', monster.id, skill);
      return;
    }

    const npc = NPCS.find((n) => n.map === mapName && n.row === targetRow && n.col === targetCol);
    if (npc) {
      this.engageCombat(client, 'npc', npc.id, skill);
      return;
    }

    const targetUsername = this.worldManager.findPlayerAt(mapName, targetRow, targetCol, client.data.username);
    if (targetUsername) {
      this.engageCombat(client, 'player', targetUsername, skill);
    }
  }

  // Arms (or refreshes/retargets) this player's one active fight — see
  // playerCombat/CombatSession. Aggroes a targeted monster immediately
  // (item 5: it should start closing distance even before the first
  // tick's hit lands), refreshed again every tick contact continues (see
  // combatTick/resolveHitOnMonster).
  private engageCombat(client: GameSocket, targetKind: CombatSession['targetKind'], targetId: string, skill: string): void {
    this.playerCombat.set(client.data.username, { targetKind, targetId, skill, missedTicks: 0 });
    if (targetKind === 'monster') {
      this.monsterManager.setAggro(targetId, client.data.username, this.combatTickCount);
    }
  }

  // Where a live target actually is right now, for the adjacency check
  // below — undefined if it's gone (dead monster, disconnected player).
  private locateCombatTarget(kind: CombatSession['targetKind'], id: string): { mapName: MapName; row: number; col: number } | undefined {
    if (kind === 'monster') {
      const monster = this.monsterManager.getMonster(id);
      return monster ? { mapName: monster.mapName, row: monster.row, col: monster.col } : undefined;
    }
    if (kind === 'npc') {
      const npc = NPCS.find((n) => n.id === id);
      return npc ? { mapName: npc.map, row: npc.row, col: npc.col } : undefined;
    }
    const loc = this.worldManager.getLocation(id);
    return loc ? { mapName: loc.mapName, row: loc.row, col: loc.col } : undefined;
  }

  // Fired once per shared MONSTER_TICK_INTERVAL_MS (~3s) — the only place
  // that ever resolves actual combat damage now (item 6). Each active
  // session gets at most one resolved hit per tick, only if its target is
  // still alive/connected and adjacent; otherwise its miss streak grows
  // until it quietly disengages (COMBAT_DISENGAGE_TICKS).
  private combatTick(): void {
    for (const [username, session] of this.playerCombat) {
      const socketId = this.activeConnections.getActiveSocketId(username);
      const client = socketId ? (this.server.sockets.sockets.get(socketId) as GameSocket | undefined) : undefined;
      if (!client) {
        this.playerCombat.delete(username);
        continue;
      }
      if (this.isParalyzed(`player:${username}`)) continue;

      const targetLoc = this.locateCombatTarget(session.targetKind, session.targetId);
      // Melee (session.range undefined) keeps its EXACT original check —
      // Manhattan distance 1, cardinal-adjacent only, no diagonals — so
      // this doesn't change existing punch/dagger/bone-finger/glare
      // behavior at all. A ranged session (session.range set — today only
      // WAND_BOLT_SKILL) instead uses a square radius, same shape as
      // shared/lighting.ts's isWithinRadius.
      const inRange =
        targetLoc !== undefined &&
        targetLoc.mapName === client.data.map &&
        (session.range === undefined
          ? Math.abs(targetLoc.row - client.data.row) + Math.abs(targetLoc.col - client.data.col) === 1
          : Math.abs(targetLoc.row - client.data.row) <= session.range && Math.abs(targetLoc.col - client.data.col) <= session.range);

      if (!inRange) {
        // A monster target that's STILL actively chasing this exact
        // player (see MonsterManagerService.wanderAll's own aggro-based
        // stepping) is a fight still in progress, not a lapsed one — its
        // own AGGRO_TIMEOUT_TICKS already governs how long it keeps
        // trying, so COMBAT_DISENGAGE_TICKS only applies here for
        // npc/player targets (nothing chases you back) or once the
        // monster itself gives up.
        const monsterStillChasing = session.targetKind === 'monster' && this.monsterManager.isAggroedOnto(session.targetId, username);
        if (!monsterStillChasing) {
          session.missedTicks += 1;
          if (session.missedTicks >= COMBAT_DISENGAGE_TICKS) this.playerCombat.delete(username);
        }
        continue;
      }
      session.missedTicks = 0;

      // The wand's own ranged auto-attack (a follow-up ask) resolves
      // through its own self-contained path — flat damage, no dodge/
      // parry/counter-attack, and it auto-cancels the instant the wand
      // comes off (this is checked HERE, every tick, rather than only at
      // engage time, since "auto attack every combat tick unless
      // something else would prevent it" explicitly covers unequipping
      // mid-fight) — rather than threading a whole new damage shape
      // through resolveHitOnMonster/Npc/Player, which are tuned for
      // melee's own formula/avoidance/counter-attack rules.
      if (session.skill === WAND_BOLT_SKILL) {
        if (!isWandItem(client.data.equipment.weapon)) {
          this.playerCombat.delete(username);
          continue;
        }
        this.resolveRangedAutoAttack(client, session);
        continue;
      }

      if (session.targetKind === 'monster') {
        const monster = this.monsterManager.getMonster(session.targetId);
        if (!monster) {
          this.playerCombat.delete(username);
          continue;
        }
        this.monsterManager.setAggro(monster.id, username, this.combatTickCount);
        this.resolveHitOnMonster(client, monster, session.skill);
      } else if (session.targetKind === 'npc') {
        const npc = NPCS.find((n) => n.id === session.targetId);
        if (!npc) {
          this.playerCombat.delete(username);
          continue;
        }
        this.resolveHitOnNpc(client, npc, session.skill);
      } else {
        void this.resolveHitOnPlayer(client, session.targetId, session.skill);
      }
    }
  }

  // A successful augue's own lingering burn (a follow-up ask) — 1 extra
  // damage per combat tick for AUGUE_BURN_TICKS ticks, same "self-
  // contained, no dodge/counter-attack" shape resolveRangedAutoAttack
  // uses, since the caster may well have disconnected by the time a
  // later tick fires (in which case the kill still happens, just without
  // an exp grant to award).
  private tickAugueBurns(): void {
    if (this.augueBurns.length === 0) return;
    const stillBurning: typeof this.augueBurns = [];
    for (const burn of this.augueBurns) {
      let label: string;
      let targetHp: number;
      let targetMaxHp: number;
      let died: boolean;

      if (burn.targetKind === 'monster') {
        const monster = this.monsterManager.getMonster(burn.targetId);
        if (!monster || monster.mapName !== burn.mapName) continue; // gone — drop the burn silently
        const result = this.monsterManager.applyDamage(monster.id, AUGUE_BURN_DAMAGE_PER_TICK);
        if (!result) continue;
        label = monster.kind;
        targetHp = result.monster.hp;
        targetMaxHp = monster.maxHp;
        died = result.died;
        if (died) {
          const casterSocketId = this.activeConnections.getActiveSocketId(burn.casterUsername);
          const casterSocket = casterSocketId ? (this.server.sockets.sockets.get(casterSocketId) as GameSocket | undefined) : undefined;
          if (casterSocket) {
            const rawExpGained = expGainFor(monster.expReward, casterSocket.data.level, monster.level);
            this.grantExp(casterSocket, rawExpGained);
            void this.persistStats(casterSocket);
            casterSocket.emit('sync', { player: this.snapshotFor(casterSocket) });
            this.recordMonsterKill(casterSocket, monster.kind);
          }
          const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
          this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, burn.casterUsername, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
        }
      } else {
        const npc = NPCS.find((n) => n.id === burn.targetId && n.map === burn.mapName);
        if (!npc) continue;
        npc.hp = Math.max(0, npc.hp - AUGUE_BURN_DAMAGE_PER_TICK);
        label = npc.label ?? 'training dummy';
        died = npc.hp <= 0;
        if (died) {
          if (!npc.immortal) {
            this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
            const tile = this.randomFreeTileFor(npc.map);
            npc.row = tile.row;
            npc.col = tile.col;
          } else if (npc.carriedItems) {
            npc.carriedItems = ['wooden club'];
          }
          npc.hp = npc.maxHp;
        }
        targetHp = npc.hp;
        targetMaxHp = npc.maxHp;
      }

      const message = died
        ? `Lingering flames from ${burn.spellLabel} finish off the ${label} for ${AUGUE_BURN_DAMAGE_PER_TICK} damage!`
        : `Lingering flames from ${burn.spellLabel} burn the ${label} for ${AUGUE_BURN_DAMAGE_PER_TICK} damage. (${targetHp}/${targetMaxHp} hp)`;
      this.server.to(burn.mapName).emit('combatNotice', message);
      this.server.to(burn.mapName).emit('map:state', this.mapStateFor(burn.mapName));

      const ticksRemaining = burn.ticksRemaining - 1;
      if (!died && ticksRemaining > 0) stillBurning.push({ ...burn, ticksRemaining });
    }
    this.augueBurns = stillBurning;
  }

  // The 'z' hotkey's own follow-through (a later follow-up ask): once a
  // commanded pet/animated monster reports contact (see PetManagerService/
  // AnimatedMonsterManagerService's own tickAll), (1) starts the OWNER's
  // own auto-attack on the same target if they aren't already fighting
  // anything, and (2) for a MONSTER target only, has the follower deal its
  // own flat damage — same "simplified, no dodge/counter-attack" shape
  // tickAugueBurns/resolveRangedAutoAttack already use. A player target
  // just gets the escort/engage half (1) — followers don't independently
  // damage another player, matching this project's existing "PvP wand
  // bolts aren't part of this ask" scope limit on every other simplified
  // auto-damage path (see resolveRangedAutoAttack's own doc comment).
  private resolveFollowerContact(
    ownerUsername: string,
    targetKind: 'monster' | 'player',
    targetId: string,
    followerType: 'pet' | 'animatedMonster',
    animatedMonsterId?: string
  ): void {
    const socketId = this.activeConnections.getActiveSocketId(ownerUsername);
    const client = socketId ? (this.server.sockets.sockets.get(socketId) as GameSocket | undefined) : undefined;
    if (!client) return;

    if (!this.playerCombat.has(ownerUsername)) {
      this.engageCombat(client, targetKind, targetId, this.attackGrowthSkill(client));
    }

    if (targetKind !== 'monster') return;
    const monster = this.monsterManager.getMonster(targetId);
    if (!monster) return;

    const pet = followerType === 'pet' ? this.petManager.getSnapshotForOwner(ownerUsername) : undefined;
    const animatedMonster =
      followerType === 'animatedMonster' ? this.animatedMonsterManager.getSnapshotsForOwner(ownerUsername).find((m) => m.id === animatedMonsterId) : undefined;
    // Phase C's "give/equip" ask — a weapon equipped on a follower (see
    // shared/pets.ts's FOLLOWER_EQUIPMENT_SLOTS) adds a flat damage bonus
    // on top of its own base attack. Armor sits in equipment too but has
    // no effect here — no monster in this game currently damages a
    // follower back at all (applyDamage on either manager is never called
    // from any monster-attack path), so there's nothing for armor to
    // reduce yet; wiring monster-vs-follower retaliation is a separate,
    // materially bigger combat-AI feature this ask didn't cover.
    const weaponBonus = (pet?.equipment.weapon ?? animatedMonster?.equipment.weapon) ? FOLLOWER_WEAPON_DAMAGE_BONUS : 0;
    const damage = (followerType === 'pet' ? PET_ATTACK_DAMAGE + (pet?.attackDamageBonus ?? 0) : (animatedMonster?.attackDamage ?? 0)) + weaponBonus;
    if (damage <= 0) return;
    const followerLabel = followerType === 'pet' ? (pet?.name ?? 'Your pet') : (animatedMonster?.name ?? 'Your ally');

    const result = this.monsterManager.applyDamage(monster.id, damage);
    if (!result) return;

    if (result.died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      this.grantExp(client, rawExpGained);
      // Phase C's "pet evolution" ask — the pet earns its own exp from
      // its own kills, on the same curve/level-up path as the player
      // (see PetManagerService.grantExp), evolving once it crosses
      // PET_EVOLUTION_LEVEL.
      if (followerType === 'pet') {
        const petGrant = this.petManager.grantExp(ownerUsername, rawExpGained);
        if (petGrant?.evolved) {
          this.server.to(client.data.map).emit('combatNotice', `${followerLabel} has evolved into a ${petGrant.pet.name}!`);
        }
      }
      const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
      this.corpseManager.spawn(
        monster.kind,
        monster.level,
        items,
        monster.mapName,
        monster.row,
        monster.col,
        ownerUsername,
        monster.goldReward,
        monster.maxHp,
        monster.attackDamage ?? 0
      );
      this.recordMonsterKill(client, monster.kind);
      this.playerCombat.delete(ownerUsername);
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.server.to(client.data.map).emit('combatNotice', `${followerLabel} finishes off the ${monster.kind} for ${damage} damage! (+${rawExpGained} exp)`);
    } else {
      this.server.to(client.data.map).emit('combatNotice', `${followerLabel} strikes the ${monster.kind} for ${damage} damage.`);
    }
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  // The wand's ranged basic attack (a follow-up ask) — flat
  // WAND_BOLT_DAMAGE, no dodge/parry/shield-block, no counter-attack (a
  // bolt fired from up to 7 tiles away doesn't give the target a chance
  // to retaliate in melee). Monster kills still grant the usual exp/mana-
  // crystal drop; NPC/scarecrow and player targets follow the same
  // simplified shape handleCastAugue's own target-kind branches use.
  private resolveRangedAutoAttack(client: GameSocket, session: CombatSession): void {
    // Battlemage's own "enhanced damage" (a later follow-up ask) — same
    // chance-based roll (and growth-on-every-attack, hit or miss) as the
    // melee path in rollExtraAttacks.
    let battlemageDamageBonus = 0;
    if (client.data.skills[BATTLEMAGE_ENHANCED_DAMAGE_SKILL] !== undefined) {
      const battlemageGrowth = this.maybeGrowSkill(client, BATTLEMAGE_ENHANCED_DAMAGE_SKILL);
      if (battlemageGrowth) this.systemMessage(client, battlemageGrowth);
      if (Math.random() < computeExtraAttackChance(client.data.skills[BATTLEMAGE_ENHANCED_DAMAGE_SKILL])) {
        battlemageDamageBonus = BATTLEMAGE_ENHANCED_DAMAGE_BONUS;
      }
    }
    // A follow-up ask: "every point into intelligence also increases
    // ranged damage with a wand" — a flat +1 damage per point on top of
    // the base WAND_BOLT_DAMAGE.
    const baseWandBoltDamage =
      WAND_BOLT_DAMAGE +
      client.data.intelligence +
      intelligenceEquipmentBonus(client.data.equipment) +
      (client.data.enhanceDamageActive ? SHAMAN_ENHANCE_DAMAGE_BONUS : 0) +
      battlemageDamageBonus;
    // Cleric's own "enhanced undead damage" (a later follow-up ask) — the
    // TARGET's own classification isn't known until each branch below
    // resolves it, so this shadows baseWandBoltDamage with the final
    // per-target figure rather than folding it into the constant above.
    const enhancedUndeadDamageBonus = client.data.skills[ENHANCED_UNDEAD_DAMAGE_SKILL] !== undefined ? ENHANCED_UNDEAD_DAMAGE_BONUS : 0;
    if (session.targetKind === 'monster') {
      const monster = this.monsterManager.getMonster(session.targetId);
      if (!monster) {
        this.playerCombat.delete(client.data.username);
        return;
      }
      const wandBoltDamage = baseWandBoltDamage + (monster.monsterClass === 'undead' ? enhancedUndeadDamageBonus : 0);
      this.monsterManager.setAggro(monster.id, client.data.username, this.combatTickCount);
      const result = this.monsterManager.applyDamage(monster.id, wandBoltDamage);
      if (!result) return;

      let expGained: number | undefined;
      let leveledUp = false;
      if (result.died) {
        const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
        const grantResult = this.grantExp(client, rawExpGained);
        leveledUp = grantResult.leveledUp;
        expGained = grantResult.message ? undefined : rawExpGained;
        const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
        this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
        this.recordMonsterKill(client, monster.kind);
        this.playerCombat.delete(client.data.username);
      }
      const message = result.died
        ? `${client.data.username}'s wand bolt strikes the ${monster.kind} for ${wandBoltDamage} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
        : `${client.data.username}'s wand bolt strikes the ${monster.kind} for ${wandBoltDamage} damage.`;
      void this.persistStats(client);
      this.emitCombat(client, {
        targetKind: 'monster',
        target: monster.id,
        targetLabel: monster.kind,
        damage: wandBoltDamage,
        targetHp: result.monster.hp,
        targetMaxHp: monster.maxHp,
        targetDied: result.died,
        expGained,
        leveledUp,
        message,
        skill: WAND_BOLT_SKILL,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return;
    }

    if (session.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === session.targetId);
      if (!npc) {
        this.playerCombat.delete(client.data.username);
        return;
      }
      const wandBoltDamage = baseWandBoltDamage + (npc.race === 'skeleton' ? enhancedUndeadDamageBonus : 0);
      npc.hp = Math.max(0, npc.hp - wandBoltDamage);
      const died = npc.hp <= 0;
      const label = npc.label ?? 'training dummy';
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
        } else if (npc.carriedItems) {
          // A follow-up bug fix: this wand-bolt kill path (unlike
          // resolveHitOnNpc's own melee path) never re-armed the
          // training skeleton's club on respawn — see that method's own
          // comment for why this needs to happen at every "npc died and
          // reset" site, not just one.
          npc.carriedItems = ['wooden club'];
        }
        npc.hp = npc.maxHp;
        // A follow-up bug fix: "killed the training skeleton, [it] reset
        // its hp back to full, but the player was still auto attacking"
        // — this delete used to live ONLY inside the `!npc.immortal`
        // branch above, so a wand-bolt kill of an IMMORTAL npc (the
        // training skeleton always is) never actually stopped the
        // session, unlike resolveHitOnNpc's own melee path (already
        // fixed the same way). Unconditional now, covering both cases.
        this.playerCombat.delete(client.data.username);
      }
      const message = died
        ? npc.immortal
          ? `${client.data.username}'s wand bolt strikes the ${label} for ${wandBoltDamage} damage — it shrugs off the blow, unharmed.`
          : `${client.data.username}'s wand bolt strikes the ${label} for ${wandBoltDamage} damage, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username}'s wand bolt strikes the ${label} for ${wandBoltDamage} damage.`;
      void this.persistStats(client);
      this.emitCombat(client, {
        targetKind: 'npc',
        target: npc.id,
        targetLabel: label,
        damage: wandBoltDamage,
        targetHp: npc.hp,
        targetMaxHp: npc.maxHp,
        targetDied: died,
        message,
        skill: WAND_BOLT_SKILL,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return;
    }

    // PvP wand bolts aren't part of this ask ("shoots a little bolt at
    // the imp target") — monster/scarecrow only for now, same scope
    // limit augue's own targetKind guard already has.
    this.playerCombat.delete(client.data.username);
  }

  // Resolves exactly one combat tick's worth of hit(s) on a monster —
  // called only from combatTick (item 6). `skillName` picks the damage
  // shape: bone finger strike is its own single-swing formula (item 1);
  // anything else (punch/dagger/glare) is the player's ordinary swing(s),
  // glare additionally paralyzing the monster so it skips THIS tick's own
  // counter (item 14) rather than being an automatic side effect of every
  // hit.
  private resolveHitOnMonster(client: GameSocket, monster: Monster, skillName: string): void {
    if (skillName === GLARE_SKILL) this.startSkillCooldown(client, GLARE_SKILL);
    const growthMessages: string[] = [];
    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const weaponBonus = weaponBonusFor(client.data.equipment, client.data.skills);
    // Monsters carry weapon/shield-shaped loot but never "wear" it for AC
    // purposes — just their own base+dexterity AC (item 18).
    const monsterAC = armorClassFor(monster.dexterity, 0);

    let totalDamage = 0;
    let died = false;
    let currentHp = monster.hp;

    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      const basePunchDamage = punchDamage(this.attackerStatsFor(client), monster, attackSkillPercent, weaponBonus, monsterAC);
      const boneSkillPercent = client.data.skills[BONE_FINGER_STRIKE_SKILL] ?? STARTING_SKILL_PERCENT;
      const swingDamage = computeBoneFingerStrikeDamage(basePunchDamage, boneSkillPercent);
      const result = this.monsterManager.applyDamage(monster.id, swingDamage);
      if (result) {
        totalDamage = swingDamage;
        currentHp = result.monster.hp;
        died = result.died;
      }
      const skillGrowth = this.maybeGrowSkill(client, BONE_FINGER_STRIKE_SKILL);
      if (skillGrowth) growthMessages.push(skillGrowth);
    } else {
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages, monster.monsterClass === 'undead');
      for (let i = 0; i < swings; i++) {
        const swingDamage = punchDamage(this.attackerStatsFor(client), monster, attackSkillPercent, weaponBonus, monsterAC) + enhancedBonus;
        const result = this.monsterManager.applyDamage(monster.id, swingDamage);
        if (!result) break;
        totalDamage += swingDamage;
        currentHp = result.monster.hp;
        died = result.died;
        if (died) break;
      }
      const attackGrowth = this.maybeGrowSkill(client, attackSkill);
      if (attackGrowth) growthMessages.push(attackGrowth);
    }

    let expGained: number | undefined;
    let leveledUp = false;
    if (died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      // A capped goblin's message means the nominal reward wasn't (fully)
      // applied — showing "+X exp" would be misleading, so the cap
      // message stands in for it instead.
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      // A mana crystal instead of a body part now (a follow-up ask) —
      // scaled to the monster's own level (see manaCrystalForLevel);
      // lootable, no mechanical use yet.
      const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
      this.recordMonsterKill(client, monster.kind);
      this.playerCombat.delete(client.data.username);
    }
    this.maybeGrowResistanceSkill(client, monster.monsterClass, growthMessages);

    let message: string;
    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      message = died
        ? `${client.data.username}'s bone finger strike hits the ${monster.kind} for ${totalDamage} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
        : `${client.data.username}'s bone finger strike hits the ${monster.kind} for ${totalDamage} damage.`;
    } else {
      const verb = this.attackVerb(client);
      message = died
        ? `${client.data.username} ${verb} the ${monster.kind} for ${totalDamage} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
        : `${client.data.username} ${verb} the ${monster.kind} for ${totalDamage} damage.`;
    }

    if (!died) {
      const paralysisKey = `monster:${monster.id}`;
      let counterMessage: string;
      if (skillName === GLARE_SKILL) {
        const wasParalyzed = this.isParalyzed(paralysisKey);
        this.applyGlare(client, paralysisKey);
        counterMessage = wasParalyzed
          ? `The ${monster.kind} is still paralyzed by your glare and cannot counter-attack!`
          : `Your glare paralyzes the ${monster.kind}, freezing it before it can retaliate!`;
      } else if (this.isParalyzed(paralysisKey)) {
        counterMessage = `The ${monster.kind} is paralyzed by your glare and cannot counter-attack!`;
      } else {
        counterMessage = this.resolveMonsterCounterAttack(client, monster, monster.kind, monster.monsterClass, growthMessages, monster);
        // So resolveMonsterInitiatedAttack's own tick doesn't ALSO hit
        // this same monster's target again a moment later — this counter
        // already covers this tick's exchange.
        monster.lastCounterAttackTick = this.combatTickCount;
      }
      message += ` ${counterMessage}`;
    }
    void this.persistStats(client);

    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage: totalDamage,
      targetHp: currentHp,
      targetMaxHp: monster.maxHp,
      targetDied: died,
      expGained,
      leveledUp,
      message,
      growthMessages,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  // Anywhere on a map that isn't a wall/exit tile and isn't already
  // occupied by a player, monster, or another NPC — used to relocate the
  // training dummy after it "dies" (see resolveHitOnNpc) instead of just
  // resetting it in place.
  private randomFreeTileFor(mapName: MapName): { row: number; col: number } {
    const map = getMap(mapName);
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = Math.floor(Math.random() * map.cols);
      if (map.exits.some((e) => e.row === row && e.col === col)) continue;
      if (this.worldManager.isPlayerAt(mapName, row, col)) continue;
      if (this.monsterManager.isOccupied(mapName, row, col)) continue;
      if (NPCS.some((n) => n.map === mapName && n.row === row && n.col === col)) continue;
      return { row, col };
    }
    return { row: Math.floor(map.rows / 2), col: Math.floor(map.cols / 2) };
  }

  // Same skillName dispatch as resolveHitOnMonster, against the training
  // dummy — see that method's own doc comment for the shared reasoning.
  private resolveHitOnNpc(client: GameSocket, npc: (typeof NPCS)[number], skillName: string): void {
    if (skillName === GLARE_SKILL) this.startSkillCooldown(client, GLARE_SKILL);
    // A follow-up ask's practice scarecrows (npc.immortal) share this same
    // NPC combat path but skip the corpse/relocate/counter-attack below
    // entirely — a true passive damage sink, not "a punching bag that
    // occasionally fights back and moves," which the ORIGINAL Great
    // Plains training dummy still does unchanged.
    const label = npc.label ?? 'training dummy';
    // The training dummy has the same starting attributes as a brand-new
    // player (see combat/formulas.ts) — it's "a player as well" for
    // damage-formula purposes ("the test player"). It still grants no
    // exp (treating a "kill" as a real player kill would make it an
    // infinite, risk-free exp farm — it's a practice target, not a real
    // fight), but it now leaves an actual (player-kind, so TTL'd) corpse
    // behind — always carrying a bone dagger — and relocates to a random
    // free tile on its map at full hp, rather than instantly resetting in
    // place.
    const defenderStats: CombatantStats = {
      level: npc.level,
      strength: STARTING_ATTRIBUTE,
      intelligence: STARTING_ATTRIBUTE,
      wisdom: STARTING_ATTRIBUTE,
      dexterity: STARTING_ATTRIBUTE,
      constitution: STARTING_ATTRIBUTE,
      luck: STARTING_ATTRIBUTE,
    };
    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const growthMessages: string[] = [];
    // A dummy's base AC only — it doesn't equip anything (item 18).
    const npcAC = armorClassFor(STARTING_ATTRIBUTE, 0);

    // The dummy has no equipment/learned skills of its own to defend with
    // — it can still dodge (a flat, skill-less roll), but never parries
    // or shield-blocks (both require gear it doesn't have).
    let totalDamage = 0;
    let died = false;
    let avoided = false;
    let avoidVerb: string | undefined;

    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      const basePunchDamage = punchDamage(
        this.attackerStatsFor(client),
        defenderStats,
        attackSkillPercent,
        weaponBonusFor(client.data.equipment, client.data.skills),
        npcAC
      );
      const boneSkillPercent = client.data.skills[BONE_FINGER_STRIKE_SKILL] ?? STARTING_SKILL_PERCENT;
      const swingDamage = computeBoneFingerStrikeDamage(basePunchDamage, boneSkillPercent);
      const defense = this.resolveDefense(defenderStats, {}, {}, this.attackerStatsFor(client));
      if (defense.avoided) {
        avoided = true;
        avoidVerb = defense.verb;
      } else {
        totalDamage = swingDamage;
        npc.hp = Math.max(0, npc.hp - swingDamage);
        died = npc.hp <= 0;
      }
      const skillGrowth = this.maybeGrowSkill(client, BONE_FINGER_STRIKE_SKILL);
      if (skillGrowth) growthMessages.push(skillGrowth);
    } else {
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages, npc.race === 'skeleton');
      for (let i = 0; i < swings; i++) {
        const swingDamage =
          punchDamage(
            this.attackerStatsFor(client),
            defenderStats,
            attackSkillPercent,
            weaponBonusFor(client.data.equipment, client.data.skills),
            npcAC
          ) + enhancedBonus;
        const defense = this.resolveDefense(defenderStats, {}, {}, this.attackerStatsFor(client));
        if (!defense.avoided) {
          totalDamage += swingDamage;
          npc.hp = Math.max(0, npc.hp - swingDamage);
          died = npc.hp <= 0;
        }
        if (died) break;
      }
      const attackGrowth = this.maybeGrowSkill(client, attackSkill);
      if (attackGrowth) growthMessages.push(attackGrowth);
    }

    if (died && npc.immortal) {
      // A practice scarecrow just shrugs it off and resets in place — no
      // corpse, no relocating, no "defeating" anything.
      npc.hp = npc.maxHp;
      // A follow-up ask: "every time the training skeleton respawns after
      // being killed, equip the club to them again" — exarme (see
      // handleCastExarme) can strip its carriedItems entirely; this
      // immortal-reset moment IS this NPC's own "respawn," so it's the
      // right place to re-arm it. Only NPCs that started out carrying
      // something get one back (npc.carriedItems is absent, not just
      // empty, for every NPC never meant to carry anything).
      if (npc.carriedItems) npc.carriedItems = ['wooden club'];
    } else if (died) {
      // No killedBy, deliberately — same "not a real kill" reasoning as
      // the no-exp rule above: an ever-respawning dummy would otherwise
      // make a zombie's Eat Brains cooldown meaningless (free heal on
      // demand instead of an actual reward for a real kill).
      this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
      const tile = this.randomFreeTileFor(npc.map);
      npc.row = tile.row;
      npc.col = tile.col;
      npc.hp = npc.maxHp;
    }
    // A follow-up bug fix: "when the player kills a training skeleton,
    // have them stop fighting it automatically... select it again and
    // begin fighting again" — every OTHER kill path (monsters, real
    // players) already clears the auto-attack session on death; this one
    // didn't, so combatTick just kept re-finding the same npc.id (reset
    // to full hp, possibly relocated) and resumed swinging at it
    // unattended.
    if (died) this.playerCombat.delete(client.data.username);

    let message: string;
    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      message = avoided
        ? `${client.data.username}'s bone finger strike misses the ${label} — it ${avoidVerb}s out of the way!`
        : died
          ? npc.immortal
            ? `${client.data.username}'s bone finger strike hits the ${label} for ${totalDamage} damage — it shrugs off the blow, unharmed.`
            : `${client.data.username}'s bone finger strike hits the ${label} for ${totalDamage} damage, defeating it! It leaves a corpse and reappears elsewhere.`
          : `${client.data.username}'s bone finger strike hits the ${label} for ${totalDamage} damage.`;
    } else {
      const verb = this.attackVerb(client);
      message = died
        ? npc.immortal
          ? `${client.data.username} ${verb} the ${label} for ${totalDamage} damage — it shrugs off the blow, unharmed.`
          : `${client.data.username} ${verb} the ${label} for ${totalDamage} damage, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username} ${verb} the ${label} for ${totalDamage} damage.`;
    }

    // A scarecrow never fights back — a true passive damage sink, unlike
    // the original training dummy's own dodge/parry/counter-attack.
    if (!died && !npc.immortal) {
      const paralysisKey = `npc:${npc.id}`;
      let counterMessage: string;
      if (skillName === GLARE_SKILL) {
        const wasParalyzed = this.isParalyzed(paralysisKey);
        this.applyGlare(client, paralysisKey);
        counterMessage = wasParalyzed
          ? `The ${label} is still paralyzed by your glare and cannot counter-attack!`
          : `Your glare paralyzes the ${label}, freezing it before it can retaliate!`;
      } else if (this.isParalyzed(paralysisKey)) {
        counterMessage = `The ${label} is paralyzed by your glare and cannot counter-attack!`;
      } else {
        counterMessage = this.resolveMonsterCounterAttack(client, defenderStats, label, undefined, growthMessages);
      }
      message += ` ${counterMessage}`;
    }
    void this.persistStats(client);

    this.emitCombat(client, {
      targetKind: 'npc',
      target: npc.id,
      targetLabel: label,
      damage: totalDamage,
      targetHp: npc.hp,
      targetMaxHp: npc.maxHp,
      targetDied: died,
      message,
      growthMessages,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  // Same skillName dispatch as resolveHitOnMonster/resolveHitOnNpc, for
  // PvP — see resolveHitOnMonster's doc comment for the shared reasoning.
  private async resolveHitOnPlayer(client: GameSocket, targetUsername: string, skillName: string): Promise<void> {
    if (skillName === GLARE_SKILL) this.startSkillCooldown(client, GLARE_SKILL);
    const targetSocketId = this.activeConnections.getActiveSocketId(targetUsername);
    const targetClient = targetSocketId ? (this.server.sockets.sockets.get(targetSocketId) as GameSocket | undefined) : undefined;
    // Extremely rare (disconnected between the occupancy check and here) —
    // just no-op rather than crashing on a stats lookup that no longer exists.
    if (!targetClient) {
      this.playerCombat.delete(client.data.username);
      return;
    }

    // Being attacked always wakes/stands a sleeping or resting player up
    // — same as the attacker's own wakeIfNeeded on move/punch, but here
    // it's the DEFENDER who's forced awake by someone else's action.
    this.wakeIfNeeded(targetClient);

    const defenderStats = this.attackerStatsFor(targetClient);
    const attackSkill = this.attackGrowthSkill(client);
    const attackSkillPercent = client.data.skills[attackSkill] ?? STARTING_SKILL_PERCENT;
    const growthMessages: string[] = [];
    const defenderAC = armorClassFor(targetClient.data.dexterity + dexterityEquipmentBonus(targetClient.data.equipment), armorEquipmentBonus(targetClient.data.equipment));

    let damage = 0;
    let avoidedVerb: string | undefined;

    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      const basePunchDamage = punchDamage(
        this.attackerStatsFor(client),
        defenderStats,
        attackSkillPercent,
        weaponBonusFor(client.data.equipment, client.data.skills),
        defenderAC
      );
      const boneSkillPercent = client.data.skills[BONE_FINGER_STRIKE_SKILL] ?? STARTING_SKILL_PERCENT;
      const swingDamage = computeBoneFingerStrikeDamage(basePunchDamage, boneSkillPercent);
      const defense = this.resolveDefense(defenderStats, targetClient.data.skills, targetClient.data.equipment, this.attackerStatsFor(client));
      if (defense.skill) {
        const defenseGrowth = this.maybeGrowSkill(targetClient, defense.skill);
        if (defenseGrowth) growthMessages.push(defenseGrowth);
      }
      if (defense.avoided) {
        avoidedVerb = defense.verb;
      } else {
        damage = swingDamage;
      }
      const skillGrowth = this.maybeGrowSkill(client, BONE_FINGER_STRIKE_SKILL);
      if (skillGrowth) growthMessages.push(skillGrowth);
    } else {
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages, targetClient.data.race === 'skeleton');
      for (let i = 0; i < swings; i++) {
        const swingDamage =
          punchDamage(
            this.attackerStatsFor(client),
            defenderStats,
            attackSkillPercent,
            weaponBonusFor(client.data.equipment, client.data.skills),
            defenderAC
          ) + enhancedBonus;
        const defense = this.resolveDefense(defenderStats, targetClient.data.skills, targetClient.data.equipment, this.attackerStatsFor(client));
        if (defense.skill) {
          const defenseGrowth = this.maybeGrowSkill(targetClient, defense.skill);
          if (defenseGrowth) growthMessages.push(defenseGrowth);
        }
        if (defense.avoided) {
          avoidedVerb = defense.verb;
        } else {
          damage += swingDamage;
        }
        if (targetClient.data.hp - damage <= 0) break;
      }
      const attackGrowth = this.maybeGrowSkill(client, attackSkill);
      if (attackGrowth) growthMessages.push(attackGrowth);
    }
    // "Scutum... should reduce all damage by 3" (a later follow-up ask) —
    // applied once to the whole attack's total, not per individual swing.
    if (targetClient.data.scutumActive && damage > 0) {
      damage = Math.max(0, damage - SCUTUM_DAMAGE_REDUCTION);
    }
    // Only worth narrating the dodge/parry/block if EVERY swing was
    // avoided — if at least one landed, the damage number speaks for
    // itself (same simplification as multi-swing monster combat).
    const fullyAvoidedVerb = damage === 0 ? avoidedVerb : undefined;

    targetClient.data.hp = Math.max(0, targetClient.data.hp - damage);
    const died = targetClient.data.hp <= 0;

    let expGained: number | undefined;
    let leveledUp = false;

    if (died) {
      const rawExpGained = expGainFor(PLAYER_KILL_EXP_REWARD, client.data.level, targetClient.data.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      this.corpseManager.spawn(
        targetClient.data.race,
        targetClient.data.level,
        [bodyPartLabelFor(targetClient.data.race)],
        targetClient.data.map,
        targetClient.data.row,
        targetClient.data.col,
        client.data.username
      );

      this.respawnDefeatedPlayer(targetClient);
      this.playerCombat.delete(client.data.username);
    } else {
      this.worldManager.updateState(targetUsername, { hp: targetClient.data.hp });
      if (skillName === GLARE_SKILL) {
        this.applyGlare(client, `player:${targetUsername}`);
        growthMessages.push(`${targetUsername} is paralyzed by your glare and cannot move or attack!`);
      }
    }

    void this.persistStats(client);
    void this.persistPosition(targetClient);
    void this.persistStats(targetClient);

    let message: string;
    if (skillName === BONE_FINGER_STRIKE_SKILL) {
      message = fullyAvoidedVerb
        ? `${client.data.username}'s bone finger strike misses ${targetUsername}, who ${fullyAvoidedVerb}s out of the way!`
        : died
          ? `${client.data.username}'s bone finger strike hits ${targetUsername} for ${damage} damage, defeating them!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
          : `${client.data.username}'s bone finger strike hits ${targetUsername} for ${damage} damage.`;
    } else {
      const verb = this.attackVerb(client);
      message = fullyAvoidedVerb
        ? `${client.data.username} ${verb} ${targetUsername}, but they ${fullyAvoidedVerb} out of the way!`
        : died
          ? `${client.data.username} ${verb} ${targetUsername} for ${damage} damage, defeating them!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
          : `${client.data.username} ${verb} ${targetUsername} for ${damage} damage.`;
    }

    this.emitCombat(client, {
      targetKind: 'player',
      target: targetUsername,
      targetLabel: targetUsername,
      damage,
      targetHp: targetClient.data.hp,
      targetMaxHp: targetClient.data.maxHp,
      targetDied: died,
      expGained,
      leveledUp,
      message,
      growthMessages,
    });

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    if (died) {
      this.server.to(targetClient.data.map).emit('map:state', this.mapStateFor(targetClient.data.map));
    }
  }

  private emitCombat(
    client: GameSocket,
    rest: Omit<CombatEventPayload, 'attacker' | 'attackerLevel' | 'attackerExp' | 'attackerHp' | 'attackerMaxHp'>
  ): void {
    this.server.to(client.data.map).emit('combat', {
      attacker: client.data.username,
      attackerLevel: client.data.level,
      attackerExp: client.data.exp,
      attackerHp: client.data.hp,
      attackerMaxHp: client.data.maxHp,
      attackerSkills: client.data.skills,
      ...rest,
    });
  }

  // Looting just requires being at or next to the corpse (same tile or
  // one step away in any direction, diagonals included) — corpses don't
  // block movement, so "walk up and click it" is the common case, but a
  // player standing adjacent can also reach for it.
  @SubscribeMessage('loot')
  handleLoot(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() corpseId: unknown
  ): { ok: boolean; inventory?: string[]; message?: string } {
    if (typeof corpseId !== 'string') {
      return { ok: false, message: 'Invalid corpse.' };
    }

    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That's already gone." };
    }
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach that." };
    }

    // Captured BEFORE clearItems — `corpse` is a live reference into the
    // corpse manager's own map, so clearing it in place would otherwise
    // mutate this exact array out from under us, and every grab-all would
    // silently add nothing to the inventory (the actual bug reported:
    // looted items never showing up even though the log message did,
    // since that message is built client-side from what it OFFERED to
    // grab, not from what the server actually returned).
    const items = [...corpse.items];
    this.corpseManager.clearItems(corpseId);
    client.data.inventory = [...client.data.inventory, ...items];
    // A flat coin drop (a later follow-up ask) — added straight to gold,
    // not another inventory item string.
    if (corpse.gold) client.data.gold += corpse.gold;
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory, gold: client.data.gold });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, inventory: client.data.inventory };
  }

  // Monster-corpse-only "sacrifice it to the gods" — same reward formula
  // as the text game's own sacrifice command (corpse level x 3 gold).
  // Player (and training-dummy) corpses use the same Race-shaped `kind`
  // as each other with nothing to tell them apart, so both are excluded
  // here exactly as intended ("player corpses cannot be sacrificed").
  private static readonly SACRIFICE_GOLD_PER_LEVEL = 3;

  @SubscribeMessage('sacrificeCorpse')
  handleSacrificeCorpse(@ConnectedSocket() client: GameSocket, @MessageBody() corpseId: unknown): SacrificeAck {
    if (typeof corpseId !== 'string') {
      return { ok: false, message: 'Invalid corpse.' };
    }
    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That's already gone." };
    }
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach that." };
    }
    if (!(MONSTER_KINDS as readonly string[]).includes(corpse.kind)) {
      return { ok: false, message: 'Only a monster corpse can be sacrificed.' };
    }

    const goldReward = corpse.level * GameGateway.SACRIFICE_GOLD_PER_LEVEL;
    this.corpseManager.remove(corpseId);
    client.data.gold += goldReward;
    this.worldManager.updateState(client.data.username, { gold: client.data.gold });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, gold: client.data.gold, message: `You sacrifice the ${corpse.kind} corpse to the gods, receiving ${goldReward} gold.` };
  }

  private isWithinLootReach(client: GameSocket, row: number, col: number): boolean {
    return Math.abs(row - client.data.row) <= 1 && Math.abs(col - client.data.col) <= 1;
  }

  // A shop's reach is more generous than looting a corpse — "within about
  // 10 feet" of the shopkeeper (shared/lighting.ts's own SHOP_REACH_TILES,
  // deliberately independent of LIGHT_RADIUS_TILES), not basically
  // touching them.
  private isClientWithinShopReach(client: GameSocket, row: number, col: number): boolean {
    return isWithinShopReach(client.data.row, client.data.col, row, col);
  }

  // The corpse loot modal's "click one item" path — takes a single item
  // out of a (possibly multi-item) corpse rather than everything at once.
  @SubscribeMessage('lootItem')
  handleLootItem(
    @ConnectedSocket() client: GameSocket,
    @MessageBody() payload: unknown
  ): { ok: boolean; inventory?: string[]; message?: string } {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { corpseId?: unknown }).corpseId !== 'string' ||
      typeof (payload as { itemIndex?: unknown }).itemIndex !== 'number'
    ) {
      return { ok: false, message: 'Invalid request.' };
    }
    const { corpseId, itemIndex } = payload as { corpseId: string; itemIndex: number };

    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That's already gone." };
    }
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach that." };
    }

    const item = this.corpseManager.removeItem(corpseId, itemIndex);
    if (item === undefined) {
      return { ok: false, message: "That's already gone." };
    }

    client.data.inventory = [...client.data.inventory, item];
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, inventory: client.data.inventory };
  }

  // Buying from a vendor requires standing at or next to it, same reach
  // rule as looting a corpse — vendors never move, so this is really
  // just "walk up to the shop front".
  @SubscribeMessage('buyItem')
  handleBuyItem(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): BuyAck {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { vendorId?: unknown }).vendorId !== 'string' ||
      typeof (payload as { itemLabel?: unknown }).itemLabel !== 'string'
    ) {
      return { ok: false, message: 'Invalid request.' };
    }
    const { vendorId, itemLabel } = payload as { vendorId: string; itemLabel: string };

    const vendor = findVendor(vendorId);
    if (!vendor || vendor.map !== client.data.map) {
      return { ok: false, message: "That shop isn't here." };
    }
    if (!this.isClientWithinShopReach(client, vendor.row, vendor.col)) {
      return { ok: false, message: "You're too far away to reach the shop." };
    }
    const item = vendor.items.find((i) => i.label === itemLabel);
    if (!item) {
      return { ok: false, message: "The shop doesn't sell that." };
    }
    if (client.data.gold < item.price) {
      return { ok: false, message: `You don't have enough gold (${item.price} needed).` };
    }

    // The Pet Shop's own 3 items (a later follow-up ask) are special —
    // buying one creates a real Pet, not an inventory item string, and
    // "a player should only be allowed to have 1 pet at a time".
    if (vendorId === 'bramwick-pet-shop' && (PET_KINDS as readonly string[]).includes(item.label)) {
      if (this.petManager.hasPet(client.data.username)) {
        return { ok: false, message: 'You already have a pet.' };
      }
      const pet = this.petManager.buy(client.data.username, item.label as PetKind, client.data.map, vendor.row, vendor.col);
      if (!pet) {
        return { ok: false, message: 'You already have a pet.' };
      }
      client.data.gold -= item.price;
      this.worldManager.updateState(client.data.username, { gold: client.data.gold });
      void this.persistStats(client);
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, gold: client.data.gold, message: `You buy a ${item.label} for ${item.price} gold. It's yours now!` };
    }

    client.data.gold -= item.price;
    client.data.inventory = [...client.data.inventory, item.label];
    // A later follow-up ask: "should sell a canteen... that comes fully
    // filled at 6/6" — canteenDrinks is a single player-level counter
    // (not per-item charge, see CANTEEN_CAPACITY's own doc comment), so
    // buying one tops it straight back up to full.
    if (item.label === CANTEEN_ITEM) client.data.canteenDrinks = CANTEEN_CAPACITY;
    this.worldManager.updateState(client.data.username, {
      gold: client.data.gold,
      inventory: client.data.inventory,
      canteenDrinks: client.data.canteenDrinks,
    });
    void this.persistStats(client);

    // Every item label sold before this batch (torch, bone dagger, ...) is
    // a bare noun, needing "a" in front to read naturally — the new food
    // items (a follow-up ask's "a cup of water"/"some jerky") already
    // carry their own article/quantifier, so prepending another one would
    // read as "You buy a a cup of water..."
    const article = /^(a|an|some)\s/i.test(item.label) ? '' : 'a ';
    return {
      ok: true,
      inventory: client.data.inventory,
      gold: client.data.gold,
      canteenDrinks: item.label === CANTEEN_ITEM ? client.data.canteenDrinks : undefined,
      message: `You buy ${article}${item.label} for ${item.price} gold.`,
    };
  }

  // Commanding your own pet (a later follow-up ask) — "stay by side,
  // attack, sleep" — no reach check, an owner can redirect their pet
  // from anywhere, same as a real trained animal responding to its own
  // owner's voice regardless of distance.
  @SubscribeMessage('petCommand')
  handlePetCommand(@ConnectedSocket() client: GameSocket, @MessageBody() command: unknown): PetCommandAck {
    if (typeof command !== 'string' || !(PET_COMMANDS as readonly string[]).includes(command)) {
      return { ok: false, message: 'Invalid command.' };
    }
    const pet = this.petManager.setCommand(client.data.username, command as PetCommand);
    if (!pet) {
      return { ok: false, message: "You don't have a pet (or it needs to be resurrected first)." };
    }
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, pet };
  }

  // The 'z' hotkey (a later follow-up ask): "if the player has a pet/
  // summon/animated undead (follower) and... a selected target that can
  // be attacked... send the monster to auto attack the target." Commands
  // EVERY living follower the caller owns (a pet, plus any/all animated
  // monsters) at once — the actual approach/contact/damage is resolved
  // per-tick by tickAll/resolveFollowerContact above.
  @SubscribeMessage('commandFollowerAttack')
  handleCommandFollowerAttack(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CommandFollowerAttackAck {
    const parsed = z.object({ targetKind: z.enum(['monster', 'player']), targetId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    const { targetKind, targetId } = parsed.data;
    if (targetKind === 'player' && targetId === client.data.username) {
      return { ok: false, message: "You can't send a follower after yourself." };
    }
    if (!this.locateCombatTarget(targetKind, targetId)) {
      return { ok: false, message: "That target isn't here." };
    }

    const pet = this.petManager.commandAttack(client.data.username, targetKind, targetId);
    const animatedMonsters = this.animatedMonsterManager
      .getSnapshotsForOwner(client.data.username)
      .filter((m) => m.alive)
      .map((m) => this.animatedMonsterManager.commandAttack(client.data.username, m.id, targetKind, targetId));
    if (!pet && animatedMonsters.length === 0) {
      return { ok: false, message: "You don't have a pet or summoned creature to send." };
    }

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, message: 'Your follower moves to attack.' };
  }

  // Phase C's own "give/equip" ask — every one of the 4 handlers below
  // shares this same "which follower did the client mean" resolution: a
  // pet needs no id (one per owner), an animated monster needs its own
  // (an owner can have more than one at once).
  private followerRefSchema = z.object({
    followerKind: z.enum(['pet', 'animatedMonster']),
    followerId: z.string().optional(),
  });

  // The Inventory modal's own "give to follower" action (a later
  // follow-up ask) — moves one item out of the PLAYER's own inventory
  // into the named follower's.
  @SubscribeMessage('giveFollowerItem')
  handleGiveFollowerItem(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): FollowerItemAck {
    const parsed = this.followerRefSchema.extend({ itemIndex: z.number().int() }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid request.' };
    const { followerKind, followerId, itemIndex } = parsed.data;

    const item = client.data.inventory[itemIndex];
    if (item === undefined) return { ok: false, message: "You don't have that." };

    const gaveTo =
      followerKind === 'pet'
        ? this.petManager.giveItem(client.data.username, item)
        : followerId
          ? this.animatedMonsterManager.giveItem(client.data.username, followerId, item)
          : undefined;
    if (!gaveTo) return { ok: false, message: "You don't have that follower." };

    client.data.inventory = client.data.inventory.filter((_, i) => i !== itemIndex);
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, message: `You give the ${item} to ${gaveTo.name}.` };
  }

  // The reverse — takes an item back out of a follower's own inventory
  // and returns it to the player's.
  @SubscribeMessage('takeFollowerItem')
  handleTakeFollowerItem(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): FollowerItemAck {
    const parsed = this.followerRefSchema.extend({ itemIndex: z.number().int() }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid request.' };
    const { followerKind, followerId, itemIndex } = parsed.data;

    const result =
      followerKind === 'pet'
        ? this.petManager.takeItem(client.data.username, itemIndex)
        : followerId
          ? this.animatedMonsterManager.takeItem(client.data.username, followerId, itemIndex)
          : undefined;
    if (!result) return { ok: false, message: "Your follower isn't holding that." };

    client.data.inventory = [...client.data.inventory, result.item];
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    const name = 'monster' in result ? result.monster.name : result.pet.name;
    return { ok: true, message: `You take the ${result.item} back from ${name}.` };
  }

  // Moves an item already sitting in a follower's own inventory into its
  // equipment — weapon or torso-armor only (see shared/pets.ts's
  // FOLLOWER_EQUIPMENT_SLOTS); anything else (rings, jewelry, boots, ...)
  // doesn't make sense on a pet/animated monster and is rejected. A
  // weapon actually boosts its own attack damage (see
  // resolveFollowerContact's own FOLLOWER_WEAPON_DAMAGE_BONUS check);
  // torso-armor is stored/displayed only for now (see that method's own
  // doc comment on why armor has no live effect yet).
  @SubscribeMessage('equipFollowerItem')
  handleEquipFollowerItem(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): FollowerItemAck {
    const parsed = this.followerRefSchema.extend({ itemIndex: z.number().int() }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid request.' };
    const { followerKind, followerId, itemIndex } = parsed.data;

    const inventory =
      followerKind === 'pet' ? this.petManager.getPet(client.data.username)?.inventory : followerId
        ? this.animatedMonsterManager.getSnapshotsForOwner(client.data.username).find((m) => m.id === followerId)?.inventory
        : undefined;
    const item = inventory?.[itemIndex];
    if (item === undefined) return { ok: false, message: "Your follower isn't holding that." };

    const slot = EQUIPMENT_SLOT_FOR_ITEM[item];
    if (slot !== 'weapon' && slot !== 'torso') {
      return { ok: false, message: "That can't be equipped on a follower." };
    }

    const equippedOn =
      followerKind === 'pet'
        ? this.petManager.equipItem(client.data.username, itemIndex, slot)
        : followerId
          ? this.animatedMonsterManager.equipItem(client.data.username, followerId, itemIndex, slot)
          : undefined;
    if (!equippedOn) return { ok: false, message: "You don't have that follower." };

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, message: `${equippedOn.name} equips the ${item}.` };
  }

  // Takes whatever's equipped in the given slot back off a follower,
  // returning it to that follower's OWN inventory (not the player's —
  // use takeFollowerItem afterward to bring it back).
  @SubscribeMessage('unequipFollowerItem')
  handleUnequipFollowerItem(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): FollowerItemAck {
    const parsed = this.followerRefSchema.extend({ slot: z.enum(FOLLOWER_EQUIPMENT_SLOTS) }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid request.' };
    const { followerKind, followerId, slot } = parsed.data;

    const unequippedFrom =
      followerKind === 'pet'
        ? this.petManager.unequipItem(client.data.username, slot)
        : followerId
          ? this.animatedMonsterManager.unequipItem(client.data.username, followerId, slot)
          : undefined;
    if (!unequippedFrom) return { ok: false, message: "That follower doesn't have anything equipped there." };

    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, message: `${unequippedFrom.name} unequips its ${slot}.` };
  }

  // Zombie-only: heals 20% hp/mana and starts a 4-world-tick
  // (EAT_BRAINS_COOLDOWN_TICKS) cooldown — only offered on a corpse this
  // zombie itself landed the killing blow on (see corpse.killedBy, set at
  // spawn time), same reach rule as looting it.
  @SubscribeMessage('eatBrains')
  handleEatBrains(@ConnectedSocket() client: GameSocket, @MessageBody() corpseId: unknown): EatBrainsAck {
    if (typeof corpseId !== 'string') {
      return { ok: false, message: 'Invalid corpse.' };
    }
    if (client.data.race !== 'zombie') {
      return { ok: false, message: 'Only a zombie can eat brains.' };
    }
    const corpse = this.corpseManager.get(corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That corpse isn't here." };
    }
    if (!this.isWithinLootReach(client, corpse.row, corpse.col)) {
      return { ok: false, message: "You're too far away to reach the corpse." };
    }
    if (corpse.killedBy !== client.data.username) {
      return { ok: false, message: "You didn't land the killing blow on this corpse." };
    }
    if (corpse.kind === 'skeleton' || corpse.kind === 'wild skeleton') {
      return { ok: false, message: 'A skull has no brains left to eat.' };
    }
    if (this.currentTick < client.data.eatBrainsReadyAtTick) {
      const ticksLeft = client.data.eatBrainsReadyAtTick - this.currentTick;
      return { ok: false, message: `Eat Brains isn't ready yet (${ticksLeft} more world tick${ticksLeft === 1 ? '' : 's'}).` };
    }

    client.data.eatBrainsReadyAtTick = this.currentTick + EAT_BRAINS_COOLDOWN_TICKS;
    client.data.hp = Math.min(client.data.maxHp, client.data.hp + Math.round((client.data.maxHp * EAT_BRAINS_HEAL_PERCENT) / 100));
    client.data.mana = Math.min(client.data.maxMana, client.data.mana + Math.round((client.data.maxMana * EAT_BRAINS_HEAL_PERCENT) / 100));
    this.worldManager.updateState(client.data.username, {
      hp: client.data.hp,
      mana: client.data.mana,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });

    return {
      ok: true,
      hp: client.data.hp,
      maxHp: client.data.maxHp,
      mana: client.data.mana,
      maxMana: client.data.maxMana,
      eatBrainsReadyAtTick: client.data.eatBrainsReadyAtTick,
      message: `You eat the brains, restoring ${EAT_BRAINS_HEAL_PERCENT}% of your hp/mana.`,
    };
  }

  // A later follow-up ask removed the podium/spellbook system entirely —
  // see handleLearnSkill for the teacher click-to-learn modal that
  // replaced every handleReadXBook handler that used to live here
  // (lucem, irrigo, celeritas, augue, resera, stupefaciunt, exarme,
  // scutum, murus lapideus).

  // Resera (a later follow-up ask) — a targeted UTILITY spell: requires
  // selecting one of the game's two lockable objects (the secret room's
  // own door, or its treasure chest — see shared/types.ts's LockTarget)
  // and rolls the same percent-chance-success/growth formula every other
  // spell uses. Success sets a PER-PLAYER persisted unlock flag — other
  // players still have to resera the same object themselves; one
  // player's success never unlocks it for anyone else.
  @SubscribeMessage('castResera')
  handleCastResera(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastReseraAck {
    if (client.data.skills[UNLOCK_SKILL] === undefined) {
      return { ok: false, message: "You don't know the resera spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const parsed = z
      .object({
        target: z.object({
          kind: z.enum(['door', 'chest']),
          map: z.enum(MAP_NAMES),
          row: z.number(),
          col: z.number(),
        }),
      })
      .safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    const { kind, map, row, col } = parsed.data.target;

    // Every door in the castle is clickable/resera-able now (a follow-up
    // ask: "make all doors... targetable"), but only the secret room's
    // own door + chest are REAL lockable objects — resolved against the
    // server's own small registry rather than trusting the client's
    // `kind` label, same "the server decides, the client just shows what
    // it says" shape as every other cast here.
    const isSecretDoor =
      kind === 'door' &&
      // The secret door's OUTSIDE face sits in Utility Classroom (a
      // former follow-up ask put resera's own podium in that same room —
      // now removed, see the podium-system removal above — but the
      // door's own location is unchanged).
      ((map === 'Utility Classroom' && row === CAVERNA_SECRET_DOOR_POSITION.row && col === CAVERNA_SECRET_DOOR_POSITION.col) ||
        (map === 'Caverna Secretissima' && row === CAVERNA_SECRET_DOOR_INSIDE_POSITION.row && col === CAVERNA_SECRET_DOOR_INSIDE_POSITION.col));
    const isChest = kind === 'chest' && map === 'Caverna Secretissima' && row === CAVERNA_CHEST_POSITION.row && col === CAVERNA_CHEST_POSITION.col;

    if (!isSecretDoor && !isChest) {
      return { ok: false, message: kind === 'door' ? "This door isn't locked." : "This isn't locked." };
    }

    const alreadyUnlocked = isSecretDoor ? client.data.secretDoorUnlocked : client.data.secretChestUnlocked;
    if (alreadyUnlocked) {
      return { ok: false, message: `That's already unlocked.` };
    }
    // Reach-gated from wherever the player is actually standing — the
    // door has two valid tiles (one per side, see above), the chest just
    // the one.
    const reachRow = isSecretDoor ? row : CAVERNA_CHEST_POSITION.row;
    const reachCol = isSecretDoor ? col : CAVERNA_CHEST_POSITION.col;
    if (client.data.map !== map || !this.isWithinLootReach(client, reachRow, reachCol)) {
      return { ok: false, message: "You're too far away to reach that." };
    }
    if (client.data.mana < RESERA_CAST_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast resera (${RESERA_CAST_MANA_COST} needed).` };
    }

    client.data.mana -= RESERA_CAST_MANA_COST;

    let message: string;
    if (this.rollSpellSuccess(client, UNLOCK_SKILL)) {
      if (isSecretDoor) {
        client.data.secretDoorUnlocked = true;
        message = 'The lock clicks open — the door is unlocked.';
      } else {
        client.data.secretChestUnlocked = true;
        message = 'The lock clicks open — the chest is unlocked.';
      }
    } else {
      message = 'You fumble the incantation and nothing happens.';
    }

    // Resera grows with practice on every cast, success or fail (a later
    // follow-up ask, item 18 — applies to every spell, not just this one).
    const growth = this.maybeGrowSpellSkill(client, UNLOCK_SKILL);
    if (growth) message = `${message} ${growth}`;

    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    return { ok: true, skills: client.data.skills, message };
  }

  // The secret room's treasure chest (a later follow-up ask) — must be
  // physically standing next to it AND have already resera'd it open
  // (client.data.secretChestUnlocked); `items` is ['map'] the first time,
  // [] forever after (see handleTakeChestItem).
  @SubscribeMessage('openChest')
  handleOpenChest(@ConnectedSocket() client: GameSocket): OpenChestAck {
    if (client.data.map !== 'Caverna Secretissima' || !this.isWithinLootReach(client, CAVERNA_CHEST_POSITION.row, CAVERNA_CHEST_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the chest." };
    }
    if (!client.data.secretChestUnlocked) {
      return { ok: false, message: 'The chest is locked.' };
    }
    return { ok: true, items: client.data.mapUnlocked ? [] : ['map'] };
  }

  // Taking the map out of the chest (a later follow-up ask) — a real
  // ITEM never enters the inventory; instead this permanently flips
  // mapUnlocked, which is what actually gates the map corner button/'m'
  // hotkey/modal client-side (see shared/types.ts's PlayerSnapshot).
  @SubscribeMessage('takeChestItem')
  handleTakeChestItem(@ConnectedSocket() client: GameSocket): TakeChestItemAck {
    if (client.data.map !== 'Caverna Secretissima' || !this.isWithinLootReach(client, CAVERNA_CHEST_POSITION.row, CAVERNA_CHEST_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the chest." };
    }
    if (!client.data.secretChestUnlocked) {
      return { ok: false, message: 'The chest is locked.' };
    }
    if (client.data.mapUnlocked) {
      return { ok: false, message: 'The chest is empty.' };
    }
    client.data.mapUnlocked = true;
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    return { ok: true, player: this.snapshotFor(client), message: 'You take the map. A world of possibilities opens up!' };
  }

  // Augue (a later follow-up ask) — a targeted fireball, unlike lucem/
  // irrigo/celeritas's no-target-or-item-targeted shape. Requires the
  // skill, an off-cooldown state (see SKILL_COOLDOWN_MS), and a monster
  // target within AUGUE_RANGE_TILES — the only kind of target this game
  // currently offers is a wild monster (imps included). Deals a flat
  // AUGUE_DAMAGE; no melee counter-attack (a ranged hit doesn't provoke
  // one). Reuses resolveHitOnMonster's own death-handling shape (exp
  // grant, mana-crystal drop, emitCombat broadcast) rather than
  // duplicating it under a different name.
  // A later follow-up ask: "attacking a monster with augue should make
  // the player also begin auto attacking" — augue itself is a single hit
  // on its own cooldown, so this keeps the fight going in the meantime
  // with whatever basic attack the player actually has: a wand-wielder
  // keeps zapping at the same range augue just used (see
  // handleEngageRangedAttack's own session shape), otherwise it's the
  // ordinary melee auto-attack, which patiently waits out an aggro'd
  // monster's own approach rather than disengaging while it's still
  // closing distance (see combatTick's monsterStillChasing check).
  private startAutoAttackAfterSpell(client: GameSocket, targetKind: CombatSession['targetKind'], targetId: string): void {
    if (targetKind === 'monster') {
      this.monsterManager.setAggro(targetId, client.data.username, this.combatTickCount);
    }
    if (isWandItem(client.data.equipment.weapon)) {
      this.playerCombat.set(client.data.username, {
        targetKind,
        targetId,
        skill: WAND_BOLT_SKILL,
        missedTicks: 0,
        range: WAND_BOLT_RANGE_TILES,
      });
    } else {
      this.playerCombat.set(client.data.username, { targetKind, targetId, skill: this.attackGrowthSkill(client), missedTicks: 0 });
    }
  }

  @SubscribeMessage('castAugue')
  handleCastAugue(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[ARCANE_BOLT_SKILL] === undefined) {
      return { ok: false, message: "You don't know the augue spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[ARCANE_BOLT_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Augue is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    // A later follow-up bug fix: "Augue doesn't appear to be costing any
    // mana to cast" — this check (and the matching deduction in each
    // branch below) was missing entirely; every other spell here already
    // costs SPELL_ATTACK_MANA_COST regardless of success or fumble.
    if (client.data.mana < SPELL_ATTACK_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast augue (${SPELL_ATTACK_MANA_COST} needed).` };
    }
    // A practice scarecrow (or the original Great Plains training dummy)
    // is a valid augue target too (a follow-up ask: "practice their
    // offense spells, like augue, on them") — a much simpler, self-
    // contained damage path than resolveHitOnNpc's own melee-oriented
    // dodge/counter-attack resolution, since a ranged spell hit doesn't
    // give the target a chance to dodge or fight back either way.
    if (parsed.data.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === parsed.data.targetId);
      if (!npc || npc.map !== client.data.map) {
        return { ok: false, message: 'Your target is no longer here.' };
      }
      if (!isWithinRadius(client.data.row, client.data.col, npc.row, npc.col, AUGUE_RANGE_TILES)) {
        return { ok: false, message: "You're too far away to hit that with augue." };
      }

      client.data.mana -= SPELL_ATTACK_MANA_COST;
      this.startSkillCooldown(client, ARCANE_BOLT_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const label = npc.label ?? 'training dummy';

      if (!this.rollSpellSuccess(client, ARCANE_BOLT_SKILL)) {
        const growth = this.maybeGrowSpellSkill(client, ARCANE_BOLT_SKILL);
        const message = `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;
        void this.persistStats(client);
        client.emit('sync', { player: this.snapshotFor(client) });
        this.systemMessage(client, message);
        return { ok: true, skills: client.data.skills, message };
      }

      npc.hp = Math.max(0, npc.hp - AUGUE_DAMAGE);
      const died = npc.hp <= 0;
      if (!died) {
        // A follow-up ask: a successful hit that DOESN'T finish the
        // target off leaves it burning for a couple more ticks.
        this.augueBurns.push({
          targetKind: 'npc',
          targetId: npc.id,
          mapName: npc.map,
          ticksRemaining: AUGUE_BURN_TICKS,
          casterUsername: client.data.username,
          spellLabel: 'augue',
        });
      }
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
        } else if (npc.carriedItems) {
          // Same follow-up bug fix as resolveRangedAutoAttack's own npc
          // branch — every "npc died and reset" site needs to re-arm the
          // training skeleton's club, not just resolveHitOnNpc's melee one.
          npc.carriedItems = ['wooden club'];
        }
        npc.hp = npc.maxHp;
      }

      const growthMessages: string[] = [];
      const growth = this.maybeGrowSpellSkill(client, ARCANE_BOLT_SKILL);
      if (growth) growthMessages.push(growth);

      const message = died
        ? npc.immortal
          ? `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage — it shrugs off the blow, unharmed.`
          : `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage.`;

      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      // A later follow-up bug fix: augue's SUCCESS path relied entirely
      // on the room-broadcast 'combat' event, whose attacker* fields
      // don't carry mana at all (see applyCombatEvent) — the caster's
      // own client never actually saw the mana deduction land without
      // this explicit sync, same as every other spell's own success path.
      client.emit('sync', { player: this.snapshotFor(client) });
      this.emitCombat(client, {
        targetKind: 'npc',
        target: npc.id,
        targetLabel: label,
        damage: AUGUE_DAMAGE,
        targetHp: npc.hp,
        targetMaxHp: npc.maxHp,
        targetDied: died,
        message,
        growthMessages,
        skill: ARCANE_BOLT_SKILL,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: "Augue can only target a monster or training skeleton right now — that's the only kind of target you can select." };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, AUGUE_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with augue." };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    this.startSkillCooldown(client, ARCANE_BOLT_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);

    if (!this.rollSpellSuccess(client, ARCANE_BOLT_SKILL)) {
      const growth = this.maybeGrowSpellSkill(client, ARCANE_BOLT_SKILL);
      const message = `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, skills: client.data.skills, message };
    }

    const result = this.monsterManager.applyDamage(monster.id, AUGUE_DAMAGE);
    if (!result) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!result.died) {
      // A follow-up ask: a successful hit that DOESN'T finish the target
      // off leaves it burning for a couple more ticks.
      this.augueBurns.push({
        targetKind: 'monster',
        targetId: monster.id,
        mapName: monster.mapName,
        ticksRemaining: AUGUE_BURN_TICKS,
        casterUsername: client.data.username,
        spellLabel: 'augue',
      });
    }

    const growthMessages: string[] = [];
    const growth = this.maybeGrowSpellSkill(client, ARCANE_BOLT_SKILL);
    if (growth) growthMessages.push(growth);

    let expGained: number | undefined;
    let leveledUp = false;
    if (result.died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
      this.recordMonsterKill(client, monster.kind);
      this.playerCombat.delete(client.data.username);
    }

    const message = result.died
      ? `${client.data.username}'s augue engulfs the ${monster.kind} in flame for ${AUGUE_DAMAGE} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
      : `${client.data.username}'s augue engulfs the ${monster.kind} in flame for ${AUGUE_DAMAGE} damage.`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    // Same mana-sync bug fix as the npc branch above — 'combat's own
    // attacker* fields never carry mana.
    client.emit('sync', { player: this.snapshotFor(client) });
    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage: AUGUE_DAMAGE,
      targetHp: result.monster.hp,
      targetMaxHp: monster.maxHp,
      targetDied: result.died,
      expGained,
      leveledUp,
      message,
      growthMessages,
      skill: ARCANE_BOLT_SKILL,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, skills: client.data.skills, message };
  }

  // The Elementalist specialization's own 4 bolts (a later follow-up ask)
  // — same targeted, ranged, monster/npc-only shape as augue above (same
  // range, near-identical damage/cooldown/mana), differing only in their
  // own secondary effect on a successful non-lethal hit. Shared here
  // rather than copy-pasted 4 times; each @SubscribeMessage handler below
  // is a thin wrapper supplying its own describeHit/onMonsterHit/burnOnHit.
  private resolveElementalBolt(
    client: GameSocket,
    payload: unknown,
    config: {
      skill: string;
      describeHit: (label: string) => string;
      onMonsterHit?: (monster: Monster) => void;
      burnOnHit?: boolean;
      // Kinetic strike (a later follow-up ask, Battlemage) reuses this
      // whole apparatus with its own damage/mana figures instead of the
      // elemental bolts' shared ones.
      manaCost?: number;
      damage?: number;
    }
  ): CastSpellAck {
    const { skill } = config;
    const manaCost = config.manaCost ?? ELEMENTAL_BOLT_MANA_COST;
    const damage = config.damage ?? ELEMENTAL_BOLT_DAMAGE;
    const displayName = skill.charAt(0).toUpperCase() + skill.slice(1);
    if (client.data.skills[skill] === undefined) {
      return { ok: false, message: `You don't know the ${skill} spell yet.` };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[skill];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `${displayName} is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    if (client.data.mana < manaCost) {
      return { ok: false, message: `You don't have enough mana to cast ${skill} (${manaCost} needed).` };
    }

    if (parsed.data.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === parsed.data.targetId);
      if (!npc || npc.map !== client.data.map) {
        return { ok: false, message: 'Your target is no longer here.' };
      }
      if (!isWithinRadius(client.data.row, client.data.col, npc.row, npc.col, SPELL_ATTACK_RANGE_TILES)) {
        return { ok: false, message: `You're too far away to hit that with ${skill}.` };
      }

      client.data.mana -= manaCost;
      this.startSkillCooldown(client, skill);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const label = npc.label ?? 'training dummy';

      if (!this.rollSpellSuccess(client, skill)) {
        const growth = this.maybeGrowSpellSkill(client, skill);
        const message = `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;
        void this.persistStats(client);
        client.emit('sync', { player: this.snapshotFor(client) });
        this.systemMessage(client, message);
        return { ok: true, skills: client.data.skills, message };
      }

      npc.hp = Math.max(0, npc.hp - damage);
      const died = npc.hp <= 0;
      // Slow/knockback/stun are all skipped for an npc target — a static
      // training dummy/skeleton doesn't wander or chase, so there'd be
      // nothing observable to apply them to; only the burn DoT (fire
      // bolt) still applies here, matching augue's own npc-burn precedent.
      if (!died && config.burnOnHit) {
        this.augueBurns.push({ targetKind: 'npc', targetId: npc.id, mapName: npc.map, ticksRemaining: AUGUE_BURN_TICKS, casterUsername: client.data.username, spellLabel: skill });
      }
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
        } else if (npc.carriedItems) {
          npc.carriedItems = ['wooden club'];
        }
        npc.hp = npc.maxHp;
      }

      const growthMessages: string[] = [];
      const growth = this.maybeGrowSpellSkill(client, skill);
      if (growth) growthMessages.push(growth);

      const message = died
        ? npc.immortal
          ? `${client.data.username}'s ${config.describeHit(label)} — it shrugs off the blow, unharmed.`
          : `${client.data.username}'s ${config.describeHit(label)}, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username}'s ${config.describeHit(label)}.`;

      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.emitCombat(client, {
        targetKind: 'npc',
        target: npc.id,
        targetLabel: label,
        damage,
        targetHp: npc.hp,
        targetMaxHp: npc.maxHp,
        targetDied: died,
        message,
        growthMessages,
        skill,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, skills: client.data.skills, message };
    }

    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: `${displayName} can only target a monster or training skeleton right now — that's the only kind of target you can select.` };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: `You're too far away to hit that with ${skill}.` };
    }

    client.data.mana -= manaCost;
    this.startSkillCooldown(client, skill);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);

    if (!this.rollSpellSuccess(client, skill)) {
      const growth = this.maybeGrowSpellSkill(client, skill);
      const message = `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, skills: client.data.skills, message };
    }

    const result = this.monsterManager.applyDamage(monster.id, damage);
    if (!result) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!result.died) {
      if (config.burnOnHit) {
        this.augueBurns.push({
          targetKind: 'monster',
          targetId: monster.id,
          mapName: monster.mapName,
          ticksRemaining: AUGUE_BURN_TICKS,
          casterUsername: client.data.username,
          spellLabel: skill,
        });
      }
      config.onMonsterHit?.(monster);
    }

    const growthMessages: string[] = [];
    const growth = this.maybeGrowSpellSkill(client, skill);
    if (growth) growthMessages.push(growth);

    let expGained: number | undefined;
    let leveledUp = false;
    if (result.died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
      this.recordMonsterKill(client, monster.kind);
      this.playerCombat.delete(client.data.username);
    }

    const message = result.died
      ? `${client.data.username}'s ${config.describeHit(monster.kind)}, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
      : `${client.data.username}'s ${config.describeHit(monster.kind)}.`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage,
      targetHp: result.monster.hp,
      targetMaxHp: monster.maxHp,
      targetDied: result.died,
      expGained,
      leveledUp,
      message,
      growthMessages,
      skill,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, skills: client.data.skills, message };
  }

  @SubscribeMessage('castFireBolt')
  handleCastFireBolt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    return this.resolveElementalBolt(client, payload, {
      skill: FIRE_BOLT_SKILL,
      describeHit: (label) => `fire bolt engulfs the ${label} in flame for ${ELEMENTAL_BOLT_DAMAGE} damage`,
      burnOnHit: true,
    });
  }

  @SubscribeMessage('castWaterBolt')
  handleCastWaterBolt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    return this.resolveElementalBolt(client, payload, {
      skill: WATER_BOLT_SKILL,
      describeHit: (label) => `water bolt drenches the ${label} for ${ELEMENTAL_BOLT_DAMAGE} damage`,
      onMonsterHit: (monster) => this.monsterManager.slow(monster.id, this.combatTickCount + WATER_BOLT_SLOW_TICKS),
    });
  }

  @SubscribeMessage('castAirBolt')
  handleCastAirBolt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    return this.resolveElementalBolt(client, payload, {
      skill: AIR_BOLT_SKILL,
      describeHit: (label) => `air bolt slams into the ${label} for ${ELEMENTAL_BOLT_DAMAGE} damage`,
      onMonsterHit: (monster) => this.monsterManager.knockback(monster.id, client.data.row, client.data.col, AIR_BOLT_KNOCKBACK_TILES),
    });
  }

  @SubscribeMessage('castEarthBolt')
  handleCastEarthBolt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    return this.resolveElementalBolt(client, payload, {
      skill: EARTH_BOLT_SKILL,
      describeHit: (label) => `earth bolt pelts the ${label} with stone for ${ELEMENTAL_BOLT_DAMAGE} damage`,
      onMonsterHit: (monster) => this.monsterManager.stun(monster.id, this.combatTickCount + EARTH_BOLT_STUN_TICKS),
    });
  }

  // The Battlemage specialization's own level-15 spell (a later
  // follow-up ask) — reuses resolveElementalBolt's whole apparatus with
  // its own damage/mana figures; knocks the target back a full
  // KINETIC_STRIKE_KNOCKBACK_TILES (7) instead of applying a status
  // effect. "Seen visually" — the knockback lands via the very next
  // map:state broadcast (resolveElementalBolt already emits one on every
  // successful cast), same as any other monster reposition; no bespoke
  // animation needed since monster movement is already interpolated
  // client-side.
  @SubscribeMessage('castKineticStrike')
  handleCastKineticStrike(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    return this.resolveElementalBolt(client, payload, {
      skill: KINETIC_STRIKE_SKILL,
      manaCost: KINETIC_STRIKE_MANA_COST,
      damage: KINETIC_STRIKE_DAMAGE,
      describeHit: (label) => `kinetic strike slams into the ${label} for ${KINETIC_STRIKE_DAMAGE} damage`,
      onMonsterHit: (monster) => this.monsterManager.knockback(monster.id, client.data.row, client.data.col, KINETIC_STRIKE_KNOCKBACK_TILES),
    });
  }

  // The Hemomancer specialization's own level-15 spell (a later
  // follow-up ask) — the first (and so far only) spell costed in BP
  // instead of mana, so this is a bespoke handler rather than another
  // resolveElementalBolt config: that helper hardcodes client.data.mana
  // for its cost check/deduction/sync, which doesn't fit a resource this
  // different (goes negative, has its own HP-overdraft penalty). Same
  // target shape (monster/npc, 7 tiles) and fumble/growth mechanics as
  // every other targeted spell, though — heals the caster for the same
  // amount it damages the target ("blood flowing from the target into
  // the player").
  @SubscribeMessage('castSapHealth')
  handleCastSapHealth(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[SAP_HEALTH_SKILL] === undefined) {
      return { ok: false, message: "You don't know the sap health spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[SAP_HEALTH_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Sap health is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }

    // "The player should be able to continue using BP even when they
    // reach 0 or below" — no insufficient-BP rejection at all, unlike
    // every mana-costed spell. "Once the player STARTS USING BP below 0
    // it should cost them half the spell cost in health per cast" — the
    // check is whether BP was ALREADY negative BEFORE this cast's own
    // deduction, not whether this cast happens to push it negative for
    // the first time.
    const wasAlreadyNegative = client.data.bp < 0;
    const applyBpCost = (): string => {
      client.data.bp -= SAP_HEALTH_BP_COST;
      if (!wasAlreadyNegative) return '';
      client.data.hp = Math.max(0, client.data.hp - SAP_HEALTH_HP_PENALTY);
      return ` The overdraft costs you ${SAP_HEALTH_HP_PENALTY} hp.`;
    };

    if (parsed.data.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === parsed.data.targetId);
      if (!npc || npc.map !== client.data.map) {
        return { ok: false, message: 'Your target is no longer here.' };
      }
      if (!isWithinRadius(client.data.row, client.data.col, npc.row, npc.col, SPELL_ATTACK_RANGE_TILES)) {
        return { ok: false, message: "You're too far away to hit that with sap health." };
      }

      const overdraftMessage = applyBpCost();
      this.startSkillCooldown(client, SAP_HEALTH_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const label = npc.label ?? 'training dummy';

      if (!this.rollSpellSuccess(client, SAP_HEALTH_SKILL)) {
        const growth = this.maybeGrowSpellSkill(client, SAP_HEALTH_SKILL);
        const message = `You fumble the incantation and nothing happens.${overdraftMessage}${growth ? ` ${growth}` : ''}`;
        void this.persistStats(client);
        client.emit('sync', { player: this.snapshotFor(client) });
        this.systemMessage(client, message);
        return { ok: true, skills: client.data.skills, message };
      }

      npc.hp = Math.max(0, npc.hp - SAP_HEALTH_AMOUNT);
      const died = npc.hp <= 0;
      client.data.hp = Math.min(client.data.maxHp, client.data.hp + SAP_HEALTH_AMOUNT);
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
        } else if (npc.carriedItems) {
          npc.carriedItems = ['wooden club'];
        }
        npc.hp = npc.maxHp;
      }

      const growthMessages: string[] = [];
      const growth = this.maybeGrowSpellSkill(client, SAP_HEALTH_SKILL);
      if (growth) growthMessages.push(growth);

      const message = died
        ? npc.immortal
          ? `${client.data.username}'s sap health drains the ${label} for ${SAP_HEALTH_AMOUNT} damage — it shrugs off the blow, unharmed.${overdraftMessage}`
          : `${client.data.username}'s sap health drains the ${label} for ${SAP_HEALTH_AMOUNT} damage, defeating it! It leaves a corpse and reappears elsewhere.${overdraftMessage}`
        : `${client.data.username}'s sap health drains the ${label} for ${SAP_HEALTH_AMOUNT} damage.${overdraftMessage}`;

      this.worldManager.updateState(client.data.username, { hp: client.data.hp, bp: client.data.bp, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.emitCombat(client, {
        targetKind: 'npc',
        target: npc.id,
        targetLabel: label,
        damage: SAP_HEALTH_AMOUNT,
        targetHp: npc.hp,
        targetMaxHp: npc.maxHp,
        targetDied: died,
        message,
        growthMessages,
        skill: SAP_HEALTH_SKILL,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, skills: client.data.skills, message };
    }

    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: "Sap health can only target a monster or training skeleton right now — that's the only kind of target you can select." };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with sap health." };
    }

    const overdraftMessage = applyBpCost();
    this.startSkillCooldown(client, SAP_HEALTH_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);

    if (!this.rollSpellSuccess(client, SAP_HEALTH_SKILL)) {
      const growth = this.maybeGrowSpellSkill(client, SAP_HEALTH_SKILL);
      const message = `You fumble the incantation and nothing happens.${overdraftMessage}${growth ? ` ${growth}` : ''}`;
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, skills: client.data.skills, message };
    }

    const result = this.monsterManager.applyDamage(monster.id, SAP_HEALTH_AMOUNT);
    if (!result) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    client.data.hp = Math.min(client.data.maxHp, client.data.hp + SAP_HEALTH_AMOUNT);

    const growthMessages: string[] = [];
    const growth = this.maybeGrowSpellSkill(client, SAP_HEALTH_SKILL);
    if (growth) growthMessages.push(growth);

    let expGained: number | undefined;
    let leveledUp = false;
    if (result.died) {
      const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
      const grantResult = this.grantExp(client, rawExpGained);
      leveledUp = grantResult.leveledUp;
      expGained = grantResult.message ? undefined : rawExpGained;
      if (grantResult.message) growthMessages.push(grantResult.message);
      const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username, monster.goldReward, monster.maxHp, monster.attackDamage ?? 0);
      this.recordMonsterKill(client, monster.kind);
      this.playerCombat.delete(client.data.username);
    }

    const message = result.died
      ? `${client.data.username}'s sap health drains the ${monster.kind} for ${SAP_HEALTH_AMOUNT} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}${overdraftMessage}`
      : `${client.data.username}'s sap health drains the ${monster.kind} for ${SAP_HEALTH_AMOUNT} damage.${overdraftMessage}`;

    this.worldManager.updateState(client.data.username, { hp: client.data.hp, bp: client.data.bp, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.emitCombat(client, {
      targetKind: 'monster',
      target: monster.id,
      targetLabel: monster.kind,
      damage: SAP_HEALTH_AMOUNT,
      targetHp: result.monster.hp,
      targetMaxHp: monster.maxHp,
      targetDied: result.died,
      expGained,
      leveledUp,
      message,
      growthMessages,
      skill: SAP_HEALTH_SKILL,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, skills: client.data.skills, message };
  }

  // The Cleric specialization's own level-15 spell (a later follow-up
  // ask) — heals a "friendly target": another player the caster has
  // selected, as long as that player isn't currently attacking the
  // caster back (checked via playerCombat, keyed by the ATTACKER's own
  // username). Any other selection (no target, a monster/npc, a hostile
  // player) falls back to healing the caster themselves. No cooldown of
  // its own — mana cost alone gates recasting, same as recall.
  @SubscribeMessage('castLesserHeal')
  handleCastLesserHeal(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[LESSER_HEAL_SKILL] === undefined) {
      return { ok: false, message: "You don't know the lesser heal spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const parsed = lesserHealTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    if (client.data.mana < LESSER_HEAL_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast lesser heal (${LESSER_HEAL_MANA_COST} needed).` };
    }

    let targetClient = client;
    const target = parsed.data;
    if (target && target.targetKind === 'player' && target.targetId !== client.data.username) {
      const targetSocketId = this.activeConnections.getActiveSocketId(target.targetId);
      const candidate = targetSocketId ? (this.server.sockets.sockets.get(targetSocketId) as GameSocket | undefined) : undefined;
      const attackerSession = this.playerCombat.get(target.targetId);
      const isHostile = attackerSession?.targetKind === 'player' && attackerSession.targetId === client.data.username;
      if (candidate && candidate.data.map === client.data.map && !isHostile) {
        targetClient = candidate;
      }
    }

    client.data.mana -= LESSER_HEAL_MANA_COST;
    this.startSkillCooldown(client, LESSER_HEAL_SKILL);

    let message: string;
    if (!this.rollSpellSuccess(client, LESSER_HEAL_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      targetClient.data.hp = Math.min(targetClient.data.maxHp, targetClient.data.hp + LESSER_HEAL_AMOUNT);
      this.worldManager.updateState(targetClient.data.username, { hp: targetClient.data.hp });
      void this.persistStats(targetClient);
      targetClient.emit('sync', { player: this.snapshotFor(targetClient) });
      message =
        targetClient === client
          ? `You heal yourself for ${LESSER_HEAL_AMOUNT} hp.`
          : `You heal ${targetClient.data.username} for ${LESSER_HEAL_AMOUNT} hp.`;
      if (targetClient !== client) this.systemMessage(targetClient, `${client.data.username} heals you for ${LESSER_HEAL_AMOUNT} hp.`);
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    }

    const growth = this.maybeGrowSpellSkill(client, LESSER_HEAL_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // The Druid specialization's own level-15 spell (a later follow-up
  // ask) — no target at all, always heals the caster. A short 5-second
  // cooldown that (per its own spec) only starts on a successful cast.
  @SubscribeMessage('castLesserSelfHeal')
  handleCastLesserSelfHeal(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[LESSER_SELF_HEAL_SKILL] === undefined) {
      return { ok: false, message: "You don't know the lesser self heal spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[LESSER_SELF_HEAL_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Lesser self heal is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < LESSER_SELF_HEAL_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast lesser self heal (${LESSER_SELF_HEAL_MANA_COST} needed).` };
    }

    client.data.mana -= LESSER_SELF_HEAL_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, LESSER_SELF_HEAL_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, LESSER_SELF_HEAL_SKILL);
      client.data.hp = Math.min(client.data.maxHp, client.data.hp + LESSER_SELF_HEAL_AMOUNT);
      this.worldManager.updateState(client.data.username, { hp: client.data.hp });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      message = `You heal yourself for ${LESSER_SELF_HEAL_AMOUNT} hp.`;
    }

    const growth = this.maybeGrowSpellSkill(client, LESSER_SELF_HEAL_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // The Druid specialization's other level-15 spell (a later follow-up
  // ask) — a fixed-duration self-transformation, same "always ON for its
  // own duration once cast" shape as scutum (no manual cancel, unlike
  // barrier — nothing in the spec asks for one). No-attack/faster-
  // movement rules live client-side (WorldScene) and at every attack
  // entry point (handlePunch/handleUseSkill/handleEngageRangedAttack)
  // rather than here.
  @SubscribeMessage('castWispTransformation')
  handleCastWispTransformation(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[WISP_TRANSFORMATION_SKILL] === undefined) {
      return { ok: false, message: "You don't know the wisp transformation spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[WISP_TRANSFORMATION_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Wisp transformation is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < WISP_TRANSFORMATION_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast wisp transformation (${WISP_TRANSFORMATION_MANA_COST} needed).` };
    }

    client.data.mana -= WISP_TRANSFORMATION_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, WISP_TRANSFORMATION_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, WISP_TRANSFORMATION_SKILL);
      client.data.wispActive = true;
      client.data.wispActiveUntil = Date.now() + WISP_TRANSFORMATION_DURATION_MS;
      this.worldManager.updateState(client.data.username, { wispActive: true });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      message = 'You dissolve into a shimmering wisp of light.';
    }

    const growth = this.maybeGrowSpellSkill(client, WISP_TRANSFORMATION_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // A later follow-up ask removed the podium/spellbook system entirely —
  // see handleLearnSkill for the teacher click-to-learn modal that
  // replaced the stupefaciunt/exarme podium-reading handlers that used
  // to live here.

  // Stupefaciunt (a later follow-up ask) — a targeted stun, same
  // range/target shape as augue but no damage: 2 combat ticks of
  // MonsterManagerService-level stun (can't move OR act — see
  // wanderAll/stepTowardAggroTarget's own early-return) instead. No
  // success-chance roll (same as augue) — deterministic once in range,
  // gated only by mana and its own cooldown.
  @SubscribeMessage('castStupefaciunt')
  handleCastStupefaciunt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[STUN_SKILL] === undefined) {
      return { ok: false, message: "You don't know the stupefaciunt spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[STUN_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Stupefaciunt is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    if (client.data.mana < SPELL_ATTACK_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast stupefaciunt (${SPELL_ATTACK_MANA_COST} needed).` };
    }

    if (parsed.data.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === parsed.data.targetId);
      if (!npc || npc.map !== client.data.map) {
        return { ok: false, message: 'Your target is no longer here.' };
      }
      if (!isWithinRadius(client.data.row, client.data.col, npc.row, npc.col, SPELL_ATTACK_RANGE_TILES)) {
        return { ok: false, message: "You're too far away to hit that with stupefaciunt." };
      }
      client.data.mana -= SPELL_ATTACK_MANA_COST;
      this.startSkillCooldown(client, STUN_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const label = npc.label ?? 'training dummy';
      const succeeded = this.rollSpellSuccess(client, STUN_SKILL);
      const growth = this.maybeGrowSpellSkill(client, STUN_SKILL);
      const message = succeeded
        ? `${client.data.username} stuns the ${label} in place!${growth ? ` ${growth}` : ''}`
        : `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;
      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: 'Stupefaciunt can only target a monster or training skeleton right now.' };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with stupefaciunt." };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    this.startSkillCooldown(client, STUN_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);
    const stupefaciuntSucceeded = this.rollSpellSuccess(client, STUN_SKILL);
    if (stupefaciuntSucceeded) this.monsterManager.stun(monster.id, this.combatTickCount + STUPEFACIUNT_STUN_TICKS);
    const growth = this.maybeGrowSpellSkill(client, STUN_SKILL);
    const message = stupefaciuntSucceeded
      ? `${client.data.username}'s stupefaciunt freezes the ${monster.kind} in place!${growth ? ` ${growth}` : ''}`
      : `You fumble the incantation and nothing happens.${growth ? ` ${growth}` : ''}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // Exarme (a later follow-up ask) — a targeted disarm: a monster
  // carrying a weapon-like item (the same "dagger" heuristic
  // skillsForCarriedItems already uses to grant the dagger skill) loses
  // it into the caster's own inventory and its dagger skill along with
  // it; a monster with nothing to disarm just reports as much. Same
  // range/no-success-roll shape as stupefaciunt above.
  @SubscribeMessage('castExarme')
  handleCastExarme(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[DISARM_SKILL] === undefined) {
      return { ok: false, message: "You don't know the exarme spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[DISARM_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Exarme is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    if (client.data.mana < SPELL_ATTACK_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast exarme (${SPELL_ATTACK_MANA_COST} needed).` };
    }
    if (parsed.data.targetKind === 'npc') {
      const npc = NPCS.find((n) => n.id === parsed.data.targetId);
      if (!npc || npc.map !== client.data.map) {
        return { ok: false, message: 'Your target is no longer here.' };
      }
      if (!isWithinRadius(client.data.row, client.data.col, npc.row, npc.col, SPELL_ATTACK_RANGE_TILES)) {
        return { ok: false, message: "You're too far away to hit that with exarme." };
      }
      client.data.mana -= SPELL_ATTACK_MANA_COST;
      this.startSkillCooldown(client, DISARM_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const succeeded = this.rollSpellSuccess(client, DISARM_SKILL);
      const growth = this.maybeGrowSpellSkill(client, DISARM_SKILL);
      const label = npc.label ?? 'training dummy';
      // A follow-up ask gave the training skeletons a wooden club (see
      // server/worlds/npcs.ts) specifically so this branch — previously
      // always "isn't wielding a weapon," since no NPC ever carried
      // anything — has something to actually disarm. Not added to the
      // player's own inventory (unlike a monster's dropped dagger below)
      // — it's a practice target, not a real loot source; the club comes
      // back the next time this skeleton is "killed" (see
      // resolveHitOnNpc's own immortal-reset branch).
      let message: string;
      if (!succeeded) {
        message = 'You fumble the incantation and nothing happens.';
      } else {
        const weaponIndex = (npc.carriedItems ?? []).findIndex((item) => item.toLowerCase().includes('club'));
        if (weaponIndex === -1) {
          message = `The ${label} isn't wielding a weapon.`;
        } else {
          const [weapon] = npc.carriedItems!.splice(weaponIndex, 1);
          message = `${client.data.username}'s exarme knocks the ${weapon} from the ${label}'s grip!`;
        }
      }
      if (growth) message = `${message} ${growth}`;
      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: 'Exarme can only target a monster or training skeleton right now.' };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with exarme." };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    this.startSkillCooldown(client, DISARM_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);
    let message: string;
    if (!this.rollSpellSuccess(client, DISARM_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      const weaponIndex = monster.carriedItems.findIndex((item) => item.toLowerCase().includes('dagger'));
      if (weaponIndex === -1) {
        message = `The ${monster.kind} isn't wielding a weapon.`;
      } else {
        const [weapon] = monster.carriedItems.splice(weaponIndex, 1);
        delete monster.skills[DAGGER_SKILL];
        client.data.inventory = [...client.data.inventory, weapon!];
        this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
        message = `${client.data.username}'s exarme knocks the ${weapon} from the ${monster.kind}'s grip!`;
      }
    }
    const growth = this.maybeGrowSpellSkill(client, DISARM_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // A later follow-up ask removed the podium/spellbook system entirely —
  // see handleLearnSkill for the teacher click-to-learn modal that
  // replaced the scutum podium-reading handler that used to live here.

  // Scutum (a later follow-up ask) — a fixed-duration self-buff, unlike
  // lucem/celeritas: always ON for SCUTUM_DURATION_MS once cast (no
  // manual toggle-off — see checkScutumExpiry for how it wears off on its
  // own), driving a blue-sphere visual for every nearby player (see
  // WorldScene's updateScutumVisual) and the Affects modal's own
  // countdown. Rolls the same success-chance every other spell does (a
  // later follow-up ask — this used to be deterministic once known and
  // affordable, gated only by its own cooldown; still costs mana and
  // starts the cooldown even on a fumble).
  @SubscribeMessage('castScutum')
  handleCastScutum(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[AEGIS_SKILL] === undefined) {
      const message = "You don't know the scutum spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      const message = 'You need a wand equipped to cast spells.';
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    const cooldownUntil = client.data.skillCooldowns[AEGIS_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      const message = `Scutum is still recharging (${secondsLeft}s left).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (client.data.mana < SPELL_ATTACK_MANA_COST) {
      const message = `You don't have enough mana to cast scutum (${SPELL_ATTACK_MANA_COST} needed).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    // A later follow-up ask: scutum's own 2-minute cooldown only starts
    // on an actual SUCCESSFUL cast — unlike every other spell here, a
    // 2-minute lockout on top of a fumble would be brutal, so a fumbled
    // scutum can just be retried immediately (still costs the mana,
    // same "swinging and missing still counts as the swing" reasoning,
    // just not the cooldown on top of it).
    const succeeded = this.rollSpellSuccess(client, AEGIS_SKILL);
    let message: string;
    if (succeeded) {
      this.startSkillCooldown(client, AEGIS_SKILL);
      client.data.scutumActive = true;
      client.data.scutumActiveUntil = Date.now() + SCUTUM_DURATION_MS;
      message = 'A shimmering shield surrounds you.';
    } else {
      message = 'You fumble the incantation and nothing happens.';
    }

    const growth = this.maybeGrowSpellSkill(client, AEGIS_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills, scutumActive: client.data.scutumActive });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, active: succeeded, mana: client.data.mana, skills: client.data.skills, message };
  }

  // A later follow-up ask removed the podium/spellbook system entirely —
  // see handleLearnSkill for the teacher click-to-learn modal that
  // replaced the murus lapideus podium-reading handler that used to live
  // here.

  // Murus lapideus (a later follow-up ask) — "click the spell, then click
  // a spot on the map" (see WorldScene's own murusLapideusTargeting flow);
  // the server just receives the final {row, col} and validates it. Draws
  // aggro from whichever monster is currently chasing the caster (see
  // MonsterManagerService.findMonsterAggroedOnto/redirectAggroToStoneBlock)
  // — harmless no-op if nothing's aggro'd onto them.
  @SubscribeMessage('castMurusLapideus')
  handleCastMurusLapideus(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[STONE_WALL_SKILL] === undefined) {
      return { ok: false, message: "You don't know the murus lapideus spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[STONE_WALL_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Murus lapideus is still recharging (${secondsLeft}s left).` };
    }
    const parsed = z.object({ row: z.number(), col: z.number() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    const { row, col } = parsed.data;
    const map = getMap(client.data.map);
    if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) {
      return { ok: false, message: "That's not a valid spot." };
    }
    if (!isWithinRadius(client.data.row, client.data.col, row, col, MURUS_LAPIDEUS_RANGE_TILES)) {
      return { ok: false, message: "That's too far away." };
    }
    const occupied =
      this.worldManager.isPlayerAt(client.data.map, row, col) ||
      this.monsterManager.isOccupied(client.data.map, row, col) ||
      NPCS.some((n) => n.map === client.data.map && n.row === row && n.col === col) ||
      [...this.stoneBlocks.values()].some((b) => b.mapName === client.data.map && b.row === row && b.col === col);
    if (occupied) {
      return { ok: false, message: "There's already something there." };
    }
    if (client.data.mana < SPELL_ATTACK_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast murus lapideus (${SPELL_ATTACK_MANA_COST} needed).` };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, STONE_WALL_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      // A follow-up ask: cooldown should only start on an actual
      // success, not a fumble — a fumbled cast still costs mana but
      // shouldn't lock the player out of trying again right away.
      this.startSkillCooldown(client, STONE_WALL_SKILL);
      const id = randomUUID();
      this.stoneBlocks.set(id, {
        id,
        ownerUsername: client.data.username,
        mapName: client.data.map,
        row,
        col,
        hp: MURUS_LAPIDEUS_HP,
        maxHp: MURUS_LAPIDEUS_HP,
        expiresAt: Date.now() + MURUS_LAPIDEUS_DURATION_MS,
      });

      const aggroedMonster = this.monsterManager.findMonsterAggroedOnto(client.data.username);
      if (aggroedMonster) {
        this.monsterManager.redirectAggroToStoneBlock(aggroedMonster.id, id, this.combatTickCount);
      }
      message = 'A block of stone rises from the ground, eyes blinking open.';
    }

    const growth = this.maybeGrowSpellSkill(client, STONE_WALL_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // Animate dead (a later follow-up ask) — "click the spell, then click a
  // monster corpse" (see WorldScene's own animateDeadTargeting flow),
  // same two-step shape as murus lapideus just targeting a corpse instead
  // of a tile. Turns the corpse into a controllable AnimatedMonster with
  // 2x the original monster's max hp and its same attack damage (see
  // CorpseSnapshot.sourceMaxHp/sourceAttackDamage, captured at the
  // monster's own moment of death), capped per animatedMonsterCapFor.
  @SubscribeMessage('castAnimateDead')
  handleCastAnimateDead(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[ANIMATE_DEAD_SKILL] === undefined) {
      return { ok: false, message: "You don't know the animate dead spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const cooldownUntil = client.data.skillCooldowns[ANIMATE_DEAD_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Animate dead is still recharging (${secondsLeft}s left).` };
    }
    const parsed = z.object({ corpseId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    const corpse = this.corpseManager.get(parsed.data.corpseId);
    if (!corpse || corpse.map !== client.data.map) {
      return { ok: false, message: "That corpse isn't here anymore." };
    }
    if (!(MONSTER_KINDS as readonly string[]).includes(corpse.kind) || corpse.sourceMaxHp === undefined) {
      return { ok: false, message: 'Only a monster corpse can be animated.' };
    }
    // A later follow-up ask widened this from adjacent-only (the same
    // reach every other loot action uses) to the same 7-tile range every
    // other targeted spell here uses ("doesn't have to be standing right
    // next to the corpse").
    if (!isWithinRadius(client.data.row, client.data.col, corpse.row, corpse.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to reach the corpse." };
    }
    if (this.animatedMonsterManager.countFor(client.data.username) >= animatedMonsterCapFor(client.data.level)) {
      return { ok: false, message: 'You cannot control any more animated monsters.' };
    }
    if (client.data.mana < ANIMATE_DEAD_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast animate dead (${ANIMATE_DEAD_MANA_COST} needed).` };
    }

    client.data.mana -= ANIMATE_DEAD_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, ANIMATE_DEAD_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, ANIMATE_DEAD_SKILL);
      this.animatedMonsterManager.animate(
        client.data.username,
        client.data.level,
        corpse.kind as MonsterKind,
        `Animated ${corpse.kind}`,
        corpse.sourceMaxHp * ANIMATE_DEAD_HP_MULTIPLIER,
        corpse.sourceAttackDamage ?? 0,
        client.data.map,
        corpse.row,
        corpse.col
      );
      this.corpseManager.remove(corpse.id);
      message = `The ${corpse.kind}'s corpse shudders and rises, bound to your will.`;
    }

    const growth = this.maybeGrowSpellSkill(client, ANIMATE_DEAD_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // The Summoner specialization's own level-15 spell (a later follow-up
  // ask) — no in-world target at all: the client's own modal already
  // narrowed the choice down to a monster kind this Summoner has
  // actually killed (killedMonsterKinds), so this just validates that
  // server-side and reuses animatedMonsterManager.animate() directly
  // ("similar mechanics to animate dead or pets" — same cap, same
  // command/remove infrastructure, see handleAnimatedMonsterCommand).
  @SubscribeMessage('castMonsterSummons')
  handleCastMonsterSummons(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    if (client.data.skills[MONSTER_SUMMONS_SKILL] === undefined) {
      return { ok: false, message: "You don't know the monster summons spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const parsed = z.object({ monsterKind: z.string() }).safeParse(payload);
    if (!parsed.success || !client.data.killedMonsterKinds.includes(parsed.data.monsterKind)) {
      return { ok: false, message: "You haven't killed one of those yet." };
    }
    const species = MONSTER_SPECIES.find((s) => s.kind === parsed.data.monsterKind);
    if (!species) {
      return { ok: false, message: 'That monster cannot be summoned.' };
    }
    if (this.animatedMonsterManager.countFor(client.data.username) >= animatedMonsterCapFor(client.data.level)) {
      return { ok: false, message: 'You cannot control any more summoned monsters.' };
    }
    const cooldownUntil = client.data.skillCooldowns[MONSTER_SUMMONS_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Monster summons is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < MONSTER_SUMMONS_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast monster summons (${MONSTER_SUMMONS_MANA_COST} needed).` };
    }

    client.data.mana -= MONSTER_SUMMONS_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, MONSTER_SUMMONS_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, MONSTER_SUMMONS_SKILL);
      this.animatedMonsterManager.animate(
        client.data.username,
        client.data.level,
        species.kind,
        `Summoned ${species.kind}`,
        species.startingHp + MONSTER_SUMMONS_HP_BONUS,
        (species.attackDamage ?? 0) + MONSTER_SUMMONS_DAMAGE_BONUS,
        client.data.map,
        client.data.row,
        client.data.col
      );
      message = `You summon a ${species.kind}, bound to your will.`;
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    }

    const growth = this.maybeGrowSpellSkill(client, MONSTER_SUMMONS_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // The Diabolist specialization's own level-15 spell (a later follow-up
  // ask) — no in-world target, no killed-kind gate: always the same
  // fixed-stat demon imp (see DEMON_IMP_KIND), reusing
  // animatedMonsterManager.animate() directly like monster summons
  // above. "Draw the aggro of monsters the player is attacking" is
  // handled entirely server-side via setDemonImpCallbacks — nothing
  // extra needed here.
  @SubscribeMessage('castSummonDemonImp')
  handleCastSummonDemonImp(@ConnectedSocket() client: GameSocket): { ok: boolean; message?: string } {
    if (client.data.skills[SUMMON_DEMON_IMP_SKILL] === undefined) {
      return { ok: false, message: "You don't know the summon demon imp spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    if (this.animatedMonsterManager.countFor(client.data.username) >= animatedMonsterCapFor(client.data.level)) {
      return { ok: false, message: 'You cannot control any more summoned monsters.' };
    }
    const cooldownUntil = client.data.skillCooldowns[SUMMON_DEMON_IMP_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Summon demon imp is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < SUMMON_DEMON_IMP_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast summon demon imp (${SUMMON_DEMON_IMP_MANA_COST} needed).` };
    }

    client.data.mana -= SUMMON_DEMON_IMP_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, SUMMON_DEMON_IMP_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, SUMMON_DEMON_IMP_SKILL);
      this.animatedMonsterManager.animate(
        client.data.username,
        client.data.level,
        DEMON_IMP_KIND,
        'Demon Imp',
        DEMON_IMP_HP,
        DEMON_IMP_DAMAGE,
        client.data.map,
        client.data.row,
        client.data.col
      );
      message = 'A demon imp tears through a rift in reality, bound to your will.';
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    }

    const growth = this.maybeGrowSpellSkill(client, SUMMON_DEMON_IMP_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // The Illusionist specialization's own level-15 spell (a later
  // follow-up ask) — a fixed-duration self-buff, same "always ON for its
  // own duration once cast" shape as scutum/wisp, but with the extra
  // early-cancel-on-attack rule (see breakInvisibilityIfActive) instead
  // of a manual recast-to-cancel. Two conflicting mana figures appeared
  // in the original ask (10, then 15 alongside the cooldown) — using 15,
  // the more specific one.
  @SubscribeMessage('castInvisibility')
  handleCastInvisibility(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[INVISIBILITY_SKILL] === undefined) {
      const message = "You don't know the invisibility spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      const message = 'You need a wand equipped to cast spells.';
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    const cooldownUntil = client.data.skillCooldowns[INVISIBILITY_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      const message = `Invisibility is still recharging (${secondsLeft}s left).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (client.data.mana < INVISIBILITY_MANA_COST) {
      const message = `You don't have enough mana to cast invisibility (${INVISIBILITY_MANA_COST} needed).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }

    client.data.mana -= INVISIBILITY_MANA_COST;
    const succeeded = this.rollSpellSuccess(client, INVISIBILITY_SKILL);
    let message: string;
    if (succeeded) {
      this.startSkillCooldown(client, INVISIBILITY_SKILL);
      client.data.invisibleActive = true;
      client.data.invisibleActiveUntil = Date.now() + INVISIBILITY_DURATION_MS;
      // "Monsters... cannot see the player while it's active" — drop
      // whatever's ALREADY chasing them; setAggro's own invisibility
      // check (see MonsterManagerService) handles every future attempt.
      this.monsterManager.clearAllAggroOnto(client.data.username);
      this.worldManager.updateState(client.data.username, { invisibleActive: true });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      message = 'You fade from sight.';
    } else {
      message = 'You fumble the incantation and nothing happens.';
    }

    const growth = this.maybeGrowSpellSkill(client, INVISIBILITY_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, active: succeeded, mana: client.data.mana, skills: client.data.skills, message };
  }

  // The Illusionist specialization's other level-15 spell (a later
  // follow-up ask) — "similar mechanics to animate dead or pets," reusing
  // animatedMonsterManager.animate() directly (same cap/command/remove
  // infrastructure), but with its own FIXED 5-minute lifespan (see
  // activeDuplicates/checkDuplicateExpiry) rather than "until logged out
  // or killed." Renders as a copy of the caster's own Race (see
  // AnimatedMonsterSnapshot's widened monsterKind type). The "ranged or
  // physical... depending on what's equipped" damage figure is a
  // SNAPSHOT taken right here at cast time, not live-synced equipment —
  // no animated monster/pet in this game has real attack-mode combat AI
  // yet (see this method's own doc comment in shared/skills.ts).
  @SubscribeMessage('castCreateDuplicate')
  handleCastCreateDuplicate(@ConnectedSocket() client: GameSocket): { ok: boolean; message?: string } {
    if (client.data.skills[CREATE_DUPLICATE_SKILL] === undefined) {
      return { ok: false, message: "You don't know the create duplicate spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    if (this.animatedMonsterManager.countFor(client.data.username) >= animatedMonsterCapFor(client.data.level)) {
      return { ok: false, message: 'You cannot control any more summoned monsters.' };
    }
    const cooldownUntil = client.data.skillCooldowns[CREATE_DUPLICATE_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Create duplicate is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < CREATE_DUPLICATE_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast create duplicate (${CREATE_DUPLICATE_MANA_COST} needed).` };
    }

    client.data.mana -= CREATE_DUPLICATE_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, CREATE_DUPLICATE_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, CREATE_DUPLICATE_SKILL);
      const duplicateDamage = isWandItem(client.data.equipment.weapon)
        ? WAND_BOLT_DAMAGE + client.data.intelligence + intelligenceEquipmentBonus(client.data.equipment)
        : client.data.strength + weaponBonusFor(client.data.equipment, client.data.skills);
      const duplicate = this.animatedMonsterManager.animate(
        client.data.username,
        client.data.level,
        client.data.race,
        `${client.data.username}'s duplicate`,
        Math.round(client.data.maxHp * CREATE_DUPLICATE_HP_MULTIPLIER),
        duplicateDamage,
        client.data.map,
        client.data.row,
        client.data.col
      );
      if (duplicate) {
        this.activeDuplicates.set(duplicate.id, { ownerUsername: client.data.username, expiresAt: Date.now() + CREATE_DUPLICATE_DURATION_MS });
      }
      message = 'A perfect copy of yourself steps out of thin air.';
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    }

    const growth = this.maybeGrowSpellSkill(client, CREATE_DUPLICATE_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // Commanding your own animated monster (a later follow-up ask) — same
  // "no reach check, an owner can redirect from anywhere" shape as
  // handlePetCommand.
  @SubscribeMessage('animatedMonsterCommand')
  handleAnimatedMonsterCommand(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): AnimatedMonsterCommandAck {
    const parsed = z.object({ id: z.string(), command: z.enum(PET_COMMANDS) }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid command.' };
    }
    const animatedMonster = this.animatedMonsterManager.setCommand(client.data.username, parsed.data.id, parsed.data.command);
    if (!animatedMonster) {
      return { ok: false, message: "You don't have that animated monster." };
    }
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, animatedMonster };
  }

  // "An option... to 'remove' and get rid of" (a later follow-up ask,
  // asked for animate dead/monster summons/demon imp/the Illusionist's
  // duplicate alike) — a dedicated event/method (see
  // AnimatedMonsterManagerService.remove) rather than a PetCommand,
  // since a real pet is never removable this way.
  @SubscribeMessage('removeAnimatedMonster')
  handleRemoveAnimatedMonster(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ id: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
    }
    if (!this.animatedMonsterManager.remove(client.data.username, parsed.data.id)) {
      return { ok: false, message: "You don't have that animated monster." };
    }
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true };
  }

  // The Utility Classroom's own level-15 spell (a later follow-up ask) —
  // no arm-then-click flow like murus lapideus/animate dead; the client
  // opens its own modal (built entirely from myProfile.visitedPois, no
  // server round trip needed just to list options) and sends the chosen
  // point of interest directly. Teleports the caster's own pet/animated
  // monsters along too — "players that are in the player's group will
  // not be teleported" just means no OTHER real player ever moves, which
  // is already true by construction (only this owner's own companions are
  // ever touched).
  @SubscribeMessage('castRecall')
  handleCastRecall(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[RECALL_SKILL] === undefined) {
      return { ok: false, message: "You don't know the recall spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }
    const parsed = z.object({ poiId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid destination.' };
    }
    const point = recallPointById(parsed.data.poiId);
    if (!point || !client.data.visitedPois.includes(point.id)) {
      return { ok: false, message: "You haven't been there yet." };
    }
    if (client.data.mana < RECALL_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast recall (${RECALL_MANA_COST} needed).` };
    }

    client.data.mana -= RECALL_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, RECALL_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      const previousMap = client.data.map;
      const spawn = startingPositionFor(point.landingMap);
      client.data.map = point.landingMap;
      client.data.row = spawn.row;
      client.data.col = spawn.col;
      void client.leave(previousMap);
      void client.join(point.landingMap);
      this.worldManager.updateState(client.data.username, { mapName: point.landingMap, row: spawn.row, col: spawn.col });
      void this.persistPosition(client);

      const changedMaps = new Set<MapName>([previousMap, point.landingMap]);
      const petPreviousMap = this.petManager.teleportToOwner(client.data.username, point.landingMap, spawn.row, spawn.col);
      if (petPreviousMap) changedMaps.add(petPreviousMap);
      for (const m of this.animatedMonsterManager.teleportAllToOwner(client.data.username, point.landingMap, spawn.row, spawn.col)) {
        changedMaps.add(m);
      }
      for (const mapName of changedMaps) {
        this.server.to(mapName).emit('map:state', this.mapStateFor(mapName));
      }
      message = `You recall to ${point.label}.`;
    }

    const growth = this.maybeGrowSpellSkill(client, RECALL_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // The Defense Classroom's own level-10 spell (a later follow-up ask) —
  // unlike every other spell here, casting it again while ALREADY active
  // just cancels it early (bypassing the cooldown gate entirely); only a
  // fresh cast (no barrier currently up) is cooldown/mana/success-gated.
  @SubscribeMessage('castBarrier')
  handleCastBarrier(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[BARRIER_SKILL] === undefined) {
      return { ok: false, message: "You don't know the barrier spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast spells.' };
    }

    if (client.data.barrierActive) {
      client.data.barrierActive = false;
      client.data.barrierActiveUntil = null;
      this.activeBarriers.delete(client.data.username);
      this.worldManager.updateState(client.data.username, { barrierActive: false });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      const cancelMessage = 'You dispel your barrier.';
      this.systemMessage(client, cancelMessage);
      return { ok: true, message: cancelMessage };
    }

    const cooldownUntil = client.data.skillCooldowns[BARRIER_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Barrier is still recharging (${secondsLeft}s left).` };
    }
    if (client.data.mana < BARRIER_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast barrier (${BARRIER_MANA_COST} needed).` };
    }

    client.data.mana -= BARRIER_MANA_COST;

    let message: string;
    let barrierOrigin: { row: number; col: number } | undefined;
    if (!this.rollSpellSuccess(client, BARRIER_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else {
      this.startSkillCooldown(client, BARRIER_SKILL);
      client.data.barrierActive = true;
      client.data.barrierActiveUntil = Date.now() + BARRIER_DURATION_MS;
      barrierOrigin = { row: client.data.row, col: client.data.col };
      this.activeBarriers.set(client.data.username, { mapName: client.data.map, ...barrierOrigin });
      this.worldManager.updateState(client.data.username, { barrierActive: true });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      message = 'A shimmering yellow dome rises around you.';
    }

    const barrierGrowth = this.maybeGrowSpellSkill(client, BARRIER_SKILL);
    if (barrierGrowth) message = `${message} ${barrierGrowth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message, barrierOrigin };
  }

  // The Shaman specialization's own level-15 spell (a later follow-up
  // ask) — a fixed-duration self-buff, same "always ON for its own
  // duration once cast, no manual toggle-off" shape as scutum/barrier.
  // Its bonus is applied in rollExtraAttacks (physical) and
  // resolveRangedAutoAttack (wand); no visual and no movement/collision
  // gate, so unlike barrier it needs no origin tracking.
  @SubscribeMessage('castEnhanceDamage')
  handleCastEnhanceDamage(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[SHAMAN_ENHANCE_DAMAGE_SKILL] === undefined) {
      const message = "You don't know the enhance damage spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      const message = 'You need a wand equipped to cast spells.';
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    const cooldownUntil = client.data.skillCooldowns[SHAMAN_ENHANCE_DAMAGE_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      const message = `Enhance damage is still recharging (${secondsLeft}s left).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (client.data.mana < SHAMAN_ENHANCE_DAMAGE_MANA_COST) {
      const message = `You don't have enough mana to cast enhance damage (${SHAMAN_ENHANCE_DAMAGE_MANA_COST} needed).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }

    client.data.mana -= SHAMAN_ENHANCE_DAMAGE_MANA_COST;
    const succeeded = this.rollSpellSuccess(client, SHAMAN_ENHANCE_DAMAGE_SKILL);
    let message: string;
    if (succeeded) {
      this.startSkillCooldown(client, SHAMAN_ENHANCE_DAMAGE_SKILL);
      client.data.enhanceDamageActive = true;
      client.data.enhanceDamageActiveUntil = Date.now() + SHAMAN_ENHANCE_DAMAGE_DURATION_MS;
      message = `Your strikes begin to hit harder (+${SHAMAN_ENHANCE_DAMAGE_BONUS} damage).`;
    } else {
      message = 'You fumble the incantation and nothing happens.';
    }

    const growth = this.maybeGrowSpellSkill(client, SHAMAN_ENHANCE_DAMAGE_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, active: succeeded, mana: client.data.mana, skills: client.data.skills, message };
  }

  // Drink/pour/irrigo (items 7 & 8's follow-up asks) all act on a single
  // targeted inventory item — this validates the index/item once for all
  // three rather than repeating it, returning the item string on success
  // or an ack-shaped rejection to return directly.
  private resolveCanteenTarget(client: GameSocket, itemIndex: unknown): { item: string } | { reject: CanteenActionAck } {
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) {
      return { reject: { ok: false, message: 'Invalid item.' } };
    }
    const item = client.data.inventory[itemIndex];
    if (item === undefined) {
      return { reject: { ok: false, message: "You don't have that." } };
    }
    return { item };
  }

  // Drinking from a canteen (item 7) — one charge per drink, no mana cost
  // (it's not a spell), just depletes the canteen.
  @SubscribeMessage('drinkItem')
  handleDrinkItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): CanteenActionAck {
    const resolved = this.resolveCanteenTarget(client, itemIndex);
    if ('reject' in resolved) return resolved.reject;
    if (resolved.item !== CANTEEN_ITEM) {
      return { ok: false, message: "You can't drink that." };
    }
    if (client.data.canteenDrinks <= 0) {
      return { ok: false, message: 'Your canteen is empty.' };
    }
    client.data.canteenDrinks -= 1;
    // Eating & drinking (a follow-up ask) — a canteen drink restores
    // thirst same as a cup of water (see applyConsume).
    client.data.thirst = Math.min(MAX_HUNGER_THIRST, client.data.thirst + THIRST_RESTORE_PERCENT);
    this.worldManager.updateState(client.data.username, { canteenDrinks: client.data.canteenDrinks });
    void this.persistStats(client);
    return { ok: true, canteenDrinks: client.data.canteenDrinks, thirst: client.data.thirst, message: 'You take a drink from your canteen.' };
  }

  // Pouring a canteen out (item 7) — dumps whatever's left, regardless of
  // how much that is.
  @SubscribeMessage('pourItem')
  handlePourItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): CanteenActionAck {
    const resolved = this.resolveCanteenTarget(client, itemIndex);
    if ('reject' in resolved) return resolved.reject;
    if (resolved.item !== CANTEEN_ITEM) {
      return { ok: false, message: "You can't pour that out." };
    }
    if (client.data.canteenDrinks <= 0) {
      return { ok: false, message: 'Your canteen is already empty.' };
    }
    client.data.canteenDrinks = 0;
    this.worldManager.updateState(client.data.username, { canteenDrinks: client.data.canteenDrinks });
    void this.persistStats(client);
    return { ok: true, canteenDrinks: client.data.canteenDrinks, message: 'You pour out your canteen.' };
  }

  // Irrigo (items 6, 8, 9, 11's follow-up asks) — fills a targeted
  // fillable item (a canteen today, see shared/items.ts's FILLABLE_ITEMS)
  // with water. Requires the skill, a wand equipped, and enough mana;
  // costs mana on every real cast attempt (an already-full target still
  // counts as one), same "the spell fired, it just had nothing to do"
  // treatment as casting any other spell with no effect left to have.
  // Same percent-chance success formula (and 2%-per-cast growth roll) as
  // lucem now (a later follow-up ask: "irrigo should have the same
  // chance of succeeding... that lucem does") — a fumble still spends the
  // mana but leaves the target's fill level untouched.
  @SubscribeMessage('castIrrigo')
  handleCastIrrigo(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): CanteenActionAck {
    if (client.data.skills[WATERFILL_SKILL] === undefined) {
      return { ok: false, message: "You don't know the irrigo spell yet." };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      return { ok: false, message: 'You need a wand equipped to cast irrigo.' };
    }
    const resolved = this.resolveCanteenTarget(client, itemIndex);
    if ('reject' in resolved) return resolved.reject;
    if (!isFillableItem(resolved.item)) {
      return { ok: false, message: "You can't fill that." };
    }
    if (client.data.mana < IRRIGO_CAST_MANA_COST) {
      return { ok: false, message: `You don't have enough mana to cast irrigo (${IRRIGO_CAST_MANA_COST} needed).` };
    }

    client.data.mana -= IRRIGO_CAST_MANA_COST;

    let message: string;
    if (!this.rollSpellSuccess(client, WATERFILL_SKILL)) {
      message = 'You fumble the incantation and nothing happens.';
    } else if (client.data.canteenDrinks >= CANTEEN_CAPACITY) {
      message = `Your ${resolved.item} is already full and cannot be filled.`;
    } else {
      client.data.canteenDrinks = CANTEEN_CAPACITY;
      message = `You fill your ${resolved.item} with water!`;
    }

    const growth = this.maybeGrowSpellSkill(client, WATERFILL_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, canteenDrinks: client.data.canteenDrinks, skills: client.data.skills });
    void this.persistStats(client);
    return {
      ok: true,
      mana: client.data.mana,
      canteenDrinks: client.data.canteenDrinks,
      skills: client.data.skills,
      message,
    };
  }

  // Local (map-scoped) chat — same shape as punch: fire-and-forget,
  // rebroadcast only to the sender's own map room, so someone in the
  // Labyrinth or a town never sees Great Plains chat and vice versa. A
  // message starting with "/" is a command instead (see handleCommand)
  // and is never broadcast — only the issuer sees its response.
  @SubscribeMessage('chat')
  handleChat(@ConnectedSocket() client: GameSocket, @MessageBody() rawMessage: unknown): void {
    if (typeof rawMessage !== 'string') return;
    const trimmed = rawMessage.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/')) {
      this.handleCommand(client, trimmed.slice(1));
      return;
    }

    const message = trimmed.slice(0, 240);
    this.server.to(client.data.map).emit('chat', { username: client.data.username, map: client.data.map, message });
  }

  // A private (sender-only) chat line — reuses the same 'chat' event/log
  // rather than a whole separate channel, since command responses are
  // just "a message only you can see".
  private systemMessage(client: GameSocket, message: string): void {
    client.emit('chat', { username: 'System', map: client.data.map, message });
  }

  // Derived from shared/commands.ts (a later follow-up ask's Help modal
  // reuses the exact same list) so the two can never drift apart.
  private static readonly COMMANDS_HELP_TEXT = [
    'Available commands:',
    ...CHAT_COMMANDS.map((c) => `${c.usage} - ${c.description}`),
  ].join('\n');

  private handleCommand(client: GameSocket, commandText: string): void {
    const trimmed = commandText.trim();
    const spaceIndex = trimmed.indexOf(' ');
    const rawCommand = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
    const arg = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();
    const command = rawCommand.toLowerCase();

    switch (command) {
      case 'commands':
      case 'help':
        this.systemMessage(client, GameGateway.COMMANDS_HELP_TEXT);
        break;
      case 'sleep':
        this.handleSleepCommand(client);
        break;
      case 'rest':
      case 'sit':
        this.handleRestCommand(client);
        break;
      case 'wake':
      case 'stand':
        this.handleWakeCommand(client);
        break;
      case 'dance':
        this.handleDanceCommand(client);
        break;
      case 'mimic':
        this.handleMimicCommand(client, arg);
        break;
      case 'revert':
        this.handleRevertCommand(client);
        break;
      case 'time':
        this.handleTimeCommand(client);
        break;
      case 'light':
        this.handleLucemCommand(client);
        break;
      default:
        this.systemMessage(client, `Unknown command: /${command}. Try /commands.`);
    }
  }

  // Persists/broadcasts a mimic-form change — shared by both /mimic and
  // /revert (reverting is just setting it back to null).
  private setMimicForm(client: GameSocket, mimicForm: (Race | MonsterKind) | null): void {
    client.data.mimicForm = mimicForm;
    this.worldManager.updateState(client.data.username, { mimicForm });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  private handleMimicCommand(client: GameSocket, rawTarget: string): void {
    if (client.data.race !== 'slime') {
      this.systemMessage(client, 'Only a slime can mimic another creature.');
      return;
    }
    if (!rawTarget) {
      this.systemMessage(
        client,
        client.data.mimicableRaces.length === 0
          ? "You haven't consumed any unique body parts to mimic yet."
          : `You can mimic: ${client.data.mimicableRaces.join(', ')}. Use /mimic <name>.`
      );
      return;
    }
    const target = rawTarget.toLowerCase();
    const match = client.data.mimicableRaces.find((r) => r.toLowerCase() === target);
    if (!match) {
      this.systemMessage(client, `You haven't learned to mimic "${rawTarget}". Try /mimic to see your options.`);
      return;
    }
    this.setMimicForm(client, match);
    this.systemMessage(client, `You shift your form to mimic a ${match}.`);
  }

  private handleRevertCommand(client: GameSocket): void {
    if (client.data.race !== 'slime') {
      this.systemMessage(client, 'Only a slime can revert to a mimicked form.');
      return;
    }
    if (client.data.mimicForm === null) {
      this.systemMessage(client, 'You are already in your natural slime form.');
      return;
    }
    this.setMimicForm(client, null);
    this.systemMessage(client, 'You revert to your natural slime form.');
  }

  // The lucem skill's own no-target toggle — requires both the skill
  // (learned from the Utilization classroom's spellbook, see
  // handleReadLucemBook) and a wand actually equipped. Lighting it is a
  // real cast attempt (a follow-up ask): always costs mana whether it
  // works or not, and only has a (skill percent + SPELL_CAST_SUCCESS_BONUS,
  // capped at 100)% chance of actually lighting the wand — fumbling still
  // spent the mana, same as swinging and missing still counts as the
  // swing. Turning it back off is free (you're stopping a spell, not
  // casting a new one) but still rolls the same skill-growth chance
  // lighting does. Ack-based (a later follow-up ask, "messages should
  // show even if a modal is open") rather than the old fire-and-forget
  // '/lucem' chat command — see handleCastLucem/WorldScene's
  // useTargetedSkill, which toasts whatever message comes back so it's
  // visible even with the Inventory (or any other) modal open, on top of
  // still logging it the normal way via systemMessage below.
  private handleLucemCommand(client: GameSocket): CastSpellAck {
    if (client.data.skills[LIGHT_SKILL] === undefined) {
      const message = "You don't know the lucem spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      const message = 'You need a wand equipped to cast lucem.';
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    // A follow-up ask: a flat 5-minute cooldown, same shape/message as
    // every other on-cooldown spell — only gates turning it ON, not
    // toggling it back off (see startSkillCooldown's own call below,
    // only reached from the success branch).
    const cooldownUntil = client.data.skillCooldowns[LIGHT_SKILL];
    if (!client.data.wandLit && cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      const message = `Lucem is still recharging (${secondsLeft}s left).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }

    let message: string;
    if (!client.data.wandLit) {
      if (client.data.mana < LUCEM_CAST_MANA_COST) {
        const insufficientMana = `You don't have enough mana to cast lucem (${LUCEM_CAST_MANA_COST} needed).`;
        this.systemMessage(client, insufficientMana);
        return { ok: false, message: insufficientMana };
      }
      client.data.mana -= LUCEM_CAST_MANA_COST;
      const skillPercent = client.data.skills[LIGHT_SKILL] ?? STARTING_SKILL_PERCENT;
      if (this.rollSpellSuccess(client, LIGHT_SKILL)) {
        client.data.wandLit = true;
        client.data.wandLitUntil = Date.now() + spellDurationMs(skillPercent);
        this.startSkillCooldown(client, LIGHT_SKILL);
        message = 'Your wand glows with a soft light.';
      } else {
        message = 'You fumble the incantation and nothing happens.';
      }
    } else {
      client.data.wandLit = false;
      client.data.wandLitUntil = null;
      message = 'Your wand goes dark.';
    }

    const growth = this.maybeGrowSpellSkill(client, LIGHT_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { wandLit: client.data.wandLit, mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, active: client.data.wandLit, mana: client.data.mana, skills: client.data.skills, message };
  }

  @SubscribeMessage('castLucem')
  handleCastLucem(@ConnectedSocket() client: GameSocket): CastSpellAck {
    return this.handleLucemCommand(client);
  }

  // Utilization's second podium's spell (a later follow-up ask) — same
  // mechanics as lucem (mana cost, success-chance formula, growth-per-
  // cast). Used to skip the wand requirement entirely ("a self-buff, not
  // a light source") — a later follow-up ask made the wand rule blanket
  // ("if a wand is not equipped then a player should not be able to cast
  // A spell"), so that carve-out is gone. While active, boosts the
  // caster's own movement speed by ~10% (see WorldScene's
  // effectiveMoveCooldownMs) for spellDurationMs, scaling up with skill%
  // the same way lucem's own duration does.
  private handleCeleritasCommand(client: GameSocket): CastSpellAck {
    if (client.data.skills[HASTE_SKILL] === undefined) {
      const message = "You don't know the celeritas spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (!isWandItem(client.data.equipment.weapon)) {
      const message = 'You need a wand equipped to cast spells.';
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    // A follow-up ask: a flat 5-minute cooldown, same shape as lucem's
    // own — only gates turning it ON.
    const cooldownUntil = client.data.skillCooldowns[HASTE_SKILL];
    if (!client.data.celeritasActive && cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      const message = `Celeritas is still recharging (${secondsLeft}s left).`;
      this.systemMessage(client, message);
      return { ok: false, message };
    }

    let message: string;
    if (!client.data.celeritasActive) {
      if (client.data.mana < CELERITAS_CAST_MANA_COST) {
        const insufficientMana = `You don't have enough mana to cast celeritas (${CELERITAS_CAST_MANA_COST} needed).`;
        this.systemMessage(client, insufficientMana);
        return { ok: false, message: insufficientMana };
      }
      client.data.mana -= CELERITAS_CAST_MANA_COST;
      const skillPercent = client.data.skills[HASTE_SKILL] ?? STARTING_SKILL_PERCENT;
      if (this.rollSpellSuccess(client, HASTE_SKILL)) {
        client.data.celeritasActive = true;
        client.data.celeritasActiveUntil = Date.now() + spellDurationMs(skillPercent);
        this.startSkillCooldown(client, HASTE_SKILL);
        message = 'Your feet feel lighter — you move with a spring in your step.';
      } else {
        message = 'You fumble the incantation and nothing happens.';
      }
    } else {
      client.data.celeritasActive = false;
      client.data.celeritasActiveUntil = null;
      message = 'The spring leaves your step.';
    }

    const growth = this.maybeGrowSpellSkill(client, HASTE_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, {
      mana: client.data.mana,
      skills: client.data.skills,
      celeritasActive: client.data.celeritasActive,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    return { ok: true, active: client.data.celeritasActive, mana: client.data.mana, skills: client.data.skills, message };
  }

  @SubscribeMessage('castCeleritas')
  handleCastCeleritas(@ConnectedSocket() client: GameSocket): CastSpellAck {
    return this.handleCeleritasCommand(client);
  }

  private handleTimeCommand(client: GameSocket): void {
    const hour = String(this.worldHour).padStart(2, '0');
    const label = timeOfDayLabel(this.worldHour);
    this.systemMessage(client, `It is currently ${hour}:00 (${label}).`);
  }

  // Toggles sleeping <-> awake, same messages as the text game. Never
  // persisted (see handleConnection) — restState always resets to awake
  // on a fresh connection.
  private handleSleepCommand(client: GameSocket): void {
    if (client.data.restState === 'sleeping') {
      this.setRestState(client, 'awake');
      this.systemMessage(client, 'You wake up.');
    } else if (this.playerCombat.has(client.data.username)) {
      // A follow-up bug fix: "I was fighting the training skeleton and
      // went to sleep and it kept attacking the skeleton" — sleeping
      // never actually stopped the auto-attack session (see combatTick,
      // which doesn't check restState at all), so the player kept
      // swinging away, unattended, the whole time they were "asleep."
      // Simplest fix: block falling asleep in the first place while a
      // session is still active, same as every other rest/sleep entry
      // point below.
      this.systemMessage(client, 'You must stop auto-attacking first (press X).');
    } else {
      this.setRestState(client, 'sleeping');
      this.systemMessage(client, "You lie down and drift off to sleep. You won't see anything until you wake up.");
    }
  }

  // A Dorms bed (a later follow-up ask) — same sleeping restState as
  // '/sleep' above, just with the extra 15% heal bonus (see
  // applyStatTick) and its own Affects wording. The client already
  // gated the confirmation modal on being within 3 tiles (see
  // WorldScene's bed click handler); this re-validates both the reach
  // AND that (row, col) is actually a real bed before trusting it.
  @SubscribeMessage('sleepInBed')
  handleSleepInBed(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ row: z.number(), col: z.number() }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid bed.' };
    const { row, col } = parsed.data;
    if (!isBedBlocked(client.data.map, row, col)) {
      return { ok: false, message: "That's not a bed." };
    }
    if (!isWithinRadius(client.data.row, client.data.col, row, col, BED_REACH_TILES)) {
      return { ok: false, message: "You're too far away to use that bed." };
    }
    // Same follow-up bug fix as handleSleepCommand's own guard.
    if (this.playerCombat.has(client.data.username)) {
      return { ok: false, message: 'You must stop auto-attacking first (press X).' };
    }
    client.data.sleepingInBed = true;
    this.setRestState(client, 'sleeping');
    const message = "You climb into bed and drift off to sleep. You won't see anything until you wake up.";
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // A follow-up ask: "make the benches in each room clickable... when in
  // range (2 feet) and the player clicks a bench a modal should pop up
  // and ask them if they would like to rest" — same reach-then-confirm
  // shape as handleSleepInBed above, just resting (with its own +10%
  // near-a-bench bonus, see applyStatTick's own restingOnBench check)
  // instead of sleeping.
  @SubscribeMessage('restOnBench')
  handleRestOnBench(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): { ok: boolean; message?: string } {
    const parsed = z.object({ row: z.number(), col: z.number() }).safeParse(payload);
    if (!parsed.success) return { ok: false, message: 'Invalid bench.' };
    const { row, col } = parsed.data;
    if (!isBenchBlocked(client.data.map, row, col)) {
      return { ok: false, message: "That's not a bench." };
    }
    // A follow-up bug fix: this used to check BENCH_REACH_TILES (2 tiles)
    // — looser than isNearBench's own distance-1 check, which is what
    // actually decides whether applyStatTick's restingOnBench bonus
    // applies. A player 2 tiles away could sit down here but never
    // actually get the enhanced regeneration it promised. Same check
    // both places now.
    if (!isNearBench(client.data.map, client.data.row, client.data.col)) {
      return { ok: false, message: "You're too far away to reach that bench." };
    }
    // Same follow-up bug fix as handleSleepCommand's own guard.
    if (this.playerCombat.has(client.data.username)) {
      return { ok: false, message: 'You must stop auto-attacking first (press X).' };
    }
    this.setRestState(client, 'resting');
    const message = 'You sit down on the bench, receiving enhanced regeneration while you rest.';
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // Toggles resting <-> awake ("sit" is just an alias, same as the text
  // game — there's no separate sit state).
  private handleRestCommand(client: GameSocket): void {
    if (client.data.restState === 'resting') {
      this.setRestState(client, 'awake');
      this.systemMessage(client, 'You stand up.');
    } else if (this.playerCombat.has(client.data.username)) {
      // Same follow-up bug fix as handleSleepCommand above.
      this.systemMessage(client, 'You must stop auto-attacking first (press X).');
    } else {
      this.setRestState(client, 'resting');
      this.systemMessage(client, 'You sit down to rest.');
    }
  }

  // Explicit, direction-agnostic — always forces awake regardless of
  // prior state.
  private handleWakeCommand(client: GameSocket): void {
    const was = client.data.restState;
    if (was === 'awake') {
      this.systemMessage(client, 'You are already up and about.');
      return;
    }
    this.setRestState(client, 'awake');
    this.systemMessage(client, was === 'sleeping' ? 'You wake up.' : 'You stand up.');
  }

  private setRestState(client: GameSocket, restState: RestState): void {
    client.data.restState = restState;
    // Sleeping in a Dorms bed (a later follow-up ask) only applies while
    // actually sleeping — waking up OR sitting down to rest instead both
    // drop it, regardless of which command triggered the transition
    // (every path funnels through here).
    if (restState !== 'sleeping') client.data.sleepingInBed = false;
    this.worldManager.updateState(client.data.username, { restState });
    // The client's own map:state handling filters its own entry out of
    // the players list (see main.ts's applyMapState) — a targeted 'sync'
    // is what actually updates the acting client's own myProfile/sleep
    // overlay, on top of the broadcast every OTHER player in the room
    // needs to see the sleeper's sprite change.
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  // Moving or attacking always wakes/stands a player up first (a
  // deliberate departure from the text game, which only wakes on an
  // explicit command — but a screen actually blacked out during a live
  // 2D session needs a way back that isn't "type a slash command blind").
  // Phase C's own "sleep/wake" ask extends this to the player's own
  // followers too — every call site here (handleMove, engageInDirection,
  // ...) means the player is clearly back in action, so any sleeping pet/
  // animated monster wakes right along with them, same reasoning.
  private wakeIfNeeded(client: GameSocket): void {
    this.wakeFollowersIfNeeded(client);
    if (client.data.restState === 'awake') return;
    const was = client.data.restState;
    this.setRestState(client, 'awake');
    this.systemMessage(client, was === 'sleeping' ? 'You wake up.' : 'You stand up.');
  }

  // Flips any of the caller's own sleeping followers back to 'follow' —
  // unconditional (unlike the player's own wake check above), since the
  // PLAYER can already be awake while their pet is still asleep.
  private wakeFollowersIfNeeded(client: GameSocket): void {
    const { username } = client.data;
    let changed = false;
    const pet = this.petManager.getPet(username);
    if (pet?.alive && pet.command === 'sleep') {
      this.petManager.setCommand(username, 'follow');
      changed = true;
    }
    for (const m of this.animatedMonsterManager.getSnapshotsForOwner(username)) {
      if (m.alive && m.command === 'sleep') {
        this.animatedMonsterManager.setCommand(username, m.id, 'follow');
        changed = true;
      }
    }
    if (changed) this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  // The /dance command (a later follow-up ask) — a toggle, same shape as
  // lucem/celeritas: issuing it again stops early. "Moving should cancel
  // it" is handled by stopDancingIfNeeded below, called from handleMove
  // the same way wakeIfNeeded is.
  private setDancing(client: GameSocket, dancing: boolean): void {
    client.data.dancing = dancing;
    this.worldManager.updateState(client.data.username, { dancing });
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
  }

  private handleDanceCommand(client: GameSocket): void {
    if (client.data.dancing) {
      this.setDancing(client, false);
      this.systemMessage(client, 'You stop dancing.');
      return;
    }
    this.wakeIfNeeded(client);
    this.setDancing(client, true);
    this.systemMessage(client, 'You start dancing!');
  }

  // Moving cancels the dance (a later follow-up ask) — silent (no "you
  // stop dancing" message) since the player already knows they just
  // moved; unlike wakeIfNeeded, this never needs a message of its own.
  private stopDancingIfNeeded(client: GameSocket): void {
    if (!client.data.dancing) return;
    this.setDancing(client, false);
  }

  // Backs the map modal's "Who" (everyone online) and "Where" (filtered
  // client-side to the asker's own map) tabs.
  @SubscribeMessage('who')
  handleWho(): { players: Array<{ username: string; map: MapName; level: number }> } {
    return { players: this.worldManager.getAllPlayers() };
  }

  // ===== TESTING OVERRIDE — REMOVE AFTER TESTING ===== "add a 'cheat'
  // hotkey... pressing it should recover my mana to 100%. This will go
  // away after testing." Bound to the '~' key client-side (see
  // WorldScene's create()).
  @SubscribeMessage('cheatFullMana')
  handleCheatFullMana(@ConnectedSocket() client: GameSocket): SyncPayload {
    client.data.mana = client.data.maxMana;
    this.worldManager.updateState(client.data.username, { mana: client.data.mana });
    void this.persistStats(client);
    return { player: this.snapshotFor(client) };
  }

  // Shared by both useItem's "consume" path and the forced consumeItem
  // RPC: rolls a resistance skill if this item's name maps to one (see
  // resistanceGrantForItem). Returns the flavor message lines to show, if
  // any. (A later follow-up ask removed the old consumeExp counter and
  // its Hobgoblin-evolution-by-consuming mechanic entirely — "there is no
  // evolution through consuming in the wizard world.")
  private applyConsume(client: GameSocket, item: string): string[] {
    const messages: string[] = [];
    // Eating & drinking (a follow-up ask) — a cup of water/jerky each
    // restore a flat percent of thirst/hunger and, like every other
    // consumable, are gone from the inventory the instant they're
    // clicked (see handleUseItem/handleConsumeItem, which splice the item
    // out before this ever runs).
    if (item === CUP_OF_WATER_ITEM) {
      client.data.thirst = Math.min(MAX_HUNGER_THIRST, client.data.thirst + THIRST_RESTORE_PERCENT);
      messages.push('You drink the cup of water, quenching your thirst a little.');
      return messages;
    }
    if (item === JERKY_ITEM) {
      client.data.hunger = Math.min(MAX_HUNGER_THIRST, client.data.hunger + HUNGER_RESTORE_PERCENT);
      messages.push('You eat the jerky, easing your hunger a little.');
      return messages;
    }
    // Bramwick General Shop's own salmon (a later follow-up ask) — same
    // shape as jerky above, its own bigger restore amount.
    if (item === SALMON_ITEM) {
      client.data.hunger = Math.min(MAX_HUNGER_THIRST, client.data.hunger + SALMON_HUNGER_RESTORE_PERCENT);
      messages.push('You eat the salmon, filling your belly nicely.');
      return messages;
    }
    // Bramwick Potions' own hp/mp potions (a later follow-up ask) — flat
    // restore, capped at the player's own current max (which can be
    // above 100, unlike hunger/thirst's fixed 0-100 scale).
    if (item === HP_POTION_ITEM) {
      client.data.hp = Math.min(client.data.maxHp, client.data.hp + POTION_RESTORE_AMOUNT);
      messages.push('You drink the hp potion, recovering some health.');
      return messages;
    }
    if (item === MP_POTION_ITEM) {
      client.data.mana = Math.min(client.data.maxMana, client.data.mana + POTION_RESTORE_AMOUNT);
      messages.push('You drink the mp potion, recovering some mana.');
      return messages;
    }
    const grant = resistanceGrantForItem(item);
    if (grant) {
      if (client.data.skills[grant.skill] === undefined) {
        if (Math.random() < grant.chance) {
          client.data.skills = { ...client.data.skills, [grant.skill]: RESISTANCE_SKILL_STARTING_PERCENT };
          messages.push(`You have gained ${grant.skill} (${RESISTANCE_SKILL_STARTING_PERCENT}%)!`);
        }
      } else {
        // Item 1: consuming this kind of item again once the skill is
        // already known used to just silently do nothing — no feedback at
        // all that nothing new could come of it.
        messages.push(`You have already learned ${grant.skill} from this kind of item!`);
      }
    }
    if (item === 'bone dagger') {
      if (client.data.skills[BONE_FINGER_STRIKE_SKILL] === undefined) {
        if (Math.random() < BONE_FINGER_STRIKE_GRANT_CHANCE) {
          client.data.skills = { ...client.data.skills, [BONE_FINGER_STRIKE_SKILL]: STARTING_SKILL_PERCENT };
          messages.push(`You have gained ${BONE_FINGER_STRIKE_SKILL} (${STARTING_SKILL_PERCENT}%)!`);
        }
      } else {
        messages.push(`You have already learned ${BONE_FINGER_STRIKE_SKILL} from bone daggers!`);
      }
    }

    // Slime-only: consuming a body part it's never eaten before teaches
    // it to mimic that race/monster-kind's appearance (see /mimic and
    // /revert below) — no mechanical bonus yet, purely cosmetic.
    if (client.data.race === 'slime') {
      const learned = raceForBodyPart(item);
      if (learned && !client.data.mimicableRaces.includes(learned)) {
        client.data.mimicableRaces = [...client.data.mimicableRaces, learned];
        messages.push(`You have learned to mimic a ${learned}! (/mimic ${learned})`);
      }
    }

    return messages;
  }

  // Persists/broadcasts/builds the ack after either an equip or a
  // consume — both useItem and consumeItem end the same way.
  private finishItemAction(
    client: GameSocket,
    inventory: string[],
    action: 'consumed' | 'equipped' | 'unequipped',
    messages: string[]
  ): UseItemAck {
    client.data.inventory = inventory;
    this.worldManager.updateState(client.data.username, {
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      skills: client.data.skills,
      mimicableRaces: client.data.mimicableRaces,
    });
    void this.persistStats(client);
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return {
      ok: true,
      action,
      inventory: client.data.inventory,
      equipment: client.data.equipment,
      skills: client.data.skills,
      hunger: client.data.hunger,
      thirst: client.data.thirst,
      message: messages.length > 0 ? messages.join('\n') : undefined,
    };
  }

  // Clicking an inventory item: the server alone decides whether it's
  // equippable (see combat/formulas.ts's EQUIPMENT_SLOT_FOR_ITEM) or just
  // a consumable body part. Equipping swaps out whatever was already in
  // that slot (returning it to inventory, mirroring the text game's own
  // "unequip the old one first" behavior); consuming removes it for good.
  @SubscribeMessage('useItem')
  handleUseItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): UseItemAck {
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) {
      return { ok: false, message: 'Invalid item.' };
    }

    const item = client.data.inventory[itemIndex];
    if (item === undefined) {
      return { ok: false, message: "You don't have that." };
    }
    // Fillable items (a canteen, item 7) aren't equippable OR consumable
    // — they're acted on via drink/pour/irrigo instead (see
    // handleDrinkItem/handlePourItem/handleCastIrrigo), targeted from the
    // action bar. Guarded here so a stray click doesn't delete one.
    if (isFillableItem(item)) {
      return { ok: false, message: 'Target it, then use drink, pour out, or irrigo from your action bar.' };
    }
    if (isManaCrystal(item)) {
      return { ok: false, message: "It hums faintly, but doesn't do anything yet. Hold onto it." };
    }

    const inventory = [...client.data.inventory];
    inventory.splice(itemIndex, 1);

    // A ring's own slot isn't fixed (a later follow-up ask) — resolved
    // fresh against whichever hands are already occupied every time one
    // gets equipped, instead of EQUIPMENT_SLOT_FOR_ITEM's ordinary static
    // per-item slot.
    const slot = isRingItem(item) ? resolveRingSlot(client.data.equipment) : EQUIPMENT_SLOT_FOR_ITEM[item];
    if (slot) {
      const previous = client.data.equipment[slot];
      if (previous) inventory.push(previous);
      client.data.equipment = { ...client.data.equipment, [slot]: item };
      if (slot === 'shield' && previous === TORCH_ITEM) this.pauseTorch(client);
      if (slot === 'shield' && item === TORCH_ITEM) this.lightTorch(client);
      return this.finishItemAction(client, inventory, 'equipped', []);
    }

    const messages = this.applyConsume(client, item);
    return this.finishItemAction(client, inventory, 'consumed', messages);
  }

  // Right-clicking an inventory item (see main.ts, which captures the
  // browser's own context-menu event to trigger this instead) always
  // consumes it, even if it's normally equippable (a bone dagger, say) —
  // same as the text game's "eat <item>" letting you consume a weapon
  // for its exp instead of wielding it.
  @SubscribeMessage('consumeItem')
  handleConsumeItem(@ConnectedSocket() client: GameSocket, @MessageBody() itemIndex: unknown): UseItemAck {
    if (typeof itemIndex !== 'number' || !Number.isInteger(itemIndex)) {
      return { ok: false, message: 'Invalid item.' };
    }

    const item = client.data.inventory[itemIndex];
    if (item === undefined) {
      return { ok: false, message: "You don't have that." };
    }
    if (isFillableItem(item)) {
      return { ok: false, message: 'Target it, then use drink, pour out, or irrigo from your action bar.' };
    }
    if (isManaCrystal(item)) {
      return { ok: false, message: "It hums faintly, but doesn't do anything yet. Hold onto it." };
    }

    const inventory = [...client.data.inventory];
    inventory.splice(itemIndex, 1);

    const messages = this.applyConsume(client, item);
    return this.finishItemAction(client, inventory, 'consumed', messages);
  }

  // The Equipment modal's 'x' button (item 15) — takes whatever's in the
  // given slot back off and returns it to the inventory. Equipping is
  // still the only way to fill a slot (see handleUseItem); this only
  // ever empties one.
  @SubscribeMessage('unequipItem')
  handleUnequipItem(@ConnectedSocket() client: GameSocket, @MessageBody() rawSlot: unknown): UseItemAck {
    const parsed = equipmentSlotSchema.safeParse(rawSlot);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid equipment slot.' };
    }
    const slot = parsed.data;
    const item = client.data.equipment[slot];
    if (!item) {
      return { ok: true, inventory: client.data.inventory, equipment: client.data.equipment };
    }

    const equipment = { ...client.data.equipment };
    delete equipment[slot];
    client.data.equipment = equipment;
    if (slot === 'shield' && item === TORCH_ITEM) this.pauseTorch(client);
    // Unequipping the wand while lucem is lit (a follow-up ask) — the
    // glow animation itself already checks equipment.weapon === WAND_ITEM
    // (see WorldScene's showGlow), so it stops immediately, but wandLit
    // itself must also be cleared here or re-equipping the SAME wand
    // later would silently resume the glow (and its light radius/mana
    // upkeep) without ever re-casting.
    const messages: string[] = [];
    if (slot === 'weapon' && client.data.wandLit) {
      client.data.wandLit = false;
      client.data.wandLitUntil = null;
      this.worldManager.updateState(client.data.username, { wandLit: false });
      // UseItemAck doesn't carry wandLit itself — the client's own
      // myProfile.wandLit (read directly by affectsPanel/WorldScene's
      // light-radius and re-equip glow checks) needs its own fresh sync,
      // not just the equipment/inventory fields the ack already returns.
      client.emit('sync', { player: this.snapshotFor(client) });
      messages.push('Your wand goes dark as you unequip it.');
    }
    const inventory = [...client.data.inventory, item];
    return this.finishItemAction(client, inventory, 'unequipped', messages);
  }
}
