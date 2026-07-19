import type { MapName, MonsterKind, MonsterClass } from '../../shared/constants.js';
import type { CombatantStats } from '../combat/formulas.js';
import {
  monsterExpRewardForLevel,
  monsterHpForLevel,
  monsterAttackDamageForLevel,
  RARE_MONSTER_STAT_MULTIPLIER,
  RARE_MONSTER_HP_MULTIPLIER,
} from '../combat/formulas.js';
import { PUNCH_SKILL, DAGGER_SKILL } from '../../shared/skills.js';
import { GRIMOAK_GROUNDS_EXTENSION_MIN_COL } from '../../shared/maps.js';

// A wild monster is a plain in-memory record — no account, no login, not
// persisted (population/position reset on server restart, same tradeoff
// the text game's own monster-manager.service.ts makes and documents).
export interface Monster extends CombatantStats {
  id: string;
  kind: MonsterKind;
  monsterClass: MonsterClass;
  mapName: MapName;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
  expReward: number;
  // A flat coin drop (a later follow-up ask) — see MonsterSpecies.goldReward.
  goldReward: number;
  // A "rare" variant (a later follow-up ask) — bigger (see
  // WorldScene's own monster sprite scale), tougher, better loot, only
  // one ever roaming at once (see MonsterSpecies.maxCount), and slow to
  // come back once killed (see respawnDelayMs/MonsterManagerService's own
  // nextRespawnAllowedAt).
  isRare?: boolean;
  respawnDelayMs?: number;
  // Rolled independently per entry at spawn time (see
  // MonsterSpecies.carriedItemRolls) — extra items its corpse drops
  // alongside the usual body part, and (while alive) what the
  // counter-attack overlay shows it wielding (first weapon-slot item, if
  // any). A monster can end up carrying none, one, or several at once.
  carriedItems: string[];
  // A real skill percent, same shape as a player's own client.data.skills
  // — every monster always knows punch; one carrying a weapon (see
  // carriedItems) also knows the matching weapon skill. Its counter-attack
  // damage (see game.gateway.ts's resolveMonsterCounterAttack) is computed
  // through the exact same punchDamage()/weaponBonusFor() formula a player
  // uses, at this percent, instead of a flat made-up number.
  skills: Record<string, number>;
  // Where this instance originally spawned — fixed for its whole
  // lifetime, used by a "patrol" species (see patrolRangeTiles below) to
  // know how far it's allowed to wander from home.
  spawnRow: number;
  spawnCol: number;
  // Set only for a species with MonsterSpecies.patrolRangeTiles (a
  // follow-up ask: imps "follow a small back and forth walking path from
  // where they spawned at") — which single row/col axis it paces along,
  // and which way it's currently walking on that axis (flips at either
  // end of the patrol range or whenever the next tile's blocked). See
  // MonsterManagerService.stepPatrol.
  patrolAxis?: 'row' | 'col';
  patrolDirection?: 1 | -1;
  // Copied from MonsterSpecies.patrolRangeTiles at spawn time (so
  // wanderAll doesn't need a species lookup on every tick) — undefined
  // means "wander freely," same as before this feature existed.
  patrolRangeTiles?: number;
  // Phase E's own "portal monster aggro radius" ask — copied from
  // MonsterSpecies.aggroRadiusTiles at spawn time. Undefined (every
  // ordinary monster) means aggro only ever starts from actual combat
  // contact, same as before this feature existed — only the 4 portal
  // dungeons' own tougher monsters notice a player approaching before
  // being hit first (see checkProximityAggro).
  aggroRadiusTiles?: number;
  // Stupefaciunt (a later follow-up ask) — a combat-tick number; while
  // currentTick is below this, the monster can't move or act at all (see
  // MonsterManagerService.isStunned/stun). Undefined (the common case)
  // means "not currently stunned."
  stunUntilTick?: number;
  // Water bolt (a later follow-up ask) — a much lighter version of the
  // above: while currentTick is below this, the monster still moves/acts,
  // just at the ordinary (non-aggro'd) pace even if it's currently
  // aggro'd (see MonsterManagerService.slow/isSlowed and its own
  // AGGRO_CHASE_STEPS_PER_TICK step-count check).
  slowUntilTick?: number;
  // Copied from MonsterSpecies.attackDamage at spawn time (a later
  // follow-up ask: "the imp did not start moving toward the player when
  // attacked... they should move into range to hit the player if
  // aggro'd") — a species with this set proactively attacks an aggro'd,
  // adjacent player for this flat amount every combat tick, independent
  // of whether the player is also attacking THIS tick (see
  // game.gateway.ts's resolveMonsterInitiatedAttack). Undefined means the
  // species has no proactive attack at all, only its existing reactive
  // counter-attack when hit.
  attackDamage?: number;
  // Real-clock timestamp (Date.now()) the last hit actually landed for
  // this monster, whether resolveMonsterInitiatedAttack's own proactive
  // fast-tick pass or the ordinary reactive counter-attack in
  // resolveHitOnMonster fired it — lets resolveMonsterInitiatedAttack
  // skip a monster that's already within its own ATTACK_COOLDOWN_MS
  // window (a later follow-up fix moved this off tick-count equality, so
  // it's a real cooldown rather than only ever suppressing a double-hit
  // within the exact same tick).
  lastCounterAttackTick?: number;
  // Which MonsterSpecies entry spawned this instance (see
  // MonsterSpecies.id's own doc comment) — copied at spawn time so
  // countOf/respawnBelowMax can tell apart two species entries that
  // happen to share the same `kind` (a follow-up ask's tougher wild
  // skeleton/goblin populations on Grimoak Grounds, distinct from the
  // original Labyrinth/Great Plains ones).
  speciesId: string;
}

