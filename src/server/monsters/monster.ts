import type { MapName } from '../../shared/constants.js';

export type MonsterKind = 'skeleton';

export interface Monster {
  id: string;
  kind: MonsterKind;
  hp: number;
  mana: number;
  movement: number;
  mapName: MapName;
  row: number;
  col: number;
}
