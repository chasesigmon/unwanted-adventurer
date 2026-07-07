import { LESSER_UNDEAD_RESISTANCE, BONE_FINGER_DAGGER_STRIKE } from '../players/skills.js';
import type { ItemSkillReward } from './dropped-item.js';

// Static lookup of what a known item name teaches when consumed, if
// anything — the single source of truth for this, consulted both when a
// monster drops one (MonsterManagerService.getDeathDrops) and when a
// player drops one back onto the ground from their inventory
// (GameGateway.handleDrop). Player inventory only stores item names
// (Player.inventory: string[]), not full item data, so this is also what
// lets a dropped-from-inventory item regain its original skill properties
// instead of becoming an inert copy.
const BODY_PART_SKILL: ItemSkillReward = { reward: LESSER_UNDEAD_RESISTANCE, chance: 0.2 };
const BONE_DAGGER_SKILL: ItemSkillReward = { reward: BONE_FINGER_DAGGER_STRIKE, chance: 0.05 };

const ITEM_DEFINITIONS: Record<string, ItemSkillReward> = {
  leg: BODY_PART_SKILL,
  arm: BODY_PART_SKILL,
  hand: BODY_PART_SKILL,
  skull: BODY_PART_SKILL,
  rib: BODY_PART_SKILL,
  'bone dagger': BONE_DAGGER_SKILL,
};

export function skillForItemName(name: string): ItemSkillReward | undefined {
  return ITEM_DEFINITIONS[name.toLowerCase()];
}
