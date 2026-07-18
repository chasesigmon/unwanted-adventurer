// A player's own companion pet (a later follow-up ask: "add another
// shopkeeper 'Pet Shop'... a player should only be allowed to have 1 pet
// at a time"). A pet is owned by exactly one player, follows/obeys a
// simple command, and levels up from its own exp — same leveling shape
// a player uses (see server/combat/formulas.ts's applyExpGain), just a
// much smaller starting hp pool. A later follow-up ask resolved this
// file's own former "persistence/resurrection... future mechanic, not
// built yet" note: a dead pet now becomes a real, lootable/sacrificable
// corpse (see PetCorpseSnapshot below and server/pets/pet-corpse-manager.
// service.ts) instead of sitting inert forever, and buying a NEW pet no
// longer requires the old one to have never existed — see
// PetManagerService's own hasPet/buy, which now only check `alive`.
import type { MapName, MonsterKind, Race } from './constants.js';
import { isWaterBlocked } from './maps.js';

export const PET_KINDS = ['puppy', 'kitten', 'piglet'] as const;
export type PetKind = (typeof PET_KINDS)[number];

export const PET_KIND_LABELS: Record<PetKind, string> = {
  puppy: 'Puppy',
  kitten: 'Kitten',
  piglet: 'Piglet',
};

// "Commandable like stay by side or attack or sleep" — 'follow' is the
// default the moment a pet is purchased ("should follow the player").
export const PET_COMMANDS = ['follow', 'stay', 'sleep', 'attack'] as const;
export type PetCommand = (typeof PET_COMMANDS)[number];

export const PET_STARTING_HP = 50;
export const PET_PRICE = 15;

// A follow-up ask's 'z' hotkey ("send the follower to auto attack the
// target") gave the 'attack' command real teeth — flat, same for every
// pet kind (no per-kind attack stat exists), same "simplified, no dodge/
// counter-attack" shape the wand's own ranged auto-attack already uses.
export const PET_ATTACK_DAMAGE = 5;

// A later follow-up bug fix: "as soon as a follower comes into contact
// with the enemy they should make a hit" — a follower's own attack
// cooldown, shared with game.gateway.ts's own player-side
// ATTACK_COOLDOWN_MS (same ~3s cadence every other attack in this game
// already uses) so contact resolves the instant it's actually earned
// (checked on the fast per-tile movement tick, see PetManagerService/
// AnimatedMonsterManagerService's own checkContacts) without changing how
// often a follower actually lands a hit.
export const FOLLOWER_ATTACK_COOLDOWN_MS = 3000;

// Phase C's own "sleep/wake" ask gave 'sleep' a real distinguishing
// effect (until now it was functionally identical to 'stay') — modeled
// on the player's own /sleep bonus (see game.gateway.ts's applyStatTick/
// HEAL_PERCENT_RANGE): a modest baseline regen while follow/stay/attack
// (pets never regenerated at ALL before this), a bigger one while
// actually asleep. Pets only — animated monsters explicitly have no hp
// regeneration at all (see AnimatedMonsterSnapshot's own doc comment
// below); their own 'sleep' stays a plain do-nothing state like 'stay'.
export const PET_AWAKE_HEAL_PERCENT = 6;
export const PET_SLEEP_HEAL_PERCENT = 14;

// Phase C's "pet evolution" ask — this project explicitly removed the
// text-game's old consume-to-evolve mechanic ("there is no evolution
// through consuming in the wizard world," see game.gateway.ts), so this
// is level-based instead: a one-time name/stat upgrade the moment a pet
// reaches PET_EVOLUTION_LEVEL, reusing its EXISTING spritesheet/kind (no
// new art) rather than becoming a different creature outright — the same
// "arts-generation is its own large task" scope-down this session already
// made once for the new race sprites.
export const PET_EVOLUTION_LEVEL = 5;
// A later follow-up ask: "Pet's should be able to level up, max level
// 20" — its own separate, lower cap than the player's own MAX_PLAYER_LEVEL
// (see PetManagerService.grantExp, which passes this into the shared
// applyExpGain curve instead of the player's default).
export const PET_MAX_LEVEL = 20;
export const PET_EVOLVED_NAME: Record<PetKind, string> = {
  puppy: 'Dog',
  kitten: 'Cat',
  piglet: 'Boar',
};
export const PET_EVOLUTION_HP_BONUS = 25;
export const PET_EVOLUTION_ATTACK_BONUS = 3;

