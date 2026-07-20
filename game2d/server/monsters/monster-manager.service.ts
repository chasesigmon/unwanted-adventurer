import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  getMap,
  isCastleExteriorBlocked,
  isMoatBlocked,
  isWithinMoatFootprint,
  isGateTile,
  isStairsSideBlocked,
  isRunestoneWayOffRoadBlocked,
} from '../../shared/maps.js';
import { isTreeTile } from '../../shared/trees.js';
import {
  isFireplaceBlocked,
  isBenchBlocked,
  isBedBlocked,
  studentDeskPositionsFor,
  isGreatHallTableBlocked,
  isGreatHallChairBlocked,
  isPortalBlocked,
  isBramwickSignBlocked,
  isStandingTorchBlocked,
  isWithinRadius,
} from '../../shared/lighting.js';
import { DIRECTION_DELTAS } from '../../shared/directions.js';
import { MONSTER_SPECIES, MONSTER_LEVEL, skillsForCarriedItems, type Monster, type MonsterSpecies } from './monster.js';
import { monsterAttributeForLevel } from '../combat/formulas.js';
import { vendorsForMap, vendorCounterFootprintFor } from '../worlds/vendors.js';
import { teachersForMap, teacherDeskFootprintFor } from '../worlds/teachers.js';
import { isChestBlocked } from '../../shared/spells.js';
import type { MapName, MonsterKind } from '../../shared/constants.js';
import type { MonsterSnapshot } from '../../shared/types.js';

export type OccupancyChecker = (mapName: MapName, row: number, col: number) => boolean;
export type PlayerLocator = (username: string) => { mapName: MapName; row: number; col: number } | undefined;
// Murus lapideus (a later follow-up ask) — set by GameGateway (which owns
// the stone-block registry), same callback-injection reasoning as
// PlayerLocator above.
export type StoneBlockLocator = (id: string) => { mapName: MapName; row: number; col: number } | undefined;
// Returns the stone block's REMAINING hp after the hit, or undefined if
// it no longer exists (already destroyed/expired) — lets
// stepTowardAggroTarget know whether to keep chasing it.
export type StoneBlockDamager = (id: string, amount: number, attackerLabel: string) => number | undefined;
// A later follow-up ask generalized what started as the Diabolist's demon
// imp-only "draw the aggro of monsters the player is attacking" into a
// real "the follower tanks" mechanic for ANY pet/animated monster: "the
// follower should draw the aggro of the monster that either they attack
// first or that the player attacks, and the monster should then go to
// attack the follower." Locates whichever ONE follower (pet or animated
// monster) this owner has actively fighting, if any — keyed by owner
// username since setAggro only ever knows the attacking player's
// username, not a specific follower id. Set by GameGateway (which owns
// both PetManagerService and AnimatedMonsterManagerService), same
// callback-injection reasoning as StoneBlockLocator above.
export type FollowerLocator = (
  ownerUsername: string
) => { followerKind: 'pet' | 'animatedMonster' | 'tamedBeast'; followerId?: string; mapName: MapName; row: number; col: number } | undefined;
// Returns the follower's REMAINING hp after the hit, or undefined if it
// no longer exists (already killed/removed/unsummoned).
export type FollowerDamager = (
  ownerUsername: string,
  followerKind: 'pet' | 'animatedMonster' | 'tamedBeast',
  followerId: string | undefined,
  amount: number
) => number | undefined;

// A much smaller version of the text game's own monster-manager.service.ts
// — no engaged-in-combat tracking (a punch here is a single instant
// action, not an ongoing multi-round fight to escape from), and no
// per-species respawn timers of its own: GameGateway owns one shared
// interval and drives spawnInitial/wanderAll/respawnBelowMax directly, the
// same way it already owns the stat-tick style timers elsewhere. Entirely
// in-memory, not persisted — population and position reset on restart,
// same tradeoff the text game's version documents.
@Injectable()
export class MonsterManagerService {
  private monsters = new Map<string, Monster>();
  // A rare monster's own respawn cooldown (a later follow-up ask) — see
  // applyDamage's own doc comment on when this gets set.
  private nextRespawnAllowedAt = new Map<string, number>();

  // Set once by GameGateway (which has both this and WorldManagerService
  // injected) so wandering/spawning also avoids tiles a player is
  // standing on — a plain callback instead of a circular module
  // dependency between Monsters and Worlds.
  private isPlayerAt: OccupancyChecker = () => false;

  setPlayerOccupancyChecker(checker: OccupancyChecker): void {
    this.isPlayerAt = checker;
  }

  // Barrier (a later follow-up ask) — "monsters cannot get into the
  // barrier while it is active." Same callback-injection reasoning as the
  // occupancy checker above (GameGateway owns the activeBarriers
  // registry, not this service).
  private isBarrierZone: OccupancyChecker = () => false;

  setBarrierZoneChecker(checker: OccupancyChecker): void {
    this.isBarrierZone = checker;
  }

  // Set alongside the occupancy checker, same reasoning — lets a monster
  // that's aggroed onto a player (see setAggro/wanderAll) know where to
  // chase them without a circular Monsters<->Worlds dependency.
  private locatePlayer: PlayerLocator = () => undefined;

  setPlayerLocator(locator: PlayerLocator): void {
    this.locatePlayer = locator;
  }

  // Phase E's own "portal monster aggro radius" ask — same callback-
  // injection reasoning as locatePlayer above, but for every player on a
  // map at once (see checkProximityAggro), since a single-username lookup
  // can't answer "who, if anyone, just wandered close enough to notice."
  private playersOnMap: (mapName: MapName) => Array<{ username: string; row: number; col: number }> = () => [];