export interface CarriedItemRoll {
  label: string;
  // 0-1 chance, rolled independently of any other entry, once per
  // spawned instance.
  chance: number;
}

export interface MonsterSpecies {
  kind: MonsterKind;
  monsterClass: MonsterClass;
  homeMap: MapName;
  // How many of this species should exist at once.
  maxCount: number;
  startingHp: number;
  expReward: number;
  // A flat coin drop, every kill, no roll (a later follow-up ask: "the
  // imps should drop 3 coins every time on death... skeletons 5...
  // goblins 7") — added to the corpse alongside its own items (see
  // CorpseSnapshot.gold), not itself an inventory item. Absent/0 for any
  // species that shouldn't drop coins at all.
  goldReward?: number;
  carriedItemRolls?: CarriedItemRoll[];
  // Present only for a species that paces back and forth near its own
  // spawn point instead of roaming its whole home map at random (a
  // follow-up ask, imps only, see Monster.patrolAxis/patrolDirection) —
  // how many tiles either side of its spawn point it's willing to walk.
  patrolRangeTiles?: number;
  // See Monster.attackDamage's own doc comment.
  attackDamage?: number;
  // See Monster.aggroRadiusTiles's own doc comment — undefined for every
  // ordinary species (aggro only from contact); set for the 4 portal
  // dungeons' own escalating-difficulty monsters.
  aggroRadiusTiles?: number;
  // Distinguishes two species entries that share the same `kind` (a
  // follow-up ask added a second, tougher "wild skeleton"/"wild goblin"
  // population on Grimoak Grounds, distinct from the original Labyrinth/
  // Great Plains ones) — countOf/respawnBelowMax key off this instead of
  // `kind` alone. Defaults to `kind` itself when absent, so every
  // existing single-population species needs no changes at all.
  id?: string;
  // Overrides MONSTER_LEVEL for this species specifically (a follow-up
  // ask's higher-level Grimoak Grounds populations).
  level?: number;
  // Restricts spawn placement to col >= this (a follow-up ask: the new
  // wild skeleton/goblin populations only roam the newly-widened strip
  // of Grimoak Grounds, not the whole map) — see
  // shared/maps.ts's GRIMOAK_GROUNDS_EXTENSION_MIN_COL.
  minSpawnCol?: number;
  // A "rare" variant (a later follow-up ask: "create a rare imp, rare
  // wild skeleton, rare wild goblin... slightly bigger... once killed
  // take a minute to re-spawn") — see Monster.isRare's own doc comment.
  isRare?: boolean;
  // How long after this species' own last death before respawnBelowMax
  // will spawn another (see MonsterManagerService's own
  // nextRespawnAllowedAt) — absent means "respawn as soon as
  // respawnBelowMax gets to it," the existing behavior for every
  // ordinary species.
  respawnDelayMs?: number;
}

