import type { Gender, HairColor, MapName, MonsterKind, Race, SkinTone } from '../../shared/constants.js';
import type { RestState } from '../../shared/types.js';
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
  gender: Gender | null;
  hairColor: HairColor | null;
  skinTone: SkinTone | null;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  consumeExp: number;
  restState: RestState;
  gold: number;
  mimicableRaces: (Race | MonsterKind)[];
  mimicForm: (Race | MonsterKind) | null;
  eatBrainsReadyAtTick: number;
  skillCooldowns: Record<string, number>;
  deathCount: number;
  // The lucem spell's toggle (see shared/types.ts's PlayerSnapshot) —
  // needed here too so getMapState's hasLight calc (see
  // world-manager.service.ts) can factor it in for OTHER players' benefit.
  wandLit: boolean;
  // Same idea, for celeritas's own toggle (see shared/types.ts's
  // PlayerSnapshot doc comment) — no OTHER player benefits from this one
  // (it's a personal move-speed buff, not emitted light), but it's still
  // part of PlayerSnapshot's shape, so it lives here too.
  celeritasActive: boolean;
  canteenDrinks: number;
}

export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
