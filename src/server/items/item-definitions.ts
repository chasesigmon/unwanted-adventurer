import {
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  BODY_PART_SKILL_STARTING_PERCENT,
  lesserRaceResistanceName,
} from '../players/skills.js';
import { ALL_RACES, type Race } from '../../shared/constants.js';
import type { ItemSkillReward } from './dropped-item.js';

// Static lookup of what a known item name teaches when consumed, if
// anything — the single source of truth for this, consulted both when a
// monster drops one (MonsterManagerService.getDeathDrops) and when a
// player drops one back onto the ground from their inventory
// (GameGateway.handleDrop). Player inventory only stores item names
// (Player.inventory: string[]), not full item data, so this is also what
// lets a dropped-from-inventory item regain its original skill properties
// instead of becoming an inert copy.
//
// "bone dagger" used to also teach a skill here ("bone finger dagger
// strike", a placeholder with no mechanical effect) — retired now that
// wielding a dagger has a real, always-available effect via the goblin
// starting "dagger" skill (see GameGateway.weaponAttack), which makes a
// second, redundant skill from consuming one pointless.
const BODY_PART_SKILL: ItemSkillReward = { reward: LESSER_UNDEAD_MONSTER_RESISTANCE, chance: 0.2 };

const ITEM_DEFINITIONS: Record<string, ItemSkillReward> = {
  leg: BODY_PART_SKILL,
  arm: BODY_PART_SKILL,
  hand: BODY_PART_SKILL,
  skull: BODY_PART_SKILL,
  rib: BODY_PART_SKILL,
};

// A wild goblin (a "normal"-classified monster, see monsters/monster.ts's
// MonsterClass) drops its body parts named "wild goblin <part>" rather
// than the bare names above — a bare "leg" always means undead resistance
// via ITEM_DEFINITIONS, so a differently-classified monster's body part
// needs its own name to teach a different skill (see
// wildGoblinBodyPartSkill below), the same reasoning as the player-race
// "<race> <part>" convention (see raceBodyPartSkill).
const WILD_GOBLIN_BODY_PART_SKILL: ItemSkillReward = { reward: LESSER_NORMAL_MONSTER_RESISTANCE, chance: 0.1 };
const WILD_GOBLIN_BODY_PART_PREFIX = 'wild goblin';

// The canonical "these are body parts" list — used by GameGateway
// .resolveAttackExchange/.handlePlayerLikeDeath to route death drops: body
// parts always land loose on the ground, while anything else (e.g. "bone
// dagger") goes into a corpse container instead. Also the suffix checked
// for a player-corpse body part's "<race> <part>" name (see isBodyPart).
const BODY_PARTS = ['leg', 'arm', 'hand', 'skull', 'rib'];

// A player corpse's dropped body part (see GameGateway.handlePlayerLikeDeath)
// picks one of these at random, same pool a wild skeleton draws from.
export function randomBodyPartName(): string {
  return BODY_PARTS[Math.floor(Math.random() * BODY_PARTS.length)] ?? 'bone';
}

export function isBodyPart(name: string): boolean {
  const lower = name.toLowerCase();
  if (BODY_PARTS.includes(lower)) return true;
  const spaceIdx = lower.lastIndexOf(' ');
  return spaceIdx !== -1 && BODY_PARTS.includes(lower.slice(spaceIdx + 1));
}

// A body part dropped from a *player's* corpse is named "<race> <part>"
// (e.g. "goblin leg" — see GameGateway.handlePlayerLikeDeath), so the same
// item name can teach a different skill depending on context, without
// inventory needing to store anything beyond the bare name. Recognized
// dynamically here rather than listed item-by-item, since it's every
// Race x body-part combination.
function raceBodyPartSkill(name: string): ItemSkillReward | undefined {
  const lower = name.toLowerCase();
  const spaceIdx = lower.lastIndexOf(' ');
  if (spaceIdx === -1) return undefined;
  const racePart = lower.slice(0, spaceIdx);
  const bodyPart = lower.slice(spaceIdx + 1);
  if (!BODY_PARTS.includes(bodyPart) || !ALL_RACES.includes(racePart as Race)) return undefined;
  return { reward: lesserRaceResistanceName(racePart as Race), chance: 0.1 };
}

// "wild goblin leg"/"wild goblin arm"/etc — see WILD_GOBLIN_BODY_PART_SKILL.
function wildGoblinBodyPartSkill(name: string): ItemSkillReward | undefined {
  const lower = name.toLowerCase();
  if (!lower.startsWith(`${WILD_GOBLIN_BODY_PART_PREFIX} `)) return undefined;
  const bodyPart = lower.slice(WILD_GOBLIN_BODY_PART_PREFIX.length + 1);
  return BODY_PARTS.includes(bodyPart) ? WILD_GOBLIN_BODY_PART_SKILL : undefined;
}

export function skillForItemName(name: string): ItemSkillReward | undefined {
  return ITEM_DEFINITIONS[name.toLowerCase()] ?? raceBodyPartSkill(name) ?? wildGoblinBodyPartSkill(name);
}

