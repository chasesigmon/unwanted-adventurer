import type { Gender, HairColor, MapName, MonsterKind, Race, SkinTone, SpecializationPath } from '../../shared/constants.js';
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
  mv: number;
  maxMv: number;
  bp: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  restState: RestState;
  gold: number;
  // Item 17: a single shared balance across Kortho's and Floro's own Bank
  // vendors — see game.gateway.ts's handleDepositGold/handleWithdrawGold.
  bankedGold: number;
  mimicableRaces: (Race | MonsterKind)[];
  mimicForm: (Race | MonsterKind) | null;
  eatBrainsReadyAtTick: number;
  skillCooldowns: Record<string, number>;
  deathCount: number;
  // Stacks across levels if never spent (a later follow-up ask) — see
  // game.gateway.ts's handleAllocateStatPoint.
  statPointsAvailable: number;
  practicePointsAvailable: number;
  // The lucem spell's toggle (see shared/types.ts's PlayerSnapshot) —
  // needed here too so getMapState's hasLight calc (see
  // world-manager.service.ts) can factor it in for OTHER players' benefit.
  wandLit: boolean;
  // Same idea, for celeritas's own toggle (see shared/types.ts's
  // PlayerSnapshot doc comment) — no OTHER player benefits from this one
  // (it's a personal move-speed buff, not emitted light), but it's still
  // part of PlayerSnapshot's shape, so it lives here too.
  celeritasActive: boolean;
  // Scutum's own toggle (a later follow-up ask) — needed here too since
  // its blue-sphere visual has to be visible to every OTHER nearby player
  // as well, not just the caster's own Affects modal.
  scutumActive: boolean;
  // Barrier's own toggle (a later follow-up ask) — same "other nearby
  // players need to see the dome too" reasoning as scutumActive above.
  barrierActive: boolean;
  // Wisp transformation's own toggle (a later follow-up ask) — same
  // "other nearby players need to see the sprite swap too" reasoning as
  // scutumActive/barrierActive above.
  wispActive: boolean;
  // Item 11's Transform spell — same "other nearby players need to see
  // the sprite swap too" reasoning as wispActive above; kind rides along
  // too since other players need to know WHICH beast to render, not just
  // that a transform is active (see world-manager.service.ts's own
  // getMapState builder).
  beastTransformActive: boolean;
  beastTransformKind: MonsterKind | null;
  // Flight's own toggle (a later follow-up ask) — same "other nearby
  // players need to see the floating visual/wind trail too" reasoning as
  // wispActive above.
  flightActive: boolean;
  // Boats (a later follow-up ask) — needed here too so a follower's own
  // tickAll (see PetManagerService/AnimatedMonsterManagerService) can read
  // its owner's current boat state without a separate lookup, and so
  // getMapState shows OTHER nearby players their boat sprite too.
  inBoat: 'small' | 'large' | null;
  // A later follow-up ask (item 4's dummy players "of different
  // specializations" surfaced this gap): this was never threaded through
  // to OTHER players' clients at all before — see PlayerSnapshot's own
  // specialization field, previously populated only in the OWNING
  // client's own snapshotFor, never in getMapState's broadcast copy.
  specialization: SpecializationPath | null;
  // Invisibility's own toggle (a later follow-up ask) — needed here too
  // so getMapState knows which OTHER players to skip rendering entirely
  // client-side (the opposite of scutum/barrier/wisp's own "show a
  // visible effect" reasoning).
  invisibleActive: boolean;
  canteenDrinks: number;
  // The /dance command (a later follow-up ask) — needed here too so
  // getMapState's player list shows every OTHER nearby player dancing,
  // not just the dancer's own client.
  dancing: boolean;
}

export type MoveResult =
  | { ok: false; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: false; mapName: MapName; row: number; col: number }
  | { ok: true; transitioned: true; fromMap: MapName; mapName: MapName; row: number; col: number };