// A later follow-up ask: "pets sold in Bramwick... classified as 'small'
// when puppy/kitten/piglet, 'medium' once evolved" — feeds the small
// raft/canoe's own "small or medium sized pet" capacity check (see
// shared/boats.ts); an animated monster/summon has no size tier at all,
// it's simply never eligible for the canoe regardless of size (see
// boats.ts's own doc comment).
export const FOLLOWER_SIZES = ['small', 'medium'] as const;
export type FollowerSize = (typeof FOLLOWER_SIZES)[number];

// Phase C's own "give/equip UI" ask — a follower can now hold items given
// to it (see game.gateway.ts's handleGiveFollowerItem/handleTakeFollowerItem)
// and equip a weapon/torso-armor item out of its own inventory (see
// handleEquipFollowerItem/handleUnequipFollowerItem). Restricted to just
// those 2 slots (out of shared/equipment.ts's full 12) — nothing else
// (rings, jewelry, boots, ...) makes sense on a pet/animated monster, and
// only a weapon actually does anything today (see FOLLOWER_WEAPON_DAMAGE_BONUS
// below) — an equipped torso-armor item is stored/displayed but has no
// live effect, since no monster in this game currently damages a
// follower at all (see resolveFollowerContact's own doc comment).
export const FOLLOWER_EQUIPMENT_SLOTS = ['weapon', 'torso'] as const;
export type FollowerEquipmentSlot = (typeof FOLLOWER_EQUIPMENT_SLOTS)[number];
export const FOLLOWER_WEAPON_DAMAGE_BONUS = 4;

export interface PetSnapshot {
  id: string;
  ownerUsername: string;
  kind: PetKind;
  name: string;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  // Set once, the moment this pet evolves (see PET_EVOLUTION_LEVEL) — a
  // flat bonus on top of PET_ATTACK_DAMAGE, undefined/0 until then.
  attackDamageBonus?: number;
  // 'small' until PET_EVOLUTION_LEVEL, 'medium' from the same moment
  // attackDamageBonus first gets set (see PetManagerService.grantExp) —
  // see FollowerSize's own doc comment above.
  size: FollowerSize;
  map: MapName;
  row: number;
  col: number;
  command: PetCommand;
  // Which live target (a monster or another player) this pet is
  // approaching/attacking — set together with command==='attack' (see
  // game.gateway.ts's handleCommandFollowerAttack), cleared whenever the
  // command changes away from 'attack' or the target's gone.
  attackTargetKind?: 'monster' | 'player';
  attackTargetId?: string;
  // Phase C's "give/equip" ask — see FOLLOWER_EQUIPMENT_SLOTS above.
  inventory: string[];
  equipment: Partial<Record<FollowerEquipmentSlot, string>>;
  // False once its hp hits 0 — see this file's own doc comment on
  // resurrection being a future mechanic.
  alive: boolean;
}

// The Necromancer's own animate dead spell (a later follow-up ask) —
// a raised monster corpse, controllable the same PET_COMMANDS way a
// purchased pet is. Deliberately its own type/manager rather than a
// PetSnapshot variant — a player can own a real pet AND one or two
// animated monsters at once (see shared/skills.ts's
// animatedMonsterCapFor), so the strict "one pet per owner" keying
// PetManagerService relies on doesn't fit here.
export interface AnimatedMonsterSnapshot {
  id: string;
  ownerUsername: string;
  // Usually a real MonsterKind (animate dead/monster summons/demon imp).
  // The Illusionist's own "create duplicate" (a later follow-up ask)
  // instead stores the caster's own Race here, so it renders as a copy
  // of the player's own sprite — characterSprites.ts's SpriteKind (client-
  // only) already spans both MonsterKind and Race, so no client-side
  // rendering change is needed, just this widened shared type. A human
  // caster's duplicate falls back to the same generic
  // 'human-male-white-brown' placeholder look the corpse system already
  // uses for a human race with no other death-system entry.
  monsterKind: MonsterKind | Race;
  name: string;
  hp: number;
  maxHp: number;
  attackDamage: number;
  map: MapName;
  row: number;
  col: number;
  command: PetCommand;
  // See PetSnapshot's own doc comment on these two — same shape, same
  // 'z' hotkey.
  attackTargetKind?: 'monster' | 'player';
  attackTargetId?: string;
  // Phase C's "give/equip" ask — see FOLLOWER_EQUIPMENT_SLOTS above.
  inventory: string[];
  equipment: Partial<Record<FollowerEquipmentSlot, string>>;
  // "Lasts... until it is killed" — an animated monster has no hp
  // regeneration and no resurrection path at all, unlike a pet. Phase C's
  // "sleep/wake" ask gave pets a real regen-while-sleeping bonus (see
  // PET_AWAKE_HEAL_PERCENT/PET_SLEEP_HEAL_PERCENT above) but deliberately
  // left this alone — 'sleep' stays a plain do-nothing state here, same
  // as 'stay', preserving the existing no-regen design.
  alive: boolean;
  // A later follow-up ask: "when the necromancer animates a corpse, it
  // should reflect what they were before... if animating a rare wild
  // goblin then the animated dead should have the title Animated rare
  // wild goblin and should be the same size" — carried over from the
  // source corpse's own CorpseSnapshot.isRare (see game.gateway.ts's
  // handleCastAnimateDead), drives both the display name and WorldScene's
  // own bigger-sprite-scale rendering, same as a live rare monster.
  isRare?: boolean;
}

