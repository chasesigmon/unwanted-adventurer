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
import { STARTING_MAP, DIRECTIONS, MAP_NAMES } from '../../shared/constants.js';
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
  STARTING_SKILL_PERCENT,
  MAX_SKILL_PERCENT,
  RACE_INNATE_SKILLS,
  SKILL_GROWTH_CHANCE,
  LEVEL_UP_ATTRIBUTE_BONUS,
  LEVEL_UP_VITAL_BONUS,
  HP_PER_CONSTITUTION,
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
  CONSUME_EXP_PER_ITEM,
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
  HOBGOBLIN_EVOLUTION_SKILLS,
  HOBGOBLIN_EVOLUTION_CXP,
  HOBGOBLIN_ATTRIBUTE_BONUS,
  HOBGOBLIN_STAT_BONUS,
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
  EatBrainsAck,
  SacrificeAck,
  MoveAck,
  ReadLucemBookAck,
  ReadIrrigoBookAck,
  ReadCeleritasBookAck,
  ReadAugueBookAck,
  CanteenActionAck,
  CastSpellAck,
  AugueTargetPayload,
  ReadReseraBookAck,
  CastReseraAck,
  OpenChestAck,
  TakeChestItemAck,
  ReadSpellBookAck,
  MapStatePayload,
  StoneBlockSnapshot,
  TileTargetPayload,
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
} from '../../shared/lighting.js';
import { WAND_ITEM } from '../../shared/equipment.js';
import {
  LUCEM_SKILL,
  IRRIGO_SKILL,
  CELERITAS_SKILL,
  AUGUE_SKILL,
  WAND_BOLT_SKILL,
  RESERA_SKILL,
  SPELL_ATTACK_RANGE_TILES,
  STUPEFACIUNT_SKILL,
  EXARME_SKILL,
  SCUTUM_SKILL,
  MURUS_LAPIDEUS_SKILL,
} from '../../shared/skills.js';
import {
  LUCEM_BOOK_MAP,
  LUCEM_BOOK_POSITION,
  IRRIGO_BOOK_MAP,
  IRRIGO_BOOK_POSITION,
  CELERITAS_BOOK_MAP,
  CELERITAS_BOOK_POSITION,
  AUGUE_BOOK_MAP,
  AUGUE_BOOK_POSITION,
  RESERA_BOOK_MAP,
  RESERA_BOOK_POSITION,
  STUPEFACIUNT_BOOK_MAP,
  STUPEFACIUNT_BOOK_POSITION,
  EXARME_BOOK_MAP,
  EXARME_BOOK_POSITION,
  SCUTUM_BOOK_MAP,
  SCUTUM_BOOK_POSITION,
  MURUS_LAPIDEUS_BOOK_MAP,
  MURUS_LAPIDEUS_BOOK_POSITION,
} from '../../shared/spells.js';
import { CANTEEN_ITEM, CANTEEN_CAPACITY, isFillableItem, manaCrystalForLevel, isManaCrystal } from '../../shared/items.js';
import { MONSTER_KINDS } from '../../shared/constants.js';
import type { Direction, MapName, MonsterClass, MonsterKind, Race } from '../../shared/constants.js';

const directionSchema = z.enum(DIRECTIONS);
const equipmentSlotSchema = z.enum(EQUIPMENT_SLOTS);
const useSkillSchema = z.object({ direction: directionSchema, skill: z.string() });
const augueTargetSchema = z.object({ targetKind: z.enum(['player', 'npc', 'monster']), targetId: z.string() });

