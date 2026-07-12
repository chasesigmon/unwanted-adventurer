import type { MapName, MonsterKind, MonsterClass } from '../../shared/constants.js';
import type { CombatantStats } from '../combat/formulas.js';
import { WILD_GOBLIN_EXP_REWARD, WILD_SKELETON_EXP_REWARD } from '../combat/formulas.js';
import { PUNCH_SKILL, DAGGER_SKILL } from '../../shared/skills.js';

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
  // Stupefaciunt (a later follow-up ask) — a combat-tick number; while
  // currentTick is below this, the monster can't move or act at all (see
  // MonsterManagerService.isStunned/stun). Undefined (the common case)
  // means "not currently stunned."
  stunUntilTick?: number;
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
  carriedItemRolls?: CarriedItemRoll[];
  // Present only for a species that paces back and forth near its own
  // spawn point instead of roaming its whole home map at random (a
  // follow-up ask, imps only, see Monster.patrolAxis/patrolDirection) —
  // how many tiles either side of its spawn point it's willing to walk.
  patrolRangeTiles?: number;
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
  },
  {
    kind: 'wild skeleton',
    monsterClass: 'undead',
    homeMap: 'Labyrinth',
    maxCount: 10,
    // Same reasoning as wild goblin above — bumped from 20.
    startingHp: 32,
    expReward: WILD_SKELETON_EXP_REWARD,
    carriedItemRolls: [
      { label: 'bone dagger', chance: 0.3 },
      { label: 'bone shield', chance: 0.2 },
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
    expReward: 4,
    // Paces back and forth within 3 tiles of wherever it spawned (a
    // follow-up ask), rather than roaming the whole map the way a wild
    // goblin/skeleton does — see MonsterManagerService.stepPatrol.
    patrolRangeTiles: 3,
  },
];
