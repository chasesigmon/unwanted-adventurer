import type { MapName } from '../../shared/constants.js';

// A skill "consume <item>" has a chance to teach, and how likely that is —
// nested together (rather than two parallel optional fields) since one
// never makes sense without the other.
export interface ItemSkillReward {
  reward: string;
  chance: number;
}

// A lootable object left behind at a specific cell — currently only ever
// created by a monster death (see MonsterManagerService.getDeathDrops and
// GameGateway.resolveAttackExchange). Not persisted: like monsters, the
// world's dropped items reset on server restart.
export interface DroppedItem {
  id: string;
  name: string;
  mapName: MapName;
  row: number;
  col: number;
  skill?: ItemSkillReward;
}