// Every wild monster starts at level 1 with every attribute at 1 — so a
// level-1 player vs. a level-1 monster is exactly neutral by default,
// same convention as the text game's MONSTER_LEVEL/MONSTER_BASE_ATTRIBUTE.
export const MONSTER_LEVEL = 1;
export const MONSTER_BASE_ATTRIBUTE = 1;
// A wild monster's proficiency at whatever it's swinging — a real
// combatant, not a fresh level-1 character still practicing, but not
// maxed out either. Same percent for punch and (if it's carrying one) its
// weapon skill.
export const MONSTER_SKILL_PERCENT = 50;

// Every monster always knows how to punch; one carrying a weapon whose
// name contains "dagger" also knows the dagger skill — called once at
// spawn time (see MonsterManagerService.spawnOne) with that instance's
// own rolled carriedItems.
export function skillsForCarriedItems(carriedItems: string[]): Record<string, number> {
  const skills: Record<string, number> = { [PUNCH_SKILL]: MONSTER_SKILL_PERCENT };
  if (carriedItems.some((item) => item.toLowerCase().includes('dagger'))) {
    skills[DAGGER_SKILL] = MONSTER_SKILL_PERCENT;
  }
  return skills;
}

// A later follow-up ask ("examine all of the monsters created so far and
// see if some should have more or less hp, more or less damage... give
// monsters at different levels base stats for that level") audited every
// species below against combat/formulas.ts's own monsterHpForLevel/
// monsterAttackDamageForLevel/monsterExpRewardForLevel — a clean per-level
// line those functions' own doc comments show the higher-level dungeon
// tiers (12/17/25/35) were ALREADY implicitly following almost exactly.
// Every species now computes its hp/damage/exp straight from its own
// `level` through those shared functions instead of a hand-typed number,
// so the whole roster stays internally consistent and any future new
// tier only needs a level, not a fresh round of guessing. The one
// deliberate exception is the three original level-1 species' hp (goblin/
// skeleton/imp) — kept at their existing, explicitly pacing-tuned values
// (see each entry's own comment) rather than dropping to the formula's
// own ~15, since that bump was a real fix for these dying in 1-2 hits;
// dire wolf/bear's hp(200) is also kept literal, since the user gave that
// exact figure directly for dire wolf and "similar stats" for bear.
export const MONSTER_SPECIES: MonsterSpecies[] = [
  {
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Great Plains',
    maxCount: 15,
    // Bumped up from 15 (item 20) — a level 1-3 player was killing these
    // in just a couple of tick-resolved hits, over almost as soon as it
    // started. Kept as a literal (not monsterHpForLevel(1)'s own ~15) —
    // see this array's own doc comment above.
    startingHp: 24,
    expReward: monsterExpRewardForLevel(1),
    // A later follow-up ask: "7 coins on death" + "30% chance for any
    // wild goblin to drop studded armor, studded helmet, boots of
    // quickness" — each item rolled independently, same shape
    // carriedItemRolls already uses for wild skeleton's own daggers below
    // (so a single kill could drop none, one, two, or all three).
    goldReward: 7,
    carriedItemRolls: [
      { label: 'studded armor', chance: 0.3 },
      { label: 'studded helmet', chance: 0.3 },
      { label: 'boots of quickness', chance: 0.3 },
    ],
  },
  {
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Labyrinth',
    maxCount: 10,
    // Same reasoning as wild goblin above — bumped from 20, kept literal.
    startingHp: 32,
    expReward: monsterExpRewardForLevel(1),
    // A later follow-up ask: "5 coins on death" + "35% chance for any
    // wild skeleton to drop opal earrings, opal ring, bone ring, opal
    // necklace" — each item rolled independently, same as the existing
    // bone dagger/bone shield rolls below.
    goldReward: 5,
    carriedItemRolls: [
      { label: 'bone dagger', chance: 0.3 },
      { label: 'bone shield', chance: 0.2 },
      { label: 'opal earrings', chance: 0.35 },
      { label: 'opal ring', chance: 0.35 },
      { label: 'bone ring', chance: 0.35 },
      { label: 'opal necklace', chance: 0.35 },
    ],
  },
  {
    kind: 'imp',
    monsterClass: 'normal',
    homeMap: 'Grimoak Grounds',
    // 40 of them, spread across the whole grounds outside the castle (a
    // follow-up ask). 30 hp kept literal (see this array's own doc
    // comment) — expReward feeds the SAME expGainFor() ratio formula
    // every other monster kill already uses (see game.gateway.ts's
    // resolveHitOnMonster), so a player can already level up from imp
    // kills with no separate leveling logic needed.
    maxCount: 40,
    startingHp: 30,
    // A past follow-up ask deliberately bumped this to 30 (2.3x the plain
    // level-1 rate) purely for early accessibility, back when the TNL
    // curve and monster exp rewards weren't yet consistent with each
    // other. Now that BOTH sides of that ratio are tied to the same
    // per-level formula (see maxTnlForLevel/monsterExpRewardForLevel's own
    // doc comments) and the level 1-10 grind has been simulated (see
    // tests/verify-balance-sim.mjs) to confirm early leveling already
    // paces well without it, that one-off boost is no longer needed —
    // superseded here so the imp lines up with every other level-1
    // species instead of quietly outpacing them for no in-fiction reason.
    expReward: monsterExpRewardForLevel(1),
    // A later follow-up ask: "3 coins on death" + "35% chance for any
    // imp to drop cloth armor, cloth helmet, cloth boots, cloth
    // vambraces, cloth greaves" — each piece rolled independently.
    goldReward: 3,
    carriedItemRolls: [
      { label: 'cloth armor', chance: 0.35 },
      { label: 'cloth helmet', chance: 0.35 },
      { label: 'cloth boots', chance: 0.35 },
      { label: 'cloth vambraces', chance: 0.35 },
      { label: 'cloth greaves', chance: 0.35 },
    ],
    // Paces back and forth within 3 tiles of wherever it spawned (a
    // follow-up ask), rather than roaming the whole map the way a wild
    // goblin/skeleton does — see MonsterManagerService.stepPatrol.
    patrolRangeTiles: 3,
    // "The imps have a physical attack/punch that should do 5 damage per
    // hit" (a past follow-up ask) — monsterAttackDamageForLevel(1) lands
    // on this exact figure already, so the formula and the original
    // explicit spec agree with no override needed.
    attackDamage: monsterAttackDamageForLevel(1),
  },
  // The Grimoak Grounds' new 25%-wider eastern strip (a follow-up ask) —
  // a distinct, tougher population of the same 2 kinds already roaming
  // Great Plains/the Labyrinth, free-roaming (no patrolRangeTiles) rather
  // than pacing like the imps, but WITH an attackDamage so they still
  // "move closer to punch when aggro'd" the exact same way imps do (see
  // MonsterManagerService.wanderAll — stepTowardAggroTarget already
  // applies to every monster generically, imp or not; attackDamage is
  // the only piece that actually needs setting here). `id` keeps their
  // own headcount separate from the ORIGINAL wild goblin/skeleton
  // populations sharing the same `kind` (see countOf/respawnBelowMax).
  {
    id: 'wild-skeleton-grounds',
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 15,
    level: 5,
    // Was a flat 100/10 exp, unchanged since this species was leveled up
    // to 5 in an earlier session — a real bug this pass fixes (see this
    // file's own top-of-array doc comment): a "tougher" level-5 monster
    // was still only worth a level-1 amount of exp.
    startingHp: monsterHpForLevel(5),
    expReward: monsterExpRewardForLevel(5),
    attackDamage: monsterAttackDamageForLevel(5),
    // Same coin/jewelry drop table as the original Labyrinth population
    // above — "the wild skeletons" covers both.
    goldReward: 5,
    carriedItemRolls: [
      { label: 'bone dagger', chance: 0.3 },
      { label: 'bone shield', chance: 0.2 },
      { label: 'opal earrings', chance: 0.35 },
      { label: 'opal ring', chance: 0.35 },
      { label: 'bone ring', chance: 0.35 },
      { label: 'opal necklace', chance: 0.35 },
    ],
  },
  {
    id: 'wild-goblin-grounds',
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 15,
    level: 7,
    // Same fix as wild-skeleton-grounds above — was a flat 130hp/8exp
    // never rescaled for this species' own level-7 tier.
    startingHp: monsterHpForLevel(7),
    expReward: monsterExpRewardForLevel(7),
    attackDamage: monsterAttackDamageForLevel(7),
    // Same coin/armor drop table as the original Great Plains population
    // above — "the wild goblins" covers both.
    goldReward: 7,
    carriedItemRolls: [
      { label: 'studded armor', chance: 0.3 },
      { label: 'studded helmet', chance: 0.3 },
      { label: 'boots of quickness', chance: 0.3 },
    ],
  },
  // 3 rare variants (a later follow-up ask) — one of each kind at once
  // (maxCount: 1), a bigger sprite scale (see WorldScene's own monster
  // rendering keying off isRare), more hp/damage than an ordinary one of
  // its kind (RARE_MONSTER_HP_MULTIPLIER/RARE_MONSTER_STAT_MULTIPLIER —
  // see combat/formulas.ts's own doc comment for why these replaced a
  // past session's runaway compounding per-level math, which had left a
  // level-7 "rare" trash monster hitting harder than the level-35 endgame
  // tier), a much richer guaranteed haul (fixed-count mana crystals +
  // gold + a real shot at real equipment, not just a percentage roll on
  // ordinary drops), and slow to come back once killed
  // (respawnDelayMs — see MonsterManagerService's own nextRespawnAllowedAt).
  {
    id: 'rare-imp',
    kind: 'imp',
    monsterClass: 'normal',
    homeMap: 'Grimoak Grounds',
    maxCount: 1,
    isRare: true,
    respawnDelayMs: 60_000,
    // "The rare imp should be level 3 with equivalent stats" (a past
    // follow-up ask).
    level: 3,
    startingHp: Math.round(monsterHpForLevel(3) * RARE_MONSTER_HP_MULTIPLIER),
    expReward: Math.round(monsterExpRewardForLevel(3) * RARE_MONSTER_STAT_MULTIPLIER),
    attackDamage: Math.round(monsterAttackDamageForLevel(3) * RARE_MONSTER_STAT_MULTIPLIER),
    goldReward: 10,
    carriedItemRolls: [
      ...Array.from({ length: 10 }, () => ({ label: 'lesser mana crystal', chance: 1 })),
      { label: 'cloth armor', chance: 0.5 },
    ],
    patrolRangeTiles: 3,
  },
  {
    // A later follow-up ask: "the rare wild skeleton and rare wild
    // goblin were nowhere to be found. They should exist, check the
    // previous rule about spawning" — this (and rare-wild-goblin below)
    // were left on their OLD, pre-wizarding-pivot homeMap ('Labyrinth')
    // when the ordinary wild skeleton population migrated to Grimoak
    // Grounds' own eastern extension strip (see wild-skeleton-grounds
    // above, and shared/maps.ts's GRIMOAK_GROUNDS_EXTENSION_MIN_COL) —
    // rare-imp got that same migration, these two never did, so they
    // were spawning on a map nobody can reach anymore. Same minSpawnCol
    // restriction as their ordinary counterpart, so a rare one turns up
    // in the same eastern area a player is already fighting the regular
    // population in, not scattered across the whole grounds (imp
    // territory).
    // "The rare wild skeleton should be level 7... with stats that
    // resemble that level" (a past follow-up ask) — hp/attackDamage here
    // superseded from that ask's own runaway compounding math (388hp/66
    // dmg, well past even the level-35 tier's own numbers) with the
    // shared rare formula, per this array's own top-of-file doc comment.
    id: 'rare-wild-skeleton',
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 1,
    isRare: true,
    respawnDelayMs: 60_000,
    level: 7,
    startingHp: Math.round(monsterHpForLevel(7) * RARE_MONSTER_HP_MULTIPLIER),
    expReward: Math.round(monsterExpRewardForLevel(7) * RARE_MONSTER_STAT_MULTIPLIER),
    attackDamage: Math.round(monsterAttackDamageForLevel(7) * RARE_MONSTER_STAT_MULTIPLIER),
    goldReward: 15,
    carriedItemRolls: [
      ...Array.from({ length: 10 }, () => ({ label: 'superior mana crystal', chance: 1 })),
      { label: 'opal ring', chance: 0.5 },
      { label: 'opal necklace', chance: 0.5 },
    ],
  },
  {
    // Same fix/reasoning as rare-wild-skeleton above, "the rare wild
    // goblin should be level 9" — superseded from its own past runaway
    // 538hp/98dmg (also past the level-35 tier's own numbers) with the
    // shared rare formula.
    id: 'rare-wild-goblin',
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 1,
    isRare: true,
    respawnDelayMs: 60_000,
    level: 9,
    startingHp: Math.round(monsterHpForLevel(9) * RARE_MONSTER_HP_MULTIPLIER),
    expReward: Math.round(monsterExpRewardForLevel(9) * RARE_MONSTER_STAT_MULTIPLIER),
    attackDamage: Math.round(monsterAttackDamageForLevel(9) * RARE_MONSTER_STAT_MULTIPLIER),
    goldReward: 20,
    carriedItemRolls: [
      ...Array.from({ length: 20 }, () => ({ label: 'superior mana crystal', chance: 1 })),
      { label: 'studded armor', chance: 0.5 },
      { label: 'boots of quickness', chance: 0.5 },
    ],
  },
  // The 4th floor's own 4 portal dungeons (a later follow-up ask) — "add
  // some places the portals will take the player, like level 10-15
  // monsters, 15-20, 20-30, 30-40. The monsters should give better
  // pieces of equipment and rare wands not available in the shop."
  // Reuses the 3 existing monster kinds at escalating stats/loot rather
  // than standing up brand new creature types/sprites — "it can be
  // refined later." hp/damage/exp were ALREADY very close to the shared
  // per-level formula (see this array's own top-of-file doc comment) —
  // now computed from it directly instead of the near-identical hand-set
  // numbers, so the two can never quietly drift apart again.
  {
    id: 'sunken-crypt-skeleton',
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Sunken Crypt',
    maxCount: 8,
    level: 12,
    startingHp: monsterHpForLevel(12),
    expReward: monsterExpRewardForLevel(12),
    attackDamage: monsterAttackDamageForLevel(12),
    goldReward: 10,
    // Phase E's own "aggro radius" ask — notices an approaching
    // player from a few tiles out, not just on actual contact.
    aggroRadiusTiles: 5,
    carriedItemRolls: [
      { label: 'wand of frost', chance: 0.15 },
      { label: 'chainmail vambraces', chance: 0.2 },
    ],
  },
  {
    id: 'goblin-warcamp-goblin',
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Goblin Warcamp',
    maxCount: 8,
    level: 17,
    startingHp: monsterHpForLevel(17),
    expReward: monsterExpRewardForLevel(17),
    attackDamage: monsterAttackDamageForLevel(17),
    goldReward: 15,
    // Phase E's own "aggro radius" ask — notices an approaching
    // player from a few tiles out, not just on actual contact.
    aggroRadiusTiles: 5,
    carriedItemRolls: [
      { label: 'wand of embers', chance: 0.15 },
      { label: "warlord's greaves", chance: 0.2 },
    ],
  },
  {
    id: 'imp-hollow-imp',
    kind: 'imp',
    monsterClass: 'normal',
    homeMap: 'Imp Hollow',
    maxCount: 8,
    level: 25,
    startingHp: monsterHpForLevel(25),
    expReward: monsterExpRewardForLevel(25),
    attackDamage: monsterAttackDamageForLevel(25),
    goldReward: 20,
    // Phase E's own "aggro radius" ask — notices an approaching
    // player from a few tiles out, not just on actual contact.
    aggroRadiusTiles: 5,
    carriedItemRolls: [
      { label: 'wand of shadows', chance: 0.12 },
      { label: 'obsidian helm', chance: 0.18 },
    ],
  },
  {
    id: 'ashen-wastes-goblin',
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Ashen Wastes',
    maxCount: 8,
    level: 35,
    startingHp: monsterHpForLevel(35),
    expReward: monsterExpRewardForLevel(35),
    attackDamage: monsterAttackDamageForLevel(35),
    goldReward: 30,
    // Phase E's own "aggro radius" ask — notices an approaching
    // player from a few tiles out, not just on actual contact.
    aggroRadiusTiles: 5,
    carriedItemRolls: [
      { label: 'wand of the ashen king', chance: 0.1 },
      { label: 'dragon scale armor', chance: 0.15 },
    ],
  },
  // A later follow-up ask: "Direfell should have level 20 dire wolves
  // (while meancing gnarly looking wolves bigger than normal wolves)
  // that have 200 hp and do appropriate damage for a level 20 mob...
  // give appropriate experience" — 200 hp is the user's own explicit
  // figure, kept literal; expReward/attackDamage now come from the same
  // shared per-level formula every other species uses (this array's own
  // past interpolation happened to already land almost exactly on it —
  // 260 exp matches monsterExpRewardForLevel(20) exactly).
  {
    kind: 'dire wolf',
    monsterClass: 'normal',
    homeMap: 'Direfell',
    maxCount: 10,
    level: 20,
    startingHp: 200,
    expReward: monsterExpRewardForLevel(20),
    attackDamage: monsterAttackDamageForLevel(20),
    goldReward: 17,
    aggroRadiusTiles: 5,
  },
  // A later follow-up ask: "in the great plains add level 20 bears
  // (similar stats to the dire wolves) that roam around the great
  // plains" — same figures as dire wolf above, just its own kind/sprite/
  // home map; the default random-wander behavior already gives Great
  // Plains' other monsters (no patrolRangeTiles here) covers "roam
  // around."
  {
    kind: 'bear',
    monsterClass: 'normal',
    homeMap: 'Great Plains',
    maxCount: 8,
    level: 20,
    startingHp: 200,
    expReward: monsterExpRewardForLevel(20),
    attackDamage: monsterAttackDamageForLevel(20),
    goldReward: 17,
    aggroRadiusTiles: 5,
  },
];