// A later follow-up ask: "the corpses of pets should be selectable and
// should open a modal so that the player can grab any items or equipment
// the pet had and the pet should be sacrificable. Only the player
// themself should be able to sacrifice their own pet's corpse." A real,
// separate object (see server/pets/pet-corpse-manager.service.ts) rather
// than reusing shared/types.ts's own CorpseSnapshot (that one's `kind` is
// typed Race | MonsterKind and its rendering/sacrifice/eat-brains
// conventions are all built around a wild-monster or player death,
// neither of which a pet's own kind/ownership rules fit). "Summons/
// animate dead should not get corpses" is unaffected — that's already
// true today (see AnimatedMonsterManagerService.applyDamage, which
// removes a dead one from its own array outright, no corpse of any kind).
export interface PetCorpseSnapshot {
  id: string;
  ownerUsername: string;
  name: string;
  kind: PetKind;
  // The pet's own level at the moment it died — same "sacrifice reward
  // scales with level" convention every other sacrificable corpse in
  // this game already uses (see game.gateway.ts's handleSacrificeCorpse/
  // PET_CORPSE_SACRIFICE_GOLD_PER_LEVEL below), captured here since the
  // pet's own live record may already be gone by the time this corpse
  // gets sacrificed (its owner could have bought a replacement pet).
  level: number;
  map: MapName;
  row: number;
  col: number;
  items: string[];
}

// Same TTL every OTHER corpse in this game already uses (see
// server/worlds/corpse-manager.service.ts's CORPSE_TTL_MS) — no reason
// for a pet's own corpse to linger longer or shorter.
export const PET_CORPSE_TTL_MS = 10 * 60 * 1000;

// A pet corpse's own sacrifice reward — same per-level gold formula
// every other sacrificable corpse uses (see game.gateway.ts's
// SACRIFICE_GOLD_PER_LEVEL), reusing the pet's own level rather than
// inventing a separate figure.
export const PET_CORPSE_SACRIFICE_GOLD_PER_LEVEL = 3;

// A later follow-up ask: "pets/animated dead/summons cannot travel over
// water and instead have to navigate around naturally like a player
// would" — shared by PetManagerService.tickAll and
// AnimatedMonsterManagerService.tickAll (both do a greedy single-axis
// step toward a follow/attack target, no real pathfinding). Tries the
// axis with the larger remaining distance first, same as before; if that
// candidate tile is water and `canCrossWater` is false, falls back to
// the OTHER axis instead of just standing still — a light "walk around
// the edge" approximation, not a real pathfind, but enough for a
// follower to route around a lake/moat rather than stopping dead at its
// shore. Returns undefined if no step is currently possible (both axes
// blocked, or already adjacent). `canCrossWater` is true while the owner
// is flying (a later follow-up ask: "if a player successfully casts
// flight... their pets/animated dead/summons have flight as well") or
// riding a boat that's large enough to carry this particular follower
// kind (see shared/boats.ts) — callers compute that flag themselves from
// the owner's own PlayerState, since neither manager here knows about
// flight/boats directly.
export function computeFollowerStep(
  current: { row: number; col: number },
  target: { row: number; col: number },
  mapName: MapName,
  canCrossWater: boolean
): { row: number; col: number } | undefined {
  const dRow = target.row - current.row;
  const dCol = target.col - current.col;
  if (Math.abs(dRow) + Math.abs(dCol) <= 1) return undefined;

  const tryStep = (stepRow: number, stepCol: number): { row: number; col: number } | undefined => {
    if (stepRow === 0 && stepCol === 0) return undefined;
    const candidate = { row: current.row + stepRow, col: current.col + stepCol };
    if (!canCrossWater && isWaterBlocked(mapName, candidate.row, candidate.col)) return undefined;
    return candidate;
  };

  const preferRow = Math.abs(dRow) >= Math.abs(dCol);
  const primary = preferRow ? tryStep(Math.sign(dRow), 0) : tryStep(0, Math.sign(dCol));
  if (primary) return primary;
  return preferRow ? tryStep(0, Math.sign(dCol)) : tryStep(Math.sign(dRow), 0);
}
