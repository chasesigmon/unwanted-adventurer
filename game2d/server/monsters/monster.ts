import type { MapName, MonsterKind, MonsterClass } from '../../shared/constants.js';
import type { CombatantStats } from '../combat/formulas.js';
import { WILD_GOBLIN_EXP_REWARD, WILD_SKELETON_EXP_REWARD } from '../combat/formulas.js';
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

export const MONSTER_SPECIES: MonsterSpecies[] = [
  {
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Great Plains',
    maxCount: 15,
    // Bumped up from 15 (item 20) — a level 1-3 player was killing these
    // in just a couple of tick-resolved hits, over almost as soon as it
    // started. Combined with the new Armor Class system (see
    // combat/formulas.ts) blunting a bit of every hit too, this stretches
    // an early fight out to a real handful of combat ticks.
    startingHp: 24,
    expReward: WILD_GOBLIN_EXP_REWARD,
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
    // Same reasoning as wild goblin above — bumped from 20.
    startingHp: 32,
    expReward: WILD_SKELETON_EXP_REWARD,
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
    // follow-up ask). 30 hp (a later follow-up ask) — expReward feeds the
    // SAME expGainFor() ratio formula every other monster kill already
    // uses (see game.gateway.ts's resolveHitOnMonster), so a player can
    // already level up from imp kills with no separate leveling logic
    // needed.
    maxCount: 40,
    startingHp: 30,
    // A follow-up ask: "the imps should give more than 3 exp at level 1
    // compared to the players level 3... more like between 20 and 40" —
    // 4 fed through expGainFor's own ratio formula at that exact pairing
    // (imp level 1, killer level 3) rounded down to just 3 exp, barely
    // worth the fight for 40 roaming imps. 30 lands at 25 for that same
    // pairing, comfortably in range (and scales the same proportional
    // way every other monster's own expReward already does at every
    // OTHER level pairing — see expGainFor's own doc comment).
    expReward: 30,
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
    // hit. They should move into range to hit the player if aggro'd" (a
    // later follow-up ask) — see Monster.attackDamage's own doc comment.
    attackDamage: 5,
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
    startingHp: 100,
    expReward: WILD_SKELETON_EXP_REWARD,
    attackDamage: 10,
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
    startingHp: 130,
    expReward: WILD_GOBLIN_EXP_REWARD,
    attackDamage: 15,
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
  // its kind, a much richer guaranteed haul (fixed-count mana crystals +
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
    // "The rare imp should be level 3 with equivalent stats" (a later
    // follow-up ask) — it used to have no explicit `level` at all (so it
    // defaulted to MONSTER_LEVEL, i.e. 1, same as the ordinary imp it's a
    // rarer/tougher version of), despite already hitting harder/tankier
    // than a level-1 imp should. Hp/attackDamage rescaled here using the
    // same per-level growth this file's own wild-goblin-grounds entry
    // shows for the SAME species-family jump (level 1 hp 24 -> level 7 hp
    // 130 is ~1.32x per level; 1.32^2 ≈ 1.75x for a level 1->3 jump),
    // applied on top of the existing rare-vs-ordinary multiplier this
    // entry already had (2x hp, 1.8x attackDamage over the plain imp's 30
    // hp/5 dmg). expReward/goldReward deliberately left as-is, matching
    // that same wild-goblin-grounds precedent (its own level-7 variant
    // reuses the exact same WILD_GOBLIN_EXP_REWARD/goldReward as the
    // level-1 one) — expGainFor's own level-ratio formula (see
    // game.gateway.ts) already scales actual exp payout for a killer's
    // level vs this monster's now-correct level 3, without needing the
    // base reward number itself touched.
    level: 3,
    startingHp: 105,
    expReward: 90,
    attackDamage: 16,
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
    // resemble that level" (a later follow-up ask) — same rescaling
    // methodology rare-imp's own level fix above already used: the
    // hp/attackDamage this entry had before (70/12, implicitly level 1)
    // already encodes its own rare-vs-ordinary multiplier, so that pair
    // is treated as the level-1 baseline and grown by the same ~1.33x-
    // per-level compounding rate wild-skeleton-grounds' own level-1->5
    // jump (32hp -> 100hp) implies, raised to the 6th power for a
    // level 1->7 jump (1.33^6 ≈ 5.53). expReward/goldReward deliberately
    // left as-is, matching wild-goblin-grounds' own precedent (a species'
    // higher-level variant reuses the same base reward numbers — expGainFor's
    // level-ratio formula already scales the actual payout for the
    // killer's level vs this monster's now-correct one).
    id: 'rare-wild-skeleton',
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 1,
    isRare: true,
    respawnDelayMs: 60_000,
    level: 7,
    startingHp: 388,
    expReward: 130,
    attackDamage: 66,
    goldReward: 15,
    carriedItemRolls: [
      ...Array.from({ length: 10 }, () => ({ label: 'superior mana crystal', chance: 1 })),
      { label: 'opal ring', chance: 0.5 },
      { label: 'opal necklace', chance: 0.5 },
    ],
  },
  {
    // Same fix/reasoning as rare-wild-skeleton above, "the rare wild
    // goblin should be level 9" — its own 55/10 hp/attackDamage baseline
    // grown by wild-goblin-grounds' own implied ~1.33x-per-level rate
    // (24hp level 1 -> 130hp level 7), raised to the 8th power for a
    // level 1->9 jump (1.33^8 ≈ 9.79).
    id: 'rare-wild-goblin',
    kind: 'wild goblin',
    monsterClass: 'normal',
    homeMap: 'Grimoak Grounds',
    minSpawnCol: GRIMOAK_GROUNDS_EXTENSION_MIN_COL,
    maxCount: 1,
    isRare: true,
    respawnDelayMs: 60_000,
    level: 9,
    startingHp: 538,
    expReward: 110,
    attackDamage: 98,
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
  // refined later."
  {
    id: 'sunken-crypt-skeleton',
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Sunken Crypt',
    maxCount: 8,
    level: 12,
    startingHp: 180,
    expReward: 150,
    attackDamage: 20,
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
    startingHp: 250,
    expReward: 220,
    attackDamage: 28,
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
    startingHp: 350,
    expReward: 320,
    attackDamage: 38,
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
    startingHp: 500,
    expReward: 450,
    attackDamage: 50,
    goldReward: 30,
    // Phase E's own "aggro radius" ask — notices an approaching
    // player from a few tiles out, not just on actual contact.
    aggroRadiusTiles: 5,
    carriedItemRolls: [
      { label: 'wand of the ashen king', chance: 0.1 },
      { label: 'dragon scale armor', chance: 0.15 },
    ],
  },
];
