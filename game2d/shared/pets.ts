// A player's own companion pet (a later follow-up ask: "add another
// shopkeeper 'Pet Shop'... a player should only be allowed to have 1 pet
// at a time"). A pet is owned by exactly one player, follows/obeys a
// simple command, and levels up from its own exp — same leveling shape
// a player uses (see server/combat/formulas.ts's applyExpGain), just a
// much smaller starting hp pool. Persistence/resurrection ("killed and
// then have to be resurrected by someone in the school") is a stated
// future mechanic, not built yet — a dead pet today just stays dead
// until the player buys a new one is NOT possible (only one at a time),
// so for now a killed pet simply stops acting until a future
// resurrection feature exists.
import type { MapName, MonsterKind, Race } from './constants.js';

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
export const PET_EVOLVED_NAME: Record<PetKind, string> = {
  puppy: 'Dog',
  kitten: 'Cat',
  piglet: 'Boar',
};
export const PET_EVOLUTION_HP_BONUS = 25;
export const PET_EVOLUTION_ATTACK_BONUS = 3;

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
}