  setPlayersOnMapLocator(locator: (mapName: MapName) => Array<{ username: string; row: number; col: number }>): void {
    this.playersOnMap = locator;
  }

  // Whoever last landed a hit on this monster (by any means — a tick-
  // resolved attack, a queued skill) — set by GameGateway's combat tick.
  // Aggro persists until it times out from lack of contact, the target
  // logs off/changes map, or the monster dies.
  private aggro = new Map<string, { targetUsername: string; lastContactTick: number }>();
  private static readonly AGGRO_TIMEOUT_TICKS = 10;
  // Incremented once per chaseAggroTargets() call (the fast tick) — used
  // only to make a slowed monster's chase skip every other fast tick
  // (see stepTowardAggroTarget's own isSlowed branch), since "how many
  // steps per call" no longer means anything now that the tick itself is
  // already fast (see chaseAggroTargets's own doc comment).
  private fastTickCounter = 0;

  setAggro(monsterId: string, targetUsername: string, tick: number): void {
    // Illusionist's own invisibility (a later follow-up ask) — "monsters
    // ... cannot see the player while it's active": refuse to set NEW
    // aggro at all while invisible. Aggro already pointed at this player
    // from BEFORE they turned invisible is cleared separately, the
    // instant invisibility actually activates (see clearAllAggroOnto,
    // called from game.gateway.ts's handleCastInvisibility).
    if (this.isInvisible(targetUsername)) return;
    // A later follow-up ask generalized what started as the Diabolist's
    // demon imp-only redirect into "the follower should draw the aggro of
    // the monster... that the player attacks": unlike murus lapideus's
    // own one-time redirect at cast time, this checks on EVERY setAggro
    // call, so every monster this owner subsequently attacks goes after
    // their active follower instead of them for as long as it's alive,
    // not just whatever happened to be aggro'd the instant it engaged.
    const follower = this.locateFollower(targetUsername);
    if (follower) {
      this.followerAggro.set(monsterId, {
        ownerUsername: targetUsername,
        followerKind: follower.followerKind,
        followerId: follower.followerId,
        lastContactTick: tick,
      });
      this.aggro.delete(monsterId);
      return;
    }
    this.aggro.set(monsterId, { targetUsername, lastContactTick: tick });
  }

  // Lets GameGateway's combatTick tell "this player's own combat session
  // is out of range because the monster hasn't caught up YET" apart from
  // "this fight is actually over" — a monster still actively chasing
  // this exact player shouldn't have the player's session disengage out
  // from under it (item 7's bug: the monster arrived, found no session
  // to act on, and just wandered off again).
  isAggroedOnto(monsterId: string, targetUsername: string): boolean {
    return this.aggro.get(monsterId)?.targetUsername === targetUsername;
  }

  clearAggro(monsterId: string): void {
    this.aggro.delete(monsterId);
  }

  // A later follow-up ask ("they should move into range to hit the
  // player if aggro'd") needs to resolve a PROACTIVE monster attack once
  // adjacent, independent of whether the player is also attacking that
  // same tick — this is what GameGateway's own combat tick iterates to
  // find candidates (only species with Monster.attackDamage actually do
  // anything with an entry here, see resolveMonsterInitiatedAttack).
  getAggroedMonsters(): Array<{ monster: Monster; targetUsername: string }> {
    const result: Array<{ monster: Monster; targetUsername: string }> = [];
    for (const [monsterId, entry] of this.aggro) {
      const monster = this.monsters.get(monsterId);
      if (monster) result.push({ monster, targetUsername: entry.targetUsername });
    }
    return result;
  }

  // Murus lapideus (a later follow-up ask): "It should draw aggro from a
  // monster that is currently aggro toward the player" — redirects
  // whichever monster is chasing this username onto the stone block
  // instead (mutually exclusive with player aggro; see
  // stepTowardAggroTarget, which checks this map FIRST).
  private stoneBlockAggro = new Map<string, { stoneBlockId: string; lastContactTick: number }>();
  private locateStoneBlock: StoneBlockLocator = () => undefined;
  private damageStoneBlock: StoneBlockDamager = () => undefined;
  private static readonly MONSTER_VS_STONE_BLOCK_DAMAGE = 5;

  setStoneBlockCallbacks(locator: StoneBlockLocator, damager: StoneBlockDamager): void {
    this.locateStoneBlock = locator;
    this.damageStoneBlock = damager;
  }

  // A later follow-up ask generalized this from the Diabolist's demon
  // imp-only version into "the follower should draw the aggro... and the
  // monster should then go to attack the follower" for ANY pet/animated
  // monster — same callback-injection reasoning as the stone-block
  // callbacks above, since GameGateway (not MonsterManagerService) owns
  // both PetManagerService and AnimatedMonsterManagerService. Keyed by
  // monsterId (which monster is aggro'd onto which owner's follower),
  // mirroring stoneBlockAggro's own shape.
  private followerAggro = new Map<
    string,
    { ownerUsername: string; followerKind: 'pet' | 'animatedMonster' | 'tamedBeast'; followerId?: string; lastContactTick: number }
  >();
  private locateFollower: FollowerLocator = () => undefined;
  private damageFollower: FollowerDamager = () => undefined;
  private static readonly MONSTER_VS_FOLLOWER_DAMAGE = 5;
  // A later follow-up bug fix: "the monster... hitting the pet/summon/
  // animated really fast per millisecond" — chaseAggroTargets/
  // stepTowardAggroTarget run on the fast per-tile movement tick
  // (game.gateway.ts's FOLLOWER_STEP_MS, ~220ms) so movement keeps pace
  // with the player, but the stone-block/follower damage branches below
  // used to fire EVERY call once adjacent, landing a hit ~14x/sec instead
  // of the same ~3s cadence every other attack in this game uses (see
  // game.gateway.ts's own ATTACK_COOLDOWN_MS, which this mirrors — kept
  // as its own local constant since combat/formulas-style cross-file
  // duplication is this project's existing tradeoff for values two
  // otherwise-independent files both need). Reuses Monster's own
  // lastCounterAttackTick as a SINGLE shared "this monster's next attack
  // allowed at" clock across all of its attack targets (a player, via
  // resolveMonsterInitiatedAttack/resolveHitOnMonster's counter, or a
  // stone block/follower here) — a monster only ever gets one swing per
  // cooldown window, no matter who it's swinging at.
  private static readonly ATTACK_COOLDOWN_MS = 3000;