// Every slot a player can equip something into. Body parts come in pairs
// (ear/forearm/ring/shin) with distinct left/right slots; everything else
// is a single slot. "for now" per the request — only 'weapon' actually has
// an item mapped to it below, the rest exist so future armor/rings/
// necklaces/earrings have somewhere to go without another schema change.
export type EquipmentSlot =
  | 'head'
  | 'leftEar'
  | 'rightEar'
  | 'torso'
  | 'leftForearm'
  | 'rightForearm'
  | 'shield'
  | 'weapon'
  | 'leftRing'
  | 'rightRing'
  | 'necklace'
  | 'leftShin'
  | 'rightShin'
  | 'boots';

// Broad item family — currently only used for the "weapon" case (which
// wires up an attack bonus/verb below), but named generically since
// armor/ring/necklace/earring items will need the same shape later.
export type ItemCategory = 'weapon' | 'armor' | 'ring' | 'necklace' | 'earring';

export interface EquipmentDefinition {
  slot: EquipmentSlot;
  category: ItemCategory;
  // Weapon-only, so far: added to PLAYER_ATTACK_DAMAGE, and swaps the
  // attack line's verb ("You hit" -> "You stab") while equipped — see
  // GameGateway.resolveAttackExchange.
  attackBonus?: number;
  attackVerb?: string;
}

const BONE_DAGGER_EQUIPMENT: EquipmentDefinition = {
  slot: 'weapon',
  category: 'weapon',
  attackBonus: 2,
  attackVerb: 'stab',
};

const EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  'bone dagger': BONE_DAGGER_EQUIPMENT,
};

export function equipmentForItemName(name: string): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS[name.toLowerCase()];
}

// A separate, broader classification axis from EquipmentDefinition
// .category above (which only describes equipment-slot sub-types, and
// only applies to the handful of items that are actually equippable):
// this just tags "this is a plain item object", as opposed to some other
// future kind of game object (currency, quest flags, etc). Not mutually
// exclusive with being a 'weapon' — "bone dagger" is both.
export type ItemKind = 'item';

const ITEM_KINDS: Record<string, ItemKind> = {
  leg: 'item',
  arm: 'item',
  hand: 'item',
  skull: 'item',
  rib: 'item',
  'bone dagger': 'item',
};

export function itemKindFor(name: string): ItemKind | undefined {
  if (ITEM_KINDS[name.toLowerCase()]) return 'item';
  return isBodyPart(name) ? 'item' : undefined;
}

// Flavor text for "examine <item>" — every known item name should have
// one; a player-corpse "<race> <part>" name (see isBodyPart) falls back
// to a generic race-flavored line instead of a fixed entry per race.
const ITEM_DESCRIPTIONS: Record<string, string> = {
  leg: 'A gaunt, yellowed leg bone, still faintly cold to the touch.',
  arm: 'A brittle arm bone, cracked in places from old wounds.',
  hand: 'A skeletal hand, fingers curled as if still gripping something.',
  skull: 'A weathered skull, jaw hanging slightly open in a silent scream.',
  rib: 'A single curved rib bone, thin and surprisingly light.',
  'bone dagger':
    'A crude dagger carved from bone and sharpened along one edge. Wielding it lets you stab rather than merely hit.',
};

export function itemDescriptionFor(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (ITEM_DESCRIPTIONS[lower]) return ITEM_DESCRIPTIONS[lower];
  if (lower.startsWith(`${WILD_GOBLIN_BODY_PART_PREFIX} `)) {
    const part = lower.slice(WILD_GOBLIN_BODY_PART_PREFIX.length + 1);
    if (BODY_PARTS.includes(part)) {
      return `A ${part} bone, unmistakably wild goblin in origin.`;
    }
  }
  const spaceIdx = lower.lastIndexOf(' ');
  if (spaceIdx !== -1) {
    const race = lower.slice(0, spaceIdx);
    const part = lower.slice(spaceIdx + 1);
    if (ALL_RACES.includes(race as Race) && BODY_PARTS.includes(part)) {
      return `A ${part} bone, unmistakably ${race} in origin.`;
    }
  }
  return undefined;
}

// Iteration order for "equip"/"equipment" typed bare — head to toe,
// matching the order the request enumerated (and EquipmentSlot is
// declared in).
export const EQUIPMENT_SLOT_ORDER: EquipmentSlot[] = [
  'head',
  'leftEar',
  'rightEar',
  'torso',
  'leftForearm',
  'rightForearm',
  'shield',
  'weapon',
  'leftRing',
  'rightRing',
  'necklace',
  'leftShin',
  'rightShin',
  'boots',
];

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  head: 'Head',
  leftEar: 'Left Ear',
  rightEar: 'Right Ear',
  torso: 'Torso',
  leftForearm: 'Left Forearm',
  rightForearm: 'Right Forearm',
  shield: 'Shield',
  weapon: 'Weapon',
  leftRing: 'Left Ring',
  rightRing: 'Right Ring',
  necklace: 'Necklace',
  leftShin: 'Left Shin',
  rightShin: 'Right Shin',
  boots: 'Boots',
};

// Slimes have no limbs, ears, fingers, or shape to speak of — a helmet
// and a torso wrap are the only things that make sense on one, so every
// other slot (including "weapon" — a slime can't wield anything) is off
// limits. Every other race can use the full slot list. See
// GameGateway.handleEquip/handleEquipmentView/handleExamine.
export function allowedSlotsForRace(race: Race): EquipmentSlot[] {
  if (race === 'slime') return ['head', 'torso'];
  return EQUIPMENT_SLOT_ORDER;
}