// ===================== TESTING OVERRIDE — REMOVE AFTER TESTING =====================
// "For now make it so that learning skills happens immediately 100% for
// testing purposes, this is going to go back to the original formula
// later." Flip this back to `false` (or delete it and the `? 1 :` ternary
// at each *_BOOK_LEARN_CHANCE call site below) to restore the normal
// 10%-per-read roll. See also the matching client-side testing hotkey
// (WorldScene's '~' key -> network.cheatFullMana) for the OTHER active
// testing change from this same request.
const TESTING_INSTANT_PODIUM_LEARN = true;
// ====================================================================================

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
// Zombie-only "Eat Brains" (see handleEatBrains) — "a 4 tick cooldown"
// measured in the game's actual world tick: the same randomized 30-40s
// global stat tick that advances worldHour (see globalStatTick/
// currentTick below), NOT the 3s monster wander tick. 4 of those ticks is
// ~2-2.7 minutes, not a fixed duration.
const EAT_BRAINS_COOLDOWN_TICKS = 4;
const EAT_BRAINS_HEAL_PERCENT = 20;
// The Utilization classroom's spellbook podium (item 8) — same world-tick
// unit as EAT_BRAINS_COOLDOWN_TICKS above ("2 stat ticks" per the
// request); LUCEM_BOOK_MAP/POSITION live in shared/spells.ts so the
// client (rendering/clicking the podium) and this reach check always
// agree on where it actually is.
const LUCEM_BOOK_COOLDOWN_TICKS = 2;
const LUCEM_BOOK_LEARN_CHANCE = 0.1;
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
// The Elemental Casting classroom's own podium, teaching irrigo — same
// shape as the lucem book above.
const IRRIGO_BOOK_COOLDOWN_TICKS = 2;
const IRRIGO_BOOK_LEARN_CHANCE = 0.1;
// Irrigo itself (item 8's follow-up ask) — a flat mana cost per cast,
// whether it succeeds in filling something or not (an already-full
// target still counts as "you tried," same as a missed punch still costs
// nothing extra but the attempt itself was real).
// "Irrigo should cost 5 mana" (a later follow-up ask, down from 10).
const IRRIGO_CAST_MANA_COST = 5;
// Utilization's second podium (a later follow-up ask), teaching quick
// movement — same shape/mana cost/success formula as lucem, just no wand
// requirement (a self-buff, not tied to a carried light source).
const CELERITAS_BOOK_COOLDOWN_TICKS = 2;
const CELERITAS_BOOK_LEARN_CHANCE = 0.1;
// "Celeritas should cost 7 mana" (a later follow-up ask, down from 10).
const CELERITAS_CAST_MANA_COST = 7;
// The Offense classroom's own podium (a later follow-up ask), teaching
// augue — a targeted fireball, unlike lucem/irrigo/celeritas above. No
// mana cost (not requested); its own cooldown lives in shared/skills.ts's
// SKILL_COOLDOWN_MS (checked the same generic way Glare's is, see
// handleCastAugue) instead of a bespoke constant here.
const AUGUE_BOOK_COOLDOWN_TICKS = 2;
const AUGUE_BOOK_LEARN_CHANCE = 0.1;
const AUGUE_DAMAGE = 10;
const AUGUE_RANGE_TILES = SPELL_ATTACK_RANGE_TILES;
// The wand's own ranged basic attack (a follow-up ask) — flat damage
// (like the punch formula's base, but simplified), resolved every
// combat tick same as any other queued attack (see combatTick's own
// WAND_BOLT_SKILL branch), no cooldown of its own beyond that natural
// ~3s cadence.
const WAND_BOLT_DAMAGE = 5;
const WAND_BOLT_RANGE_TILES = SPELL_ATTACK_RANGE_TILES;
// The Utility Classroom's third podium (a later follow-up ask), teaching
// resera — same learn-chance shape as the other podiums. Costs mana like
// every other cast (not explicitly requested, but consistent with lucem/
// celeritas/augue) via SPELL_CAST_MANA... reusing the same 10-mana figure
// every other spell uses.
const RESERA_BOOK_COOLDOWN_TICKS = 2;
const RESERA_BOOK_LEARN_CHANCE = 0.1;
const RESERA_CAST_MANA_COST = 10;
// Offense's second/third podiums, Defense's own podium, and Summoning's
// own podium (a later follow-up ask) — same learn-chance shape as every
// other podium. "Both spells [stupefaciunt/exarme] should cost 10 mana"/
// "the spell [scutum] should cost 10 mana" — one shared constant since
// all three (and murus lapideus, see below) land on the exact same figure.
const STUPEFACIUNT_BOOK_COOLDOWN_TICKS = 2;
const STUPEFACIUNT_BOOK_LEARN_CHANCE = 0.1;
const EXARME_BOOK_COOLDOWN_TICKS = 2;
const EXARME_BOOK_LEARN_CHANCE = 0.1;
const SCUTUM_BOOK_COOLDOWN_TICKS = 2;
const SCUTUM_BOOK_LEARN_CHANCE = 0.1;
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
// Summoning's own podium (a later follow-up ask), teaching murus
// lapideus — same learn-chance shape as the others.
const MURUS_LAPIDEUS_BOOK_COOLDOWN_TICKS = 2;
const MURUS_LAPIDEUS_BOOK_LEARN_CHANCE = 0.1;
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
const HEAL_PERCENT_RANGE: Record<RestState, [number, number]> = {
  awake: [7, 10],
  resting: [9, 12],
  sleeping: [10, 15],
};
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
    this.monsterManager.spawnInitial();

    setInterval(() => {
      this.combatTickCount += 1;
      this.combatTick();
      this.monsterManager.wanderAll(this.combatTickCount);
      this.monsterManager.respawnBelowMax();
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
    const healed = (current: number, statMax: number, healPercent: number) =>
      Math.min(statMax, current + Math.round((healPercent / 100) * statMax));

    const hp = healed(client.data.hp, client.data.maxHp, percent);
    let mana = healed(client.data.mana, client.data.maxMana, percent);

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

    if (hp === client.data.hp && mana === client.data.mana && !wandJustWentOut) return;

    client.data.hp = hp;
    client.data.mana = mana;
    this.worldManager.updateState(client.data.username, wandJustWentOut ? { hp, mana, wandLit: false } : { hp, mana });
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
      consumeExp: client.data.consumeExp,
      restState: client.data.restState,
      sleepingInBed: client.data.sleepingInBed,
      hasLight: emitsLight(client.data.equipment) || client.data.wandLit,
      wandLit: client.data.wandLit,
      celeritasActive: client.data.celeritasActive,
      scutumActive: client.data.scutumActive,
      wandLitUntil: client.data.wandLitUntil,
      celeritasActiveUntil: client.data.celeritasActiveUntil,
      scutumActiveUntil: client.data.scutumActiveUntil,
      gold: client.data.gold,
      mimicableRaces: client.data.mimicableRaces,
      mimicForm: client.data.mimicForm,
      eatBrainsReadyAtTick: client.data.eatBrainsReadyAtTick,
      skillCooldowns: client.data.skillCooldowns,
      armorClass: armorClassFor(client.data.dexterity, armorEquipmentBonus(client.data.equipment)),
      deathCount: client.data.deathCount,
      mapUnlocked: client.data.mapUnlocked,
      secretDoorUnlocked: client.data.secretDoorUnlocked,
      secretChestUnlocked: client.data.secretChestUnlocked,
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

  // Every map:state broadcast (25+ call sites) goes through here now
  // (a later follow-up ask added stone blocks, which
  // WorldManagerService.getMapState has no way to know about) so none of
  // them need updating individually.
  private mapStateFor(mapName: MapName): MapStatePayload {
    const state = this.worldManager.getMapState(mapName);
    state.stoneBlocks = this.stoneBlockSnapshotsForMap(mapName);
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
        consumeExp: client.data.consumeExp,
        gold: client.data.gold,
        mimicableRaces: client.data.mimicableRaces,
        mimicForm: client.data.mimicForm,
        deathCount: client.data.deathCount,
        condemned: client.data.deathCount >= GameGateway.CONDEATH_LIMIT,
        secretDoorUnlocked: client.data.secretDoorUnlocked,
        secretChestUnlocked: client.data.secretChestUnlocked,
        mapUnlocked: client.data.mapUnlocked,
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

    if (levelsGained > 0) {
      client.data.strength += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.intelligence += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.wisdom += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.dexterity += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.constitution += LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.maxHp += LEVEL_UP_VITAL_BONUS * levelsGained + HP_PER_CONSTITUTION * LEVEL_UP_ATTRIBUTE_BONUS * levelsGained;
      client.data.maxMana += LEVEL_UP_VITAL_BONUS * levelsGained;
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
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
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

  // A small chance per attack/defense (hit or miss doesn't matter here,
  // there's no miss chance at all in this project) to grow the given
  // skill by 1 point, same shape as the text game's own skill growth.
  // Returns the notice message if it actually grew.
  private maybeGrowSkill(client: GameSocket, skill: string): string | undefined {
    const current = client.data.skills[skill] ?? STARTING_SKILL_PERCENT;
    if (current >= MAX_SKILL_PERCENT || Math.random() >= SKILL_GROWTH_CHANCE) return undefined;
    const next = current + 1;
    client.data.skills = { ...client.data.skills, [skill]: next };
    this.worldManager.updateState(client.data.username, { skills: client.data.skills });
    return skillGrowthMessage(skill, next);
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
  private rollExtraAttacks(client: GameSocket, growthMessages: string[]): { swings: number; enhancedBonus: number } {
    let swings = 1;
    let enhancedBonus = 0;

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
      enhancedBonus = enhancedDamageBonus(client.data.skills[ENHANCED_DAMAGE_SKILL] ?? 0);
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
    const defense = this.resolveDefense(this.attackerStatsFor(client), client.data.skills, client.data.equipment, attackerStats);
    if (defense.skill) {
      const growth = this.maybeGrowSkill(client, defense.skill);
      if (growth) growthMessages.push(growth);
    }
    this.maybeGrowResistanceSkill(client, monsterClass, growthMessages);
    if (defense.avoided) {
      return defense.verb === 'block'
        ? `You block the ${attackerLabel}'s counter-attack with your shield!`
        : `You ${defense.verb} the ${attackerLabel}'s counter-attack!`;
    }

    const hasWeapon = attacker?.carriedItems.some((item) => item.toLowerCase().includes('dagger')) ?? false;
    const skillPercent = attacker ? (attacker.skills[hasWeapon ? DAGGER_SKILL : PUNCH_SKILL] ?? 0) : 0;
    const weaponBonus = hasWeapon ? (WEAPON_DAMAGE_BONUS['bone dagger'] ?? 0) : 0;
    const defenderAC = armorClassFor(client.data.dexterity, armorEquipmentBonus(client.data.equipment));
    // A species with its own flat attackDamage (a later follow-up ask:
    // "the imps have a physical attack/punch that should do 5 damage per
    // hit") counter-attacks for exactly that instead of the shared
    // punchDamage() formula.
    const rawDamage = attacker?.attackDamage ?? punchDamage(attackerStats, this.attackerStatsFor(client), skillPercent, weaponBonus, defenderAC);
    const reduction = monsterClass ? monsterDamageReduction(monsterClass, client.data.skills) : 0;
    const scutumReduction = client.data.scutumActive ? SCUTUM_DAMAGE_REDUCTION : 0;
    const damage = Math.max(0, rawDamage - reduction - scutumReduction);
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
    client.data.consumeExp = doc?.consumeExp ?? 0;
    client.data.gold = doc?.gold ?? STARTING_GOLD;
    client.data.mimicableRaces = (doc?.mimicableRaces ?? []) as (Race | MonsterKind)[];
    client.data.mimicForm = (doc?.mimicForm ?? null) as (Race | MonsterKind) | null;
    client.data.deathCount = doc?.deathCount ?? 0;
    // Never persisted — a fresh connection always starts awake, same as
    // the text game's own restState.
    client.data.restState = 'awake';
    client.data.sleepingInBed = false;
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
    client.data.lucemBookReadyAtTick = 0;
    client.data.irrigoBookReadyAtTick = 0;
    client.data.celeritasBookReadyAtTick = 0;
    client.data.augueBookReadyAtTick = 0;
    client.data.reseraBookReadyAtTick = 0;
    client.data.stupefaciuntBookReadyAtTick = 0;
    client.data.exarmeBookReadyAtTick = 0;
    client.data.scutumBookReadyAtTick = 0;
    client.data.murusLapideusBookReadyAtTick = 0;
    // The secret room system (a follow-up ask) — persisted, unlike the
    // cooldowns above; loaded straight from the player doc, defaulting to
    // false for any character that predates this feature (every existing
    // character, Baltar included).
    client.data.secretDoorUnlocked = doc?.secretDoorUnlocked ?? false;
    client.data.secretChestUnlocked = doc?.secretChestUnlocked ?? false;
    client.data.mapUnlocked = doc?.mapUnlocked ?? false;

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
      consumeExp: client.data.consumeExp,
      restState: client.data.restState,
      gold: client.data.gold,
      mimicableRaces: client.data.mimicableRaces,
      mimicForm: client.data.mimicForm,
      eatBrainsReadyAtTick: client.data.eatBrainsReadyAtTick,
      skillCooldowns: client.data.skillCooldowns,
      deathCount: client.data.deathCount,
      wandLit: client.data.wandLit,
      celeritasActive: client.data.celeritasActive,
      scutumActive: client.data.scutumActive,
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

    const { username } = client.data;

    // Town-entry gate — previewed with the same pure resolveMove the
    // actual move uses (no side effects), so an ungated player is turned
    // away at the gate without ever mutating their cached position.
    const loc = this.worldManager.getLocation(username);
    if (loc) {
      const preview = resolveMove(loc, parsed.data);
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
    }

    const result = this.worldManager.processMove(username, parsed.data);
    if (!result) {
      return { ok: false, player: this.snapshotFor(client), message: 'Your session was lost. Please reconnect.' };
    }

    if (!result.ok) {
      return { ok: false, player: this.snapshotFor(client), message: "You can't go that way." };
    }

    const previousMap = client.data.map;
    client.data.map = result.mapName;
    client.data.row = result.row;
    client.data.col = result.col;

    void this.persistPosition(client);

    if (result.transitioned) {
      void client.leave(previousMap);
      void client.join(result.mapName);
      this.server.to(previousMap).emit('map:state', this.mapStateFor(previousMap));
    }
    this.server.to(result.mapName).emit('map:state', this.mapStateFor(result.mapName));

    const message = result.transitioned ? `You enter ${result.mapName}.` : undefined;
    return { ok: true, player: this.snapshotFor(client), message };
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
    if (client.data.equipment.weapon !== WAND_ITEM) {
      return { ok: false, message: 'You need a wand equipped to auto-attack at range.' };
    }
    if (this.isParalyzed(`player:${client.data.username}`)) {
      const message = "You are paralyzed by a skeleton's glare and cannot attack!";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
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
        if (client.data.equipment.weapon !== WAND_ITEM) {
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

  // The wand's ranged basic attack (a follow-up ask) — flat
  // WAND_BOLT_DAMAGE, no dodge/parry/shield-block, no counter-attack (a
  // bolt fired from up to 7 tiles away doesn't give the target a chance
  // to retaliate in melee). Monster kills still grant the usual exp/mana-
  // crystal drop; NPC/scarecrow and player targets follow the same
  // simplified shape handleCastAugue's own target-kind branches use.
  private resolveRangedAutoAttack(client: GameSocket, session: CombatSession): void {
    if (session.targetKind === 'monster') {
      const monster = this.monsterManager.getMonster(session.targetId);
      if (!monster) {
        this.playerCombat.delete(client.data.username);
        return;
      }
      this.monsterManager.setAggro(monster.id, client.data.username, this.combatTickCount);
      const result = this.monsterManager.applyDamage(monster.id, WAND_BOLT_DAMAGE);
      if (!result) return;

      let expGained: number | undefined;
      let leveledUp = false;
      if (result.died) {
        const rawExpGained = expGainFor(monster.expReward, client.data.level, monster.level);
        const grantResult = this.grantExp(client, rawExpGained);
        leveledUp = grantResult.leveledUp;
        expGained = grantResult.message ? undefined : rawExpGained;
        const items = [manaCrystalForLevel(monster.level), ...monster.carriedItems];
        this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username);
        this.playerCombat.delete(client.data.username);
      }
      const message = result.died
        ? `${client.data.username}'s wand bolt strikes the ${monster.kind} for ${WAND_BOLT_DAMAGE} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
        : `${client.data.username}'s wand bolt strikes the ${monster.kind} for ${WAND_BOLT_DAMAGE} damage.`;
      void this.persistStats(client);
      this.emitCombat(client, {
        targetKind: 'monster',
        target: monster.id,
        targetLabel: monster.kind,
        damage: WAND_BOLT_DAMAGE,
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
      npc.hp = Math.max(0, npc.hp - WAND_BOLT_DAMAGE);
      const died = npc.hp <= 0;
      const label = npc.label ?? 'training dummy';
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
          this.playerCombat.delete(client.data.username);
        }
        npc.hp = npc.maxHp;
      }
      const message = died
        ? npc.immortal
          ? `${client.data.username}'s wand bolt strikes the ${label} for ${WAND_BOLT_DAMAGE} damage — it shrugs off the blow, unharmed.`
          : `${client.data.username}'s wand bolt strikes the ${label} for ${WAND_BOLT_DAMAGE} damage, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username}'s wand bolt strikes the ${label} for ${WAND_BOLT_DAMAGE} damage.`;
      void this.persistStats(client);
      this.emitCombat(client, {
        targetKind: 'npc',
        target: npc.id,
        targetLabel: label,
        damage: WAND_BOLT_DAMAGE,
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
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages);
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
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username);
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
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages);
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
    const defenderAC = armorClassFor(targetClient.data.dexterity, armorEquipmentBonus(targetClient.data.equipment));

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
      const { swings, enhancedBonus } = this.rollExtraAttacks(client, growthMessages);
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
    this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
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

    client.data.gold -= item.price;
    client.data.inventory = [...client.data.inventory, item.label];
    this.worldManager.updateState(client.data.username, { gold: client.data.gold, inventory: client.data.inventory });
    void this.persistStats(client);

    return { ok: true, inventory: client.data.inventory, gold: client.data.gold, message: `You buy a ${item.label} for ${item.price} gold.` };
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

  // The Utilization classroom's spellbook podium (item 8): a 10% chance
  // per click of learning lucem, gated by a 2-world-tick cooldown — same
  // "reach check, then cooldown check, then a Math.random() roll" shape
  // as handleEatBrains/applyConsume above.
  @SubscribeMessage('readLucemBook')
  handleReadLucemBook(@ConnectedSocket() client: GameSocket): ReadLucemBookAck {
    if (client.data.map !== LUCEM_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, LUCEM_BOOK_POSITION.row, LUCEM_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.lucemBookReadyAtTick) {
      // A world tick and an in-game hour are the same unit (see
      // globalStatTick, which advances both by exactly 1 together), so
      // this is showing real hours, not a made-up "tick" concept.
      const hoursLeft = client.data.lucemBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.lucemBookReadyAtTick = this.currentTick + LUCEM_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[LUCEM_SKILL] !== undefined) {
      return {
        ok: true,
        skills: client.data.skills,
        lucemBookReadyAtTick: client.data.lucemBookReadyAtTick,
        message: 'You already know how to conjure light with lucem.',
      };
    }

    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : LUCEM_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [LUCEM_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return {
        ok: true,
        skills: client.data.skills,
        lucemBookReadyAtTick: client.data.lucemBookReadyAtTick,
        message: 'The words swim into focus — you have learned lucem!',
      };
    }

    return {
      ok: true,
      lucemBookReadyAtTick: client.data.lucemBookReadyAtTick,
      message: 'You pore over the pages, but nothing clicks yet.',
    };
  }

  // The Elemental Casting classroom's own podium — identical shape to
  // handleReadLucemBook above, teaching irrigo instead.
  @SubscribeMessage('readIrrigoBook')
  handleReadIrrigoBook(@ConnectedSocket() client: GameSocket): ReadIrrigoBookAck {
    if (client.data.map !== IRRIGO_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, IRRIGO_BOOK_POSITION.row, IRRIGO_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.irrigoBookReadyAtTick) {
      const hoursLeft = client.data.irrigoBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.irrigoBookReadyAtTick = this.currentTick + IRRIGO_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[IRRIGO_SKILL] !== undefined) {
      return {
        ok: true,
        skills: client.data.skills,
        irrigoBookReadyAtTick: client.data.irrigoBookReadyAtTick,
        message: 'You already know how to conjure water with irrigo.',
      };
    }

    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : IRRIGO_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [IRRIGO_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return {
        ok: true,
        skills: client.data.skills,
        irrigoBookReadyAtTick: client.data.irrigoBookReadyAtTick,
        message: 'The words swim into focus — you have learned irrigo!',
      };
    }

    return {
      ok: true,
      irrigoBookReadyAtTick: client.data.irrigoBookReadyAtTick,
      message: 'You pore over the pages, but nothing clicks yet.',
    };
  }

  // Utilization's second podium (a later follow-up ask) — identical
  // shape to handleReadLucemBook/handleReadIrrigoBook, teaching quick
  // movement instead.
  @SubscribeMessage('readCeleritasBook')
  handleReadCeleritasBook(@ConnectedSocket() client: GameSocket): ReadCeleritasBookAck {
    if (client.data.map !== CELERITAS_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, CELERITAS_BOOK_POSITION.row, CELERITAS_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.celeritasBookReadyAtTick) {
      const hoursLeft = client.data.celeritasBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.celeritasBookReadyAtTick = this.currentTick + CELERITAS_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[CELERITAS_SKILL] !== undefined) {
      return {
        ok: true,
        skills: client.data.skills,
        celeritasBookReadyAtTick: client.data.celeritasBookReadyAtTick,
        message: 'You already know how to quicken your steps.',
      };
    }

    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : CELERITAS_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [CELERITAS_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return {
        ok: true,
        skills: client.data.skills,
        celeritasBookReadyAtTick: client.data.celeritasBookReadyAtTick,
        message: 'The words swim into focus — you have learned celeritas!',
      };
    }

    return {
      ok: true,
      celeritasBookReadyAtTick: client.data.celeritasBookReadyAtTick,
      message: 'You pore over the pages, but nothing clicks yet.',
    };
  }

  // The Offense classroom's own podium (a later follow-up ask) —
  // identical shape to handleReadLucemBook/handleReadCeleritasBook,
  // teaching augue instead.
  @SubscribeMessage('readAugueBook')
  handleReadAugueBook(@ConnectedSocket() client: GameSocket): ReadAugueBookAck {
    if (client.data.map !== AUGUE_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, AUGUE_BOOK_POSITION.row, AUGUE_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.augueBookReadyAtTick) {
      const hoursLeft = client.data.augueBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.augueBookReadyAtTick = this.currentTick + AUGUE_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[AUGUE_SKILL] !== undefined) {
      return {
        ok: true,
        skills: client.data.skills,
        augueBookReadyAtTick: client.data.augueBookReadyAtTick,
        message: 'You already know how to conjure augue.',
      };
    }

    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : AUGUE_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [AUGUE_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return {
        ok: true,
        skills: client.data.skills,
        augueBookReadyAtTick: client.data.augueBookReadyAtTick,
        message: 'The words swim into focus — you have learned augue!',
      };
    }

    return {
      ok: true,
      augueBookReadyAtTick: client.data.augueBookReadyAtTick,
      message: 'You pore over the pages, but nothing clicks yet.',
    };
  }

  // The Utility Classroom's third podium (a later follow-up ask) —
  // identical shape to handleReadLucemBook/handleReadAugueBook, teaching
  // resera instead.
  @SubscribeMessage('readReseraBook')
  handleReadReseraBook(@ConnectedSocket() client: GameSocket): ReadReseraBookAck {
    if (client.data.map !== RESERA_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, RESERA_BOOK_POSITION.row, RESERA_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.reseraBookReadyAtTick) {
      const hoursLeft = client.data.reseraBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.reseraBookReadyAtTick = this.currentTick + RESERA_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[RESERA_SKILL] !== undefined) {
      return {
        ok: true,
        skills: client.data.skills,
        reseraBookReadyAtTick: client.data.reseraBookReadyAtTick,
        message: 'You already know how to conjure resera.',
      };
    }

    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : RESERA_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [RESERA_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return {
        ok: true,
        skills: client.data.skills,
        reseraBookReadyAtTick: client.data.reseraBookReadyAtTick,
        message: 'The words swim into focus — you have learned resera!',
      };
    }

    return {
      ok: true,
      reseraBookReadyAtTick: client.data.reseraBookReadyAtTick,
      message: 'You pore over the pages, but nothing clicks yet.',
    };
  }

  // Resera (a later follow-up ask) — a targeted UTILITY spell: requires
  // selecting one of the game's two lockable objects (the secret room's
  // own door, or its treasure chest — see shared/types.ts's LockTarget)
  // and rolls the same percent-chance-success/growth formula every other
  // spell uses. Success sets a PER-PLAYER persisted unlock flag — other
  // players still have to resera the same object themselves; one
  // player's success never unlocks it for anyone else.
  @SubscribeMessage('castResera')
  handleCastResera(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastReseraAck {
    if (client.data.skills[RESERA_SKILL] === undefined) {
      return { ok: false, message: "You don't know the resera spell yet." };
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
      ((map === RESERA_BOOK_MAP && row === CAVERNA_SECRET_DOOR_POSITION.row && col === CAVERNA_SECRET_DOOR_POSITION.col) ||
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
    const skillPercent = client.data.skills[RESERA_SKILL] ?? STARTING_SKILL_PERCENT;
    const successChance = Math.min(MAX_SKILL_PERCENT, skillPercent + SPELL_CAST_SUCCESS_BONUS);

    let message: string;
    if (Math.random() * 100 < successChance) {
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
    const growth = this.maybeGrowSkill(client, RESERA_SKILL);
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
    if (client.data.equipment.weapon === WAND_ITEM) {
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
    if (client.data.skills[AUGUE_SKILL] === undefined) {
      return { ok: false, message: "You don't know the augue spell yet." };
    }
    const cooldownUntil = client.data.skillCooldowns[AUGUE_SKILL];
    if (cooldownUntil !== undefined && cooldownUntil > Date.now()) {
      const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
      return { ok: false, message: `Augue is still recharging (${secondsLeft}s left).` };
    }
    const parsed = augueTargetSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, message: 'Invalid target.' };
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

      this.startSkillCooldown(client, AUGUE_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      npc.hp = Math.max(0, npc.hp - AUGUE_DAMAGE);
      const died = npc.hp <= 0;
      const label = npc.label ?? 'training dummy';
      if (died) {
        if (!npc.immortal) {
          this.corpseManager.spawn(npc.race, npc.level, [bodyPartLabelFor(npc.race), 'bone dagger'], npc.map, npc.row, npc.col);
          const tile = this.randomFreeTileFor(npc.map);
          npc.row = tile.row;
          npc.col = tile.col;
        }
        npc.hp = npc.maxHp;
      }

      const growthMessages: string[] = [];
      const growth = this.maybeGrowSkill(client, AUGUE_SKILL);
      if (growth) growthMessages.push(growth);

      const message = died
        ? npc.immortal
          ? `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage — it shrugs off the blow, unharmed.`
          : `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage, defeating it! It leaves a corpse and reappears elsewhere.`
        : `${client.data.username}'s augue engulfs the ${label} in flame for ${AUGUE_DAMAGE} damage.`;

      void this.persistStats(client);
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
        skill: AUGUE_SKILL,
      });
      this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
      return { ok: true, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: "Augue can only target a monster or scarecrow right now — that's the only kind of target you can select." };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, AUGUE_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with augue." };
    }

    this.startSkillCooldown(client, AUGUE_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);
    const result = this.monsterManager.applyDamage(monster.id, AUGUE_DAMAGE);
    if (!result) {
      return { ok: false, message: 'Your target is no longer here.' };
    }

    const growthMessages: string[] = [];
    const growth = this.maybeGrowSkill(client, AUGUE_SKILL);
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
      this.corpseManager.spawn(monster.kind, monster.level, items, monster.mapName, monster.row, monster.col, client.data.username);
      this.playerCombat.delete(client.data.username);
    }

    const message = result.died
      ? `${client.data.username}'s augue engulfs the ${monster.kind} in flame for ${AUGUE_DAMAGE} damage, defeating it!${expGained !== undefined ? ` (+${expGained} exp)` : ''}`
      : `${client.data.username}'s augue engulfs the ${monster.kind} in flame for ${AUGUE_DAMAGE} damage.`;

    void this.persistStats(client);
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
      skill: AUGUE_SKILL,
    });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));

    return { ok: true, skills: client.data.skills, message };
  }

  // Offense's second podium (a later follow-up ask), teaching
  // stupefaciunt — same read-a-podium shape as every earlier one.
  @SubscribeMessage('readStupefaciuntBook')
  handleReadStupefaciuntBook(@ConnectedSocket() client: GameSocket): ReadSpellBookAck {
    if (client.data.map !== STUPEFACIUNT_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, STUPEFACIUNT_BOOK_POSITION.row, STUPEFACIUNT_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.stupefaciuntBookReadyAtTick) {
      const hoursLeft = client.data.stupefaciuntBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.stupefaciuntBookReadyAtTick = this.currentTick + STUPEFACIUNT_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[STUPEFACIUNT_SKILL] !== undefined) {
      return { ok: true, skills: client.data.skills, message: 'You already know how to conjure stupefaciunt.' };
    }
    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : STUPEFACIUNT_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [STUPEFACIUNT_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return { ok: true, skills: client.data.skills, message: 'The words swim into focus — you have learned stupefaciunt!' };
    }
    return { ok: true, message: 'You pore over the pages, but nothing clicks yet.' };
  }

  // Offense's third podium (a later follow-up ask), teaching exarme —
  // same shape again.
  @SubscribeMessage('readExarmeBook')
  handleReadExarmeBook(@ConnectedSocket() client: GameSocket): ReadSpellBookAck {
    if (client.data.map !== EXARME_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, EXARME_BOOK_POSITION.row, EXARME_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.exarmeBookReadyAtTick) {
      const hoursLeft = client.data.exarmeBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.exarmeBookReadyAtTick = this.currentTick + EXARME_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[EXARME_SKILL] !== undefined) {
      return { ok: true, skills: client.data.skills, message: 'You already know how to conjure exarme.' };
    }
    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : EXARME_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [EXARME_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return { ok: true, skills: client.data.skills, message: 'The words swim into focus — you have learned exarme!' };
    }
    return { ok: true, message: 'You pore over the pages, but nothing clicks yet.' };
  }

  // Stupefaciunt (a later follow-up ask) — a targeted stun, same
  // range/target shape as augue but no damage: 2 combat ticks of
  // MonsterManagerService-level stun (can't move OR act — see
  // wanderAll/stepTowardAggroTarget's own early-return) instead. No
  // success-chance roll (same as augue) — deterministic once in range,
  // gated only by mana and its own cooldown.
  @SubscribeMessage('castStupefaciunt')
  handleCastStupefaciunt(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[STUPEFACIUNT_SKILL] === undefined) {
      return { ok: false, message: "You don't know the stupefaciunt spell yet." };
    }
    const cooldownUntil = client.data.skillCooldowns[STUPEFACIUNT_SKILL];
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
      this.startSkillCooldown(client, STUPEFACIUNT_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const label = npc.label ?? 'training dummy';
      const growth = this.maybeGrowSkill(client, STUPEFACIUNT_SKILL);
      const message = `${client.data.username} stuns the ${label} in place!${growth ? ` ${growth}` : ''}`;
      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: 'Stupefaciunt can only target a monster or scarecrow right now.' };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with stupefaciunt." };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    this.startSkillCooldown(client, STUPEFACIUNT_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);
    this.monsterManager.stun(monster.id, this.combatTickCount + STUPEFACIUNT_STUN_TICKS);
    const growth = this.maybeGrowSkill(client, STUPEFACIUNT_SKILL);
    const message = `${client.data.username}'s stupefaciunt freezes the ${monster.kind} in place!${growth ? ` ${growth}` : ''}`;

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
    if (client.data.skills[EXARME_SKILL] === undefined) {
      return { ok: false, message: "You don't know the exarme spell yet." };
    }
    const cooldownUntil = client.data.skillCooldowns[EXARME_SKILL];
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
      this.startSkillCooldown(client, EXARME_SKILL);
      this.startAutoAttackAfterSpell(client, 'npc', npc.id);
      const growth = this.maybeGrowSkill(client, EXARME_SKILL);
      const label = npc.label ?? 'training dummy';
      const message = `The ${label} isn't wielding a weapon.${growth ? ` ${growth}` : ''}`;
      this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      this.systemMessage(client, message);
      return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
    }
    if (parsed.data.targetKind !== 'monster') {
      return { ok: false, message: 'Exarme can only target a monster or scarecrow right now.' };
    }
    const monster = this.monsterManager.getMonster(parsed.data.targetId);
    if (!monster || monster.mapName !== client.data.map) {
      return { ok: false, message: 'Your target is no longer here.' };
    }
    if (!isWithinRadius(client.data.row, client.data.col, monster.row, monster.col, SPELL_ATTACK_RANGE_TILES)) {
      return { ok: false, message: "You're too far away to hit that with exarme." };
    }

    client.data.mana -= SPELL_ATTACK_MANA_COST;
    this.startSkillCooldown(client, EXARME_SKILL);
    this.startAutoAttackAfterSpell(client, 'monster', monster.id);
    const weaponIndex = monster.carriedItems.findIndex((item) => item.toLowerCase().includes('dagger'));
    let message: string;
    if (weaponIndex === -1) {
      message = `The ${monster.kind} isn't wielding a weapon.`;
    } else {
      const [weapon] = monster.carriedItems.splice(weaponIndex, 1);
      delete monster.skills[DAGGER_SKILL];
      client.data.inventory = [...client.data.inventory, weapon!];
      this.worldManager.updateState(client.data.username, { inventory: client.data.inventory });
      message = `${client.data.username}'s exarme knocks the ${weapon} from the ${monster.kind}'s grip!`;
    }
    const growth = this.maybeGrowSkill(client, EXARME_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.systemMessage(client, message);
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // Defense's own podium (a later follow-up ask), teaching scutum — same
  // read-a-podium shape as every earlier one.
  @SubscribeMessage('readScutumBook')
  handleReadScutumBook(@ConnectedSocket() client: GameSocket): ReadSpellBookAck {
    if (client.data.map !== SCUTUM_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, SCUTUM_BOOK_POSITION.row, SCUTUM_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.scutumBookReadyAtTick) {
      const hoursLeft = client.data.scutumBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.scutumBookReadyAtTick = this.currentTick + SCUTUM_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[SCUTUM_SKILL] !== undefined) {
      return { ok: true, skills: client.data.skills, message: 'You already know how to conjure scutum.' };
    }
    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : SCUTUM_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [SCUTUM_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return { ok: true, skills: client.data.skills, message: 'The words swim into focus — you have learned scutum!' };
    }
    return { ok: true, message: 'You pore over the pages, but nothing clicks yet.' };
  }

  // Scutum (a later follow-up ask) — a fixed-duration self-buff, unlike
  // lucem/celeritas: always ON for SCUTUM_DURATION_MS once cast (no
  // manual toggle-off — see checkScutumExpiry for how it wears off on its
  // own), driving a blue-sphere visual for every nearby player (see
  // WorldScene's updateScutumVisual) and the Affects modal's own
  // countdown. No success-chance roll — deterministic once known and
  // affordable, gated only by its own cooldown.
  @SubscribeMessage('castScutum')
  handleCastScutum(@ConnectedSocket() client: GameSocket): CastSpellAck {
    if (client.data.skills[SCUTUM_SKILL] === undefined) {
      const message = "You don't know the scutum spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    const cooldownUntil = client.data.skillCooldowns[SCUTUM_SKILL];
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
    this.startSkillCooldown(client, SCUTUM_SKILL);
    client.data.scutumActive = true;
    client.data.scutumActiveUntil = Date.now() + SCUTUM_DURATION_MS;
    let message = 'A shimmering shield surrounds you.';

    const growth = this.maybeGrowSkill(client, SCUTUM_SKILL);
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills, scutumActive: true });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, active: true, mana: client.data.mana, skills: client.data.skills, message };
  }

  // Summoning's own podium (a later follow-up ask), teaching murus
  // lapideus — same read-a-podium shape as every earlier one.
  @SubscribeMessage('readMurusLapideusBook')
  handleReadMurusLapideusBook(@ConnectedSocket() client: GameSocket): ReadSpellBookAck {
    if (client.data.map !== MURUS_LAPIDEUS_BOOK_MAP) {
      return { ok: false, message: "There's no spellbook here." };
    }
    if (!this.isWithinLootReach(client, MURUS_LAPIDEUS_BOOK_POSITION.row, MURUS_LAPIDEUS_BOOK_POSITION.col)) {
      return { ok: false, message: "You're too far away to reach the book." };
    }
    if (this.currentTick < client.data.murusLapideusBookReadyAtTick) {
      const hoursLeft = client.data.murusLapideusBookReadyAtTick - this.currentTick;
      return { ok: false, message: `You need a moment before reading again (${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'}).` };
    }
    client.data.murusLapideusBookReadyAtTick = this.currentTick + MURUS_LAPIDEUS_BOOK_COOLDOWN_TICKS;

    if (client.data.skills[MURUS_LAPIDEUS_SKILL] !== undefined) {
      return { ok: true, skills: client.data.skills, message: 'You already know how to conjure murus lapideus.' };
    }
    if (Math.random() < (TESTING_INSTANT_PODIUM_LEARN ? 1 : MURUS_LAPIDEUS_BOOK_LEARN_CHANCE)) {
      client.data.skills = { ...client.data.skills, [MURUS_LAPIDEUS_SKILL]: STARTING_SKILL_PERCENT };
      this.worldManager.updateState(client.data.username, { skills: client.data.skills });
      void this.persistStats(client);
      client.emit('sync', { player: this.snapshotFor(client) });
      return { ok: true, skills: client.data.skills, message: 'The words swim into focus — you have learned murus lapideus!' };
    }
    return { ok: true, message: 'You pore over the pages, but nothing clicks yet.' };
  }

  // Murus lapideus (a later follow-up ask) — "click the spell, then click
  // a spot on the map" (see WorldScene's own murusLapideusTargeting flow);
  // the server just receives the final {row, col} and validates it. Draws
  // aggro from whichever monster is currently chasing the caster (see
  // MonsterManagerService.findMonsterAggroedOnto/redirectAggroToStoneBlock)
  // — harmless no-op if nothing's aggro'd onto them.
  @SubscribeMessage('castMurusLapideus')
  handleCastMurusLapideus(@ConnectedSocket() client: GameSocket, @MessageBody() payload: unknown): CastSpellAck {
    if (client.data.skills[MURUS_LAPIDEUS_SKILL] === undefined) {
      return { ok: false, message: "You don't know the murus lapideus spell yet." };
    }
    const cooldownUntil = client.data.skillCooldowns[MURUS_LAPIDEUS_SKILL];
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
    this.startSkillCooldown(client, MURUS_LAPIDEUS_SKILL);

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

    const growth = this.maybeGrowSkill(client, MURUS_LAPIDEUS_SKILL);
    let message = 'A block of stone rises from the ground, eyes blinking open.';
    if (growth) message = `${message} ${growth}`;

    this.worldManager.updateState(client.data.username, { mana: client.data.mana, skills: client.data.skills });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });
    this.server.to(client.data.map).emit('map:state', this.mapStateFor(client.data.map));
    this.systemMessage(client, message);
    return { ok: true, mana: client.data.mana, skills: client.data.skills, message };
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
    this.worldManager.updateState(client.data.username, { canteenDrinks: client.data.canteenDrinks });
    void this.persistStats(client);
    return { ok: true, canteenDrinks: client.data.canteenDrinks, message: 'You take a drink from your canteen.' };
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
    if (client.data.skills[IRRIGO_SKILL] === undefined) {
      return { ok: false, message: "You don't know the irrigo spell yet." };
    }
    if (client.data.equipment.weapon !== WAND_ITEM) {
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
    const skillPercent = client.data.skills[IRRIGO_SKILL] ?? STARTING_SKILL_PERCENT;
    const successChance = Math.min(MAX_SKILL_PERCENT, skillPercent + SPELL_CAST_SUCCESS_BONUS);

    let message: string;
    if (Math.random() * 100 >= successChance) {
      message = 'You fumble the incantation and nothing happens.';
    } else if (client.data.canteenDrinks >= CANTEEN_CAPACITY) {
      message = `Your ${resolved.item} is already full and cannot be filled.`;
    } else {
      client.data.canteenDrinks = CANTEEN_CAPACITY;
      message = `You fill your ${resolved.item} with water!`;
    }

    const growth = this.maybeGrowSkill(client, IRRIGO_SKILL);
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

  private static readonly COMMANDS_HELP_TEXT = [
    'Available commands:',
    '/commands, /help - show this list',
    "/sleep - lie down and close your eyes, recovering hp/mana faster until you wake up (moving or attacking wakes you)",
    '/rest, /sit - sit down to rest, recovering a bit faster than standing around',
    '/wake, /stand - get up from sleeping or resting',
    '/mimic [race] - slime only: with no argument, lists what you can mimic; with one, shifts your form to it',
    '/revert - slime only: shift back to your natural slime form',
    '/time - show the current game hour and whether it is day or night',
    "/lucem - toggle your equipped wand's light on or off (requires the lucem skill)",
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
      case 'mimic':
        this.handleMimicCommand(client, arg);
        break;
      case 'revert':
        this.handleRevertCommand(client);
        break;
      case 'time':
        this.handleTimeCommand(client);
        break;
      case 'lucem':
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
    if (client.data.skills[LUCEM_SKILL] === undefined) {
      const message = "You don't know the lucem spell yet.";
      this.systemMessage(client, message);
      return { ok: false, message };
    }
    if (client.data.equipment.weapon !== WAND_ITEM) {
      const message = 'You need a wand equipped to cast lucem.';
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
      const skillPercent = client.data.skills[LUCEM_SKILL] ?? STARTING_SKILL_PERCENT;
      const successChance = Math.min(MAX_SKILL_PERCENT, skillPercent + SPELL_CAST_SUCCESS_BONUS);
      if (Math.random() * 100 < successChance) {
        client.data.wandLit = true;
        client.data.wandLitUntil = Date.now() + spellDurationMs(skillPercent);
        message = 'Your wand glows with a soft light.';
      } else {
        message = 'You fumble the incantation and nothing happens.';
      }
    } else {
      client.data.wandLit = false;
      client.data.wandLitUntil = null;
      message = 'Your wand goes dark.';
    }

    const growth = this.maybeGrowSkill(client, LUCEM_SKILL);
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
  // cast), minus the wand requirement (a self-buff, not a light source).
  // While active, boosts the caster's own movement speed by ~10% (see
  // WorldScene's effectiveMoveCooldownMs) for spellDurationMs, scaling up
  // with skill% the same way lucem's own duration does.
  private handleCeleritasCommand(client: GameSocket): CastSpellAck {
    if (client.data.skills[CELERITAS_SKILL] === undefined) {
      const message = "You don't know the celeritas spell yet.";
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
      const skillPercent = client.data.skills[CELERITAS_SKILL] ?? STARTING_SKILL_PERCENT;
      const successChance = Math.min(MAX_SKILL_PERCENT, skillPercent + SPELL_CAST_SUCCESS_BONUS);
      if (Math.random() * 100 < successChance) {
        client.data.celeritasActive = true;
        client.data.celeritasActiveUntil = Date.now() + spellDurationMs(skillPercent);
        message = 'Your feet feel lighter — you move with a spring in your step.';
      } else {
        message = 'You fumble the incantation and nothing happens.';
      }
    } else {
      client.data.celeritasActive = false;
      client.data.celeritasActiveUntil = null;
      message = 'The spring leaves your step.';
    }

    const growth = this.maybeGrowSkill(client, CELERITAS_SKILL);
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
    client.data.sleepingInBed = true;
    this.setRestState(client, 'sleeping');
    const message = "You climb into bed and drift off to sleep. You won't see anything until you wake up.";
    this.systemMessage(client, message);
    return { ok: true, message };
  }

  // Toggles resting <-> awake ("sit" is just an alias, same as the text
  // game — there's no separate sit state).
  private handleRestCommand(client: GameSocket): void {
    if (client.data.restState === 'resting') {
      this.setRestState(client, 'awake');
      this.systemMessage(client, 'You stand up.');
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
  private wakeIfNeeded(client: GameSocket): void {
    if (client.data.restState === 'awake') return;
    const was = client.data.restState;
    this.setRestState(client, 'awake');
    this.systemMessage(client, was === 'sleeping' ? 'You wake up.' : 'You stand up.');
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

  // One-way, one-time — reaching HOBGOBLIN_EVOLUTION_CXP consumed body
  // parts as a goblin transforms them into a Hobgoblin: level/exp reset
  // to a fresh level 1, attributes/vitals boosted (and fully healed),
  // consumeExp reset to 0, and any of the Hobgoblin-exclusive skills
  // (second attack/third attack/enhanced damage) they don't already have
  // granted at STARTING_SKILL_PERCENT. Existing skills are left alone.
  private maybeEvolveToHobgoblin(client: GameSocket): string[] {
    if (client.data.race !== 'goblin' || client.data.consumeExp < HOBGOBLIN_EVOLUTION_CXP) return [];

    client.data.race = 'hobgoblin';
    client.data.level = STARTING_LEVEL;
    client.data.exp = STARTING_EXP;
    client.data.consumeExp = 0;

    client.data.strength += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.intelligence += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.wisdom += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.dexterity += HOBGOBLIN_ATTRIBUTE_BONUS;
    client.data.constitution += HOBGOBLIN_ATTRIBUTE_BONUS;

    client.data.maxHp += HOBGOBLIN_STAT_BONUS;
    client.data.maxMana += HOBGOBLIN_STAT_BONUS;
    client.data.hp = client.data.maxHp;
    client.data.mana = client.data.maxMana;

    const newSkills: string[] = [];
    for (const skill of HOBGOBLIN_EVOLUTION_SKILLS) {
      if (client.data.skills[skill] === undefined) {
        client.data.skills = { ...client.data.skills, [skill]: STARTING_SKILL_PERCENT };
        newSkills.push(skill);
      }
    }

    this.worldManager.updateState(client.data.username, {
      race: client.data.race,
      level: client.data.level,
      exp: client.data.exp,
      consumeExp: client.data.consumeExp,
      strength: client.data.strength,
      intelligence: client.data.intelligence,
      wisdom: client.data.wisdom,
      dexterity: client.data.dexterity,
      constitution: client.data.constitution,
      maxHp: client.data.maxHp,
      maxMana: client.data.maxMana,
      hp: client.data.hp,
      mana: client.data.mana,
      skills: client.data.skills,
    });
    void this.persistStats(client);
    client.emit('sync', { player: this.snapshotFor(client) });

    const messages = [
      '**Your body twists and swells with dark power — you have evolved into a Hobgoblin!**',
      'Your level has reset to 1.',
      `Your attributes have increased by ${HOBGOBLIN_ATTRIBUTE_BONUS}.`,
      `Your hp and mana have increased by ${HOBGOBLIN_STAT_BONUS} and been fully restored.`,
      'Your consumed exp has reset to 0.',
    ];
    if (newSkills.length > 0) {
      messages.push(`You have also learned: ${newSkills.join(', ')} (starting at ${STARTING_SKILL_PERCENT}%).`);
    }
    return messages;
  }

  // Shared by both useItem's "consume" path and the forced consumeItem
  // RPC: grants consumeExp, rolls a resistance skill if this item's name
  // maps to one (see resistanceGrantForItem), and checks for a Hobgoblin
  // evolution. Returns the flavor message lines to show, if any.
  private applyConsume(client: GameSocket, item: string): string[] {
    client.data.consumeExp += CONSUME_EXP_PER_ITEM;

    const messages: string[] = [];
    const grant = resistanceGrantForItem(item);
    if (grant) {
      if (client.data.skills[grant.skill] === undefined) {
        if (Math.random() < grant.chance) {
          client.data.skills = { ...client.data.skills, [grant.skill]: RESISTANCE_SKILL_STARTING_PERCENT };
          messages.push(`You have gained ${grant.skill} (${RESISTANCE_SKILL_STARTING_PERCENT}%)!`);
        }
      } else {
        // Item 1: consuming this kind of item again once the skill is
        // already known used to just silently do nothing (besides the
        // flat consumeExp) — no feedback at all that nothing new could
        // come of it.
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
    // Checked after the resistance roll above so a body part that both
    // grants a resistance AND crosses the evolution threshold in the same
    // consume shows both messages, in that order.
    messages.push(...this.maybeEvolveToHobgoblin(client));

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
      consumeExp: client.data.consumeExp,
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
      consumeExp: client.data.consumeExp,
      skills: client.data.skills,
      message: messages.length > 0 ? messages.join('\n') : undefined,
    };
  }

  // Clicking an inventory item: the server alone decides whether it's
  // equippable (see combat/formulas.ts's EQUIPMENT_SLOT_FOR_ITEM) or just
  // a consumable body part. Equipping swaps out whatever was already in
  // that slot (returning it to inventory, mirroring the text game's own
  // "unequip the old one first" behavior); consuming removes it for good
  // and grants a flat CONSUME_EXP_PER_ITEM toward the separate
  // consumeExp counter.
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

    const slot = EQUIPMENT_SLOT_FOR_ITEM[item];
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
    const inventory = [...client.data.inventory, item];
    return this.finishItemAction(client, inventory, 'unequipped', []);
  }
}
