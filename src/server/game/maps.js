import { GameMap } from './GameMap.js';
import { MAP_SIZES } from '../../shared/constants.js';

const labyrinth = new GameMap({
  name: 'Labyrinth',
  ...MAP_SIZES.Labyrinth,
  exits: [{ row: 14, col: 7, toMap: 'World', toRow: 0, toCol: 10 }],
});

const world = new GameMap({
  name: 'World',
  ...MAP_SIZES.World,
  exits: [{ row: 0, col: 10, toMap: 'Labyrinth', toRow: 14, toCol: 7 }],
});

export const MAPS = new Map([
  [labyrinth.name, labyrinth],
  [world.name, world],
]);