  setFollowerCallbacks(locator: FollowerLocator, damager: FollowerDamager): void {
    this.locateFollower = locator;
    this.damageFollower = damager;
  }

  // Illusionist's own invisibility (a later follow-up ask) — same
  // callback-injection reasoning as the others above, since invisibility
  // state lives on SocketData (GameGateway), not here.
  private isInvisible: (username: string) => boolean = () => false;
  setInvisibilityChecker(checker: (username: string) => boolean): void {
    this.isInvisible = checker;
  }

  // Clears EVERY monster currently aggro'd onto this player (unlike
  // findMonsterAggroedOnto's own "any ONE is fine" shape) — called the
  // instant invisibility actually activates, so monsters that were
  // already chasing this player don't keep doing so just because
  // setAggro itself is only ever consulted on a FRESH aggro attempt.
  clearAllAggroOnto(targetUsername: string): void {
    for (const [monsterId, entry] of this.aggro) {
      if (entry.targetUsername === targetUsername) this.aggro.delete(monsterId);
    }
  }

  // Finds ONE monster currently aggro'd onto this player (any one is
  // fine — "a monster" singular, not all of them) — used by
  // handleCastMurusLapideus to know whether there's anything to redirect.
  findMonsterAggroedOnto(username: string): Monster | undefined {
    for (const [monsterId, entry] of this.aggro) {
      if (entry.targetUsername === username) return this.monsters.get(monsterId);
    }
    return undefined;
  }

  redirectAggroToStoneBlock(monsterId: string, stoneBlockId: string, tick: number): void {
    this.aggro.delete(monsterId);
    this.stoneBlockAggro.set(monsterId, { stoneBlockId, lastContactTick: tick });
  }

  // Stupefaciunt (a later follow-up ask) — stunned in place, can't move
  // OR act (see wanderAll/stepTowardAggroTarget's own early-return) until
  // currentTick reaches untilTick.
  stun(monsterId: string, untilTick: number): void {
    const monster = this.monsters.get(monsterId);
    if (monster) monster.stunUntilTick = untilTick;
  }

  isStunned(monsterId: string, currentTick: number): boolean {
    const monster = this.monsters.get(monsterId);
    return monster?.stunUntilTick !== undefined && currentTick < monster.stunUntilTick;
  }

  // Water bolt (a later follow-up ask) — see Monster.slowUntilTick.
  slow(monsterId: string, untilTick: number): void {
    const monster = this.monsters.get(monsterId);
    if (monster) monster.slowUntilTick = untilTick;
  }

  isSlowed(monsterId: string, currentTick: number): boolean {
    const monster = this.monsters.get(monsterId);
    return monster?.slowUntilTick !== undefined && currentTick < monster.slowUntilTick;
  }

  // Air bolt (a later follow-up ask) — "slightly push the monster back":
  // one tile directly away from the caster's own position, only if that
  // tile is actually free (a wall/another monster/water etc. just
  // absorbs the push rather than erroring). A much smaller nudge than
  // Battlemage's own kinetic-strike knockback (7 feet) — same direction
  // math, different magnitude, so both can share this helper.
  knockback(monsterId: string, fromRow: number, fromCol: number, tiles: number): void {
    const monster = this.monsters.get(monsterId);
    if (!monster) return;
    const dRow = monster.row - fromRow;
    const dCol = monster.col - fromCol;
    const stepRow = Math.abs(dRow) >= Math.abs(dCol) ? Math.sign(dRow) : 0;
    const stepCol = stepRow === 0 ? Math.sign(dCol) : 0;
    if (stepRow === 0 && stepCol === 0) return; // caster standing on the monster's own tile — no direction to push
    for (let i = 0; i < tiles; i++) {
      const nextRow = monster.row + stepRow;
      const nextCol = monster.col + stepCol;
      if (!this.isFree(monster.mapName, nextRow, nextCol, monster.kind)) break;
      monster.row = nextRow;
      monster.col = nextCol;
    }
  }

  spawnInitial(): void {
    for (const species of MONSTER_SPECIES) {
      for (let i = 0; i < species.maxCount; i++) this.spawnOne(species);
    }
  }

  // Keyed by speciesId (MonsterSpecies.id ?? kind), not `kind` alone — two
  // species entries can share the same `kind` (a follow-up ask's tougher
  // Grimoak Grounds wild skeleton/goblin populations, distinct from the
  // original Labyrinth/Great Plains ones) and must be counted separately.
  private countOf(speciesId: string): number {
    let n = 0;
    for (const m of this.monsters.values()) if (m.speciesId === speciesId) n++;
    return n;
  }

