import type { MapName, Race } from '../../shared/constants.js';
import type { Attributes } from '../combat/formulas.js';

export interface Location {
  mapName: MapName;
  row: number;
  col: number;
}

// Everything WorldManagerService needs to know about a connected player
// besides their raw position — race for rendering, and the combat stats
// (attributes/level/hp/skills) needed to resolve a contact punch against
// them without a separate lookup.
export interface PlayerState extends Location, Attributes {
  race: Race;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  consumeExp: number;
}

export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
