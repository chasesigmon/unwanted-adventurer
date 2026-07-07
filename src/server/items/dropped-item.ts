import type { MapName } from '../../shared/constants.js';

// A lootable object left behind at a specific cell — currently only ever
// created by a monster death (see MonsterManagerService.getDeathDrop and
// GameGateway.resolveAttackExchange). Not persisted: like monsters, the
// world's dropped items reset on server restart.
export interface DroppedItem {
  id: string;
  name: string;
  mapName: MapName;
  row: number;
  col: number;
  // The skill "consume <item>" has a chance to teach, if any — see
  // players/skills.ts and GameGateway.handleConsume.
  skillReward?: string;
}