  private isFree(mapName: MapName, row: number, col: number, kind?: MonsterKind): boolean {
    const map = getMap(mapName);
    if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return false;
    if (map.exits.some((e) => e.row === row && e.col === col)) return false;
    // Item 28: "along the rocky part of Runestone Way" — inverted from
    // every other species' own collision rule (isRunestoneWayOffRoadBlocked
    // normally BLOCKS the rocky off-road band); a rune beast instead lives
    // there and can never step onto the walkable road band itself.
    if (kind === 'rune beast') {
      if (mapName !== 'Runestone Way' || !isRunestoneWayOffRoadBlocked(mapName, row, col)) return false;
    }
    if (isTreeTile(mapName, row, col)) return false;
    if (isCastleExteriorBlocked(mapName, row, col)) return false;
    if (isMoatBlocked(mapName, row, col)) return false;
    // "It should not work for imps" — the castle gate never opens for a
    // monster, full stop, unlike WorldManagerService.isOccupied's own
    // proximity-aware check for players.
    if (isGateTile(mapName, row, col)) return false;
    if (isFireplaceBlocked(mapName, row, col)) return false;
    if (isBenchBlocked(mapName, row, col)) return false;
    if (isBedBlocked(mapName, row, col)) return false;
    if (studentDeskPositionsFor(mapName).some((p) => p.row === row && p.col === col)) return false;
    if (isGreatHallTableBlocked(mapName, row, col)) return false;
    if (isGreatHallChairBlocked(mapName, row, col)) return false;
    if (isStandingTorchBlocked(mapName, row, col)) return false;
    // Same "own tile + counter/shopfront's real footprint" collision
    // shape as WorldManagerService.isOccupied — a wandering/spawning
    // monster shouldn't stand inside the shop counter either.
    if (
      vendorsForMap(mapName).some(
        (v) => (v.row === row && v.col === col) || vendorCounterFootprintFor(v).some((d) => d.row === row && d.col === col)
      )
    )
      return false;
    if (
      teachersForMap(mapName).some(
        (t) => (t.row === row && t.col === col) || teacherDeskFootprintFor(t).some((d) => d.row === row && d.col === col)
      )
    )
      return false;
    if (isChestBlocked(mapName, row, col)) return false;
    if (isPortalBlocked(mapName, row, col)) return false;
    if (isBramwickSignBlocked(mapName, row, col)) return false;
    if (isStairsSideBlocked(mapName, row, col)) return false;
    if (this.isBarrierZone(mapName, row, col)) return false;
    for (const m of this.monsters.values()) {
      if (m.mapName === mapName && m.row === row && m.col === col) return false;
    }
    return !this.isPlayerAt(mapName, row, col);
  }

  // Only enforced for INITIAL spawn placement (not wandering) — a deliberate
  // "don't all clump together at spawn" spacing, generous enough to matter
  // on a 100x100 map without making a small 20x20 one (or a
  // heavily-populated one) impossible to satisfy.
  private static readonly MIN_SPAWN_SPACING = 8;

  private isFarEnoughFromOthers(mapName: MapName, row: number, col: number): boolean {
    for (const m of this.monsters.values()) {
      if (m.mapName !== mapName) continue;
      if (Math.abs(m.row - row) < MonsterManagerService.MIN_SPAWN_SPACING && Math.abs(m.col - col) < MonsterManagerService.MIN_SPAWN_SPACING) {
        return false;
      }
    }
    return true;
  }

  // A later follow-up ask: "hostile monsters that aggro within a certain
  // distance of the player do not start out near the entrance or exit of
  // an area, so that a player is not instantly attacked as soon as they
  // walk in" — every MapExit a map defines is a spot a player can appear
  // at (theirs OR the reciprocal toRow/toCol on the OTHER side of a
  // connection, both covered since this runs once per map against that
  // map's own exits list). Wider than MIN_SPAWN_SPACING's own
  // clump-avoidance radius on purpose — that one only keeps monsters off
  // each other, this one specifically buys a player a few clear steps
  // before anything can already be standing on top of them.
  private static readonly SPAWN_EXIT_BUFFER_TILES = 6;

  private isFarEnoughFromExits(mapName: MapName, row: number, col: number): boolean {
    const exits = getMap(mapName).exits;
    for (const exit of exits) {
      if (
        Math.abs(exit.row - row) < MonsterManagerService.SPAWN_EXIT_BUFFER_TILES &&
        Math.abs(exit.col - col) < MonsterManagerService.SPAWN_EXIT_BUFFER_TILES
      ) {
        return false;
      }
    }
    return true;
  }

  private randomFreeTile(mapName: MapName, minCol = 0, kind?: MonsterKind): { row: number; col: number } | null {
    const map = getMap(mapName);
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = minCol + Math.floor(Math.random() * (map.cols - minCol));
      // The moat's own rectangular footprint (ring + the courtyard it
      // encloses) is off-limits for spawning (a follow-up ask: imps
      // "should only spawn on any of the areas outside/surrounding the
      // mote") — the courtyard itself is still normal walkable ground
      // for a PLAYER crossing to the castle door, so this only applies
      // to spawn placement, not isFree's own movement-collision check.
      if (isWithinMoatFootprint(mapName, row, col)) continue;
      if (this.isFree(mapName, row, col, kind) && this.isFarEnoughFromOthers(mapName, row, col) && this.isFarEnoughFromExits(mapName, row, col)) {
        return { row, col };
      }
    }
    // Relax the "far from other monsters" spacing preference first, but
    // keep the exit buffer — a crowded map should sooner let two monsters
    // stand closer together than let one spawn right on top of a player
    // who just walked in.
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = minCol + Math.floor(Math.random() * (map.cols - minCol));
      if (isWithinMoatFootprint(mapName, row, col)) continue;
      if (this.isFree(mapName, row, col, kind) && this.isFarEnoughFromExits(mapName, row, col)) return { row, col };
    }
    // The map's too crowded/small to satisfy even the exit buffer within
    // budget — fall back to just finding anywhere free at all.
    for (let attempt = 0; attempt < 60; attempt++) {
      const row = Math.floor(Math.random() * map.rows);
      const col = minCol + Math.floor(Math.random() * (map.cols - minCol));
      if (isWithinMoatFootprint(mapName, row, col)) continue;
      if (this.isFree(mapName, row, col, kind)) return { row, col };
    }
    return null;
  }

  private spawnOne(species: MonsterSpecies): void {
    const tile = this.randomFreeTile(species.homeMap, species.minSpawnCol ?? 0, species.kind);
    if (!tile) return;

    const carriedItems = (species.carriedItemRolls ?? [])
      .filter((roll) => Math.random() < roll.chance)
      .map((roll) => roll.label);
    const level = species.level ?? MONSTER_LEVEL;
    // A later follow-up ask ("give monsters at different levels base
    // stats for that level") — every attribute used to be pinned at
    // MONSTER_BASE_ATTRIBUTE(1) forever regardless of level, which meant
    // armorVsPhysicalFor/armorVsMagicalFor (both driven by these same
    // attributes) computed the exact same tiny armor value for every
    // monster in the game. See monsterAttributeForLevel's own doc comment.
    const attribute = monsterAttributeForLevel(level);

    const monster: Monster = {
      id: randomUUID(),
      speciesId: species.id ?? species.kind,
      kind: species.kind,
      monsterClass: species.monsterClass,
      mapName: species.homeMap,
      row: tile.row,
      col: tile.col,
      hp: species.startingHp,
      maxHp: species.startingHp,
      expReward: species.expReward,
      goldReward: species.goldRewardRange
        ? species.goldRewardRange[0] + Math.floor(Math.random() * (species.goldRewardRange[1] - species.goldRewardRange[0] + 1))
        : species.goldReward ?? 0,
      isRare: species.isRare,
      respawnDelayMs: species.respawnDelayMs,
      level,
      strength: attribute,
      intelligence: attribute,
      wisdom: attribute,
      dexterity: attribute,
      constitution: attribute,
      luck: attribute,
      carriedItems,
      skills: skillsForCarriedItems(carriedItems),
      spawnRow: tile.row,
      spawnCol: tile.col,
      ...(species.patrolRangeTiles !== undefined
        ? {
            patrolAxis: (Math.random() < 0.5 ? 'row' : 'col') as 'row' | 'col',
            patrolDirection: (Math.random() < 0.5 ? 1 : -1) as 1 | -1,
            patrolRangeTiles: species.patrolRangeTiles,
          }
        : {}),
      ...(species.attackDamage !== undefined ? { attackDamage: species.attackDamage } : {}),
      ...(species.attackRangeTiles !== undefined ? { attackRangeTiles: species.attackRangeTiles } : {}),
      ...(species.aggroRadiusTiles !== undefined ? { aggroRadiusTiles: species.aggroRadiusTiles } : {}),
      ...(species.flies ? { flies: true as const } : {}),
    };
    this.monsters.set(monster.id, monster);
  }

  // Tops up ONE species by one monster per call (same "one at a time" cadence
  // as the text game's own respawner) — called on GameGateway's own timer.
  respawnBelowMax(): void {
    for (const species of MONSTER_SPECIES) {
      const id = species.id ?? species.kind;
      if (this.countOf(id) >= species.maxCount) continue;
      // A rare monster's own respawn cooldown (see applyDamage) — skip
      // this species (not the whole call — an ordinary species further
      // down the list should still get its turn) until it's up.
      const gate = this.nextRespawnAllowedAt.get(id);
      if (gate && Date.now() < gate) continue;
      this.spawnOne(species);
      return;
    }
  }

  // `currentTick` is GameGateway's own combat/world-tick counter, used
  // purely to expire stale aggro (see AGGRO_TIMEOUT_TICKS).
  // Ordinary free-roam/patrol wander only now — a later follow-up ask
  // ("aggro speed" tuning: a chasing monster covering only 2 tiles per
  // whole 3s combat tick, ~0.67 tiles/sec, could never catch a player
  // walking continuously at ~4.5 tiles/sec) moved aggro-chase stepping
  // onto its own much faster dedicated tick instead (see
  // chaseAggroTargets/game.gateway.ts's FOLLOWER_STEP_MS interval, shared
  // with the pet/animated-monster follower movement this same fix
  // pattern was already built for) — an aggro'd monster is skipped here
  // entirely so the two ticks never fight over the same monster's
  // position in the same instant.
  wanderAll(currentTick: number): Set<MapName> {
    const deltas = Object.values(DIRECTION_DELTAS);
    const changedMaps = new Set<MapName>();
    for (const monster of this.monsters.values()) {
      // Stupefaciunt (a later follow-up ask) — stunned monsters don't
      // wander OR chase this tick at all.
      if (monster.stunUntilTick !== undefined && currentTick < monster.stunUntilTick) continue;
      if (this.hasActiveAggro(monster)) continue;

      if (monster.patrolRangeTiles !== undefined) {
        this.stepPatrol(monster, changedMaps);
        continue;
      }

      const delta = deltas[Math.floor(Math.random() * deltas.length)]!;
      const nextRow = monster.row + delta.dr;
      const nextCol = monster.col + delta.dc;
      if (this.isFree(monster.mapName, nextRow, nextCol, monster.kind)) {
        monster.row = nextRow;
        monster.col = nextCol;
        changedMaps.add(monster.mapName);
      }
    }
    return changedMaps;
  }

  private hasActiveAggro(monster: Monster): boolean {
    return this.stoneBlockAggro.has(monster.id) || this.followerAggro.has(monster.id) || this.aggro.has(monster.id);
  }

  // The "speed-matching" fix's own fast tick (called from game.gateway.ts
  // alongside pet/animated-monster follower movement) — every monster
  // currently chasing ANYTHING (a player, a stone block, a demon imp)
  // steps here instead of on the slower wanderAll tick. Actual attack
  // resolution (resolveMonsterInitiatedAttack) stays on the original
  // slower combat tick, same "movement speeds up, attack cadence doesn't"
  // split Phase C's own follower speed fix already established.
  chaseAggroTargets(currentTick: number): Set<MapName> {
    this.fastTickCounter += 1;
    const changedMaps = new Set<MapName>();
    for (const monster of this.monsters.values()) {
      if (monster.stunUntilTick !== undefined && currentTick < monster.stunUntilTick) continue;
      this.stepTowardAggroTarget(monster, currentTick, changedMaps);
    }
    return changedMaps;
  }

  // Phase E's own "portal monster aggro radius" ask — every OTHER
  // monster in this game only ever aggroes from actual combat contact
  // (see setAggro, called from game.gateway.ts's combat resolution); the
  // 4 portal dungeons' own escalating-difficulty monsters (see
  // Monster.aggroRadiusTiles) additionally notice a player who's simply
  // wandered within range, same as a real "detection radius" would. Runs
  // on the ordinary (slower) wander tick — noticing someone a few tiles
  // out doesn't need fast-tick precision. Invisibility is already
  // respected for free (setAggro itself refuses while the target's
  // invisible), and a monster already aggro'd onto someone is skipped —
  // this only ever STARTS a fresh aggro, never redirects an active one.
  checkProximityAggro(currentTick: number): void {
    for (const monster of this.monsters.values()) {
      if (monster.aggroRadiusTiles === undefined || this.aggro.has(monster.id)) continue;
      for (const player of this.playersOnMap(monster.mapName)) {
        if (isWithinRadius(player.row, player.col, monster.row, monster.col, monster.aggroRadiusTiles)) {
          this.setAggro(monster.id, player.username, currentTick);
          break;
        }
      }
    }
  }

  // A "back and forth" wander mode (a follow-up ask, imps only) — paces
  // one tile at a time along a single fixed row/col axis, reversing
  // direction once it reaches patrolRangeTiles from its own spawn point
  // (or whenever the next tile that way happens to be blocked), rather
  // than stepping in a random direction like a free-roaming species does.
  private stepPatrol(monster: Monster, changedMaps: Set<MapName>): void {
    const axis = monster.patrolAxis!;
    const spawnAlong = axis === 'row' ? monster.spawnRow : monster.spawnCol;
    const currentAlong = axis === 'row' ? monster.row : monster.col;

    const tryStep = (direction: 1 | -1): boolean => {
      const nextAlong = currentAlong + direction;
      if (Math.abs(nextAlong - spawnAlong) > monster.patrolRangeTiles!) return false;
      const nextRow = axis === 'row' ? nextAlong : monster.row;
      const nextCol = axis === 'col' ? nextAlong : monster.col;
      if (!this.isFree(monster.mapName, nextRow, nextCol, monster.kind)) return false;
      monster.row = nextRow;
      monster.col = nextCol;
      changedMaps.add(monster.mapName);
      return true;
    };

    if (tryStep(monster.patrolDirection!)) return;
    // Reached the end of the patrol line (or something's in the way) —
    // reverse and try the other direction; if THAT'S also blocked, just
    // stand still this tick rather than forcing through.
    monster.patrolDirection = monster.patrolDirection === 1 ? -1 : 1;
    tryStep(monster.patrolDirection);
  }

  // Returns true if this monster's aggro state was handled this tick
  // (whether that meant chasing, staying put already-adjacent, or having
  // its aggro just expire) — false means "fall through to normal random
  // wander" (no aggro at all, or the target's gone and aggro just cleared).
  private stepTowardAggroTarget(monster: Monster, currentTick: number, changedMaps: Set<MapName>): boolean {
    // Murus lapideus (a later follow-up ask) — a stone-block redirect
    // takes priority over ordinary player aggro (mutually exclusive, see
    // redirectAggroToStoneBlock); once adjacent, the monster autonomously
    // wears it down each tick instead of "standing and fighting" (which
    // only ever meant "wait for the PLAYER's own combat tick to resolve a
    // hit" — a stone block isn't a player, so this resolves the hit here
    // directly).
    const stoneAggro = this.stoneBlockAggro.get(monster.id);
    if (stoneAggro) {
      const target = this.locateStoneBlock(stoneAggro.stoneBlockId);
      if (!target || target.mapName !== monster.mapName) {
        this.stoneBlockAggro.delete(monster.id);
        return false;
      }
      const dRow = target.row - monster.row;
      const dCol = target.col - monster.col;
      if (Math.abs(dRow) <= 1 && Math.abs(dCol) <= 1) {
        const now = Date.now();
        // Adjacent and "fighting" either way — just not due for another
        // swing yet if still on cooldown (see ATTACK_COOLDOWN_MS's own
        // doc comment above).
        if (monster.lastCounterAttackTick !== undefined && now - monster.lastCounterAttackTick < MonsterManagerService.ATTACK_COOLDOWN_MS) {
          return true;
        }
        monster.lastCounterAttackTick = now;
        const remainingHp = this.damageStoneBlock(stoneAggro.stoneBlockId, MonsterManagerService.MONSTER_VS_STONE_BLOCK_DAMAGE, monster.kind);
        if (remainingHp === undefined || remainingHp <= 0) this.stoneBlockAggro.delete(monster.id);
        return true;
      }
      if (this.stepToward(monster, target.row, target.col, changedMaps)) {
        stoneAggro.lastContactTick = currentTick;
      }
      return true;
    }

    // A later follow-up ask generalized this from the Diabolist's demon
    // imp-only version — same "redirect takes priority, chase-then-chip-
    // away" shape as the stone-block branch above; redirected
    // automatically in setAggro (not a one-time snapshot like murus
    // lapideus), so this covers every monster the owner has ATTACKED (or
    // whose follower attacked it first) since the follower engaged, not
    // just whatever happened to already be aggro'd.
    const followerAggro = this.followerAggro.get(monster.id);
    if (followerAggro) {
      const target = this.locateFollower(followerAggro.ownerUsername);
      if (
        !target ||
        target.followerKind !== followerAggro.followerKind ||
        target.followerId !== followerAggro.followerId ||
        target.mapName !== monster.mapName
      ) {
        this.followerAggro.delete(monster.id);
        return false;
      }
      const dRow = target.row - monster.row;
      const dCol = target.col - monster.col;
      if (Math.abs(dRow) <= 1 && Math.abs(dCol) <= 1) {
        const now = Date.now();
        // Adjacent and "fighting" either way — just not due for another
        // swing yet if still on cooldown (see ATTACK_COOLDOWN_MS's own
        // doc comment above — this is the exact bug fix for "the monster
        // hitting the pet/summon/animated really fast per millisecond").
        if (monster.lastCounterAttackTick !== undefined && now - monster.lastCounterAttackTick < MonsterManagerService.ATTACK_COOLDOWN_MS) {
          return true;
        }
        monster.lastCounterAttackTick = now;
        const remainingHp = this.damageFollower(
          followerAggro.ownerUsername,
          followerAggro.followerKind,
          followerAggro.followerId,
          MonsterManagerService.MONSTER_VS_FOLLOWER_DAMAGE
        );
        // A follower taking a hit is a real state change nobody would
        // otherwise see — chaseAggroTargets's own map:state broadcast is
        // keyed entirely off actual MOVEMENT (see stepToward's own
        // changedMaps.add calls), so standing still and pounding on a
        // follower needs its own explicit add here too.
        changedMaps.add(monster.mapName);
        if (remainingHp === undefined || remainingHp <= 0) this.followerAggro.delete(monster.id);
        return true;
      }
      if (this.stepToward(monster, target.row, target.col, changedMaps)) {
        followerAggro.lastContactTick = currentTick;
      }
      return true;
    }

    const aggro = this.aggro.get(monster.id);
    if (!aggro) return false;

    if (currentTick - aggro.lastContactTick > MonsterManagerService.AGGRO_TIMEOUT_TICKS) {
      this.aggro.delete(monster.id);
      return false;
    }

    const target = this.locatePlayer(aggro.targetUsername);
    if (!target || target.mapName !== monster.mapName) {
      this.aggro.delete(monster.id);
      return false;
    }
    // A follow-up bug fix: "imps still are not moving toward the player
    // to attack" — this was NEVER refreshed while actively chasing
    // (only set once, back at the original setAggro call), unlike the
    // stone-block aggro branch above which already refreshes its own
    // lastContactTick on every successful step. Any chase further than
    // AGGRO_TIMEOUT_TICKS worth of walking (~30s) silently expired
    // mid-pursuit — still being able to LOCATE the target every tick (as
    // we just did, right above) is itself "contact," so refresh here too.
    aggro.lastContactTick = currentTick;

    const dRow = target.row - monster.row;
    const dCol = target.col - monster.col;
    // A later follow-up bug fix: "the imp STILL did not attack the
    // player once in range" — this used to accept DIAGONAL adjacency
    // (Chebyshev distance 1, both axes within 1) as "close enough, stop
    // chasing." But every actual attack resolution in this game — the
    // player's own punch (see engageInDirection's own targetRow/Col,
    // which only ever checks the one cardinal tile actually faced),
    // the reactive counter, AND resolveMonsterInitiatedAttack's own
    // proactive attack below — all require STRICT cardinal adjacency
    // (Manhattan distance exactly 1). A monster that stopped one tile
    // too early, diagonally, would sit there "in range" by its own
    // reckoning forever without ever being ABLE to land a hit. Matching
    // the same strict shape here means it keeps closing that last
    // diagonal step until it's actually able to fight.
    if (Math.abs(dRow) + Math.abs(dCol) === 1) {
      // Already adjacent — stand and fight (the combat tick resolves the
      // actual hit), don't wander off.
      return true;
    }

    // Water bolt (a later follow-up ask) — "slow the monster down for 1
    // combat tick": a slowed monster chases at half the ordinary rate —
    // this method is now called every fast tick (see chaseAggroTargets),
    // so "half rate" means skipping every other invocation, tracked via
    // fastTickCounter's own parity rather than a steps-per-call count.
    if (this.isSlowed(monster.id, currentTick) && this.fastTickCounter % 2 !== 0) {
      return true;
    }
    this.stepToward(monster, target.row, target.col, changedMaps);
    return true;
  }

  // Shared by both aggro-chase branches above — greedy chase toward
  // (targetRow, targetCol), closing whichever axis has the bigger gap
  // first (cheap, correct on open ground); if that's blocked, tries the
  // OTHER axis; only when BOTH are blocked (a follow-up ask: "smart
  // movement... to navigate around an obstacle" — e.g. Grimoak Grounds'
  // own moat) does this fall back to a bounded BFS for an actual route
  // around whatever's in the way. Returns true if it actually moved.
  private stepToward(monster: Monster, targetRow: number, targetCol: number, changedMaps: Set<MapName>): boolean {
    const dRow = targetRow - monster.row;
    const dCol = targetCol - monster.col;
    const stepRow = Math.abs(dRow) >= Math.abs(dCol) ? Math.sign(dRow) : 0;
    const stepCol = stepRow === 0 ? Math.sign(dCol) : 0;
    let nextRow = monster.row + stepRow;
    let nextCol = monster.col + stepCol;
    if (!this.isFree(monster.mapName, nextRow, nextCol, monster.kind)) {
      const altRow = stepRow === 0 && dRow !== 0 ? monster.row + Math.sign(dRow) : monster.row;
      const altCol = stepCol === 0 && dCol !== 0 ? monster.col + Math.sign(dCol) : monster.col;
      if ((altRow !== monster.row || altCol !== monster.col) && this.isFree(monster.mapName, altRow, altCol, monster.kind)) {
        nextRow = altRow;
        nextCol = altCol;
      } else {
        const step = this.findNextStepToward(monster.mapName, monster.row, monster.col, targetRow, targetCol, monster.kind);
        if (!step) return false; // no route found within budget — stand still this tick
        nextRow = step.row;
        nextCol = step.col;
      }
    }
    if (this.isFree(monster.mapName, nextRow, nextCol, monster.kind)) {
      monster.row = nextRow;
      monster.col = nextCol;
      changedMaps.add(monster.mapName);
      return true;
    }
    return false;
  }

  // A bounded breadth-first search for the FIRST step of a shortest route
  // from (fromRow, fromCol) to anywhere adjacent to (targetRow, targetCol)
  // — capped at PATHFIND_NODE_BUDGET explored tiles so a monster on the
  // far side of a big obstacle just gives up and stands still that tick
  // rather than scanning the whole map every single tick it's stuck.
  private static readonly PATHFIND_NODE_BUDGET = 300;

  private findNextStepToward(
    mapName: MapName,
    fromRow: number,
    fromCol: number,
    targetRow: number,
    targetCol: number,
    kind?: MonsterKind
  ): { row: number; col: number } | null {
    const deltas = Object.values(DIRECTION_DELTAS);
    const visited = new Set<string>([`${fromRow},${fromCol}`]);
    const queue: Array<{ row: number; col: number; firstStep: { row: number; col: number } }> = [];
    for (const d of deltas) {
      const row = fromRow + d.dr;
      const col = fromCol + d.dc;
      if (!this.isFree(mapName, row, col, kind)) continue;
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ row, col, firstStep: { row, col } });
    }

    let head = 0;
    let explored = 0;
    while (head < queue.length && explored < MonsterManagerService.PATHFIND_NODE_BUDGET) {
      const current = queue[head++]!;
      explored++;
      if (Math.abs(current.row - targetRow) <= 1 && Math.abs(current.col - targetCol) <= 1) {
        return current.firstStep;
      }
      for (const d of deltas) {
        const row = current.row + d.dr;
        const col = current.col + d.dc;
        const key = `${row},${col}`;
        if (visited.has(key)) continue;
        if (!this.isFree(mapName, row, col, kind)) continue;
        visited.add(key);
        queue.push({ row, col, firstStep: current.firstStep });
      }
    }
    return null;
  }

  getMonster(id: string): Monster | undefined {
    return this.monsters.get(id);
  }

  // Backs GameGateway's monsterAttackTick — every live monster, regardless
  // of map (the caller filters by adjacency to a player itself).
  allMonsters(): Monster[] {
    return [...this.monsters.values()];
  }

  // Contact lookup for the punch/combat system — exact tile match, same
  // "same cell" contact rule the NPC/player collision already uses.
  findMonsterAt(mapName: MapName, row: number, col: number): Monster | undefined {
    for (const monster of this.monsters.values()) {
      if (monster.mapName === mapName && monster.row === row && monster.col === col) return monster;
    }
    return undefined;
  }

  isOccupied(mapName: MapName, row: number, col: number): boolean {
    return this.findMonsterAt(mapName, row, col) !== undefined;
  }

  // Returns the monster's post-hit state and whether it died. Dead
  // monsters are removed immediately; respawnBelowMax tops the species
  // back up on its own schedule.
  // The Druid's own "Tame Beast" spell (a later follow-up ask) — a tamed
  // monster leaves the wild population entirely (it's part of the
  // player's own group now, tracked by TamedBeastManagerService instead),
  // but this is NOT a death: no corpse, no respawnDelayMs cooldown — its
  // own species just respawns a fresh one on the ordinary schedule, same
  // as if this one had simply wandered off.
  removeMonster(id: string): Monster | undefined {
    const monster = this.monsters.get(id);
    if (!monster) return undefined;
    this.monsters.delete(id);
    this.aggro.delete(id);
    return monster;
  }

  applyDamage(id: string, amount: number): { monster: Monster; died: boolean } | undefined {
    const monster = this.monsters.get(id);
    if (!monster) return undefined;

    monster.hp = Math.max(0, monster.hp - amount);
    const died = monster.hp <= 0;
    if (died) {
      this.monsters.delete(id);
      this.aggro.delete(id);
      // A "rare" monster's own slow respawn (a later follow-up ask:
      // "once killed take a minute to re-spawn") — gates respawnBelowMax
      // below from topping this species back up again until the delay's
      // up, instead of the usual "respawn as soon as the timer gets to
      // it" cadence every ordinary species uses.
      if (monster.respawnDelayMs) this.nextRespawnAllowedAt.set(monster.speciesId, Date.now() + monster.respawnDelayMs);
    }
    return { monster, died };
  }

  getSnapshotsForMap(mapName: MapName): MonsterSnapshot[] {
    const snapshots: MonsterSnapshot[] = [];
    for (const m of this.monsters.values()) {
      if (m.mapName !== mapName) continue;
      snapshots.push({
        id: m.id,
        kind: m.kind,
        monsterClass: m.monsterClass,
        map: m.mapName,
        row: m.row,
        col: m.col,
        level: m.level,
        hp: m.hp,
        maxHp: m.maxHp,
        carriedItems: m.carriedItems,
        isRare: m.isRare,
        flies: m.flies,
      });
    }
    return snapshots;
  }
}
