import type { Server, Socket } from 'socket.io';
import type { MapName, Race, Direction, MonsterKind, MonsterClass } from './constants.js';
import type { EquipmentSlot } from './equipment.js';

// Never persisted across sessions (a fresh connection always starts
// 'awake') — matches the text game's own restState, which the same
// heal-percent-per-tick range and sleep/rest/wake commands key off.
export type RestState = 'awake' | 'resting' | 'sleeping';

export interface PlayerSnapshot {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  skills: Record<string, number>;
  inventory: string[];
  equipment: Record<string, string>;
  consumeExp: number;
  restState: RestState;
  // Whether THIS player currently EMITS light (a carried torch) that a
  // nearby ally could benefit from — infravision is deliberately excluded
  // (personal vision, not light emitted into the world); see
  // shared/lighting.ts's emitsLight/hasFullVision.
  hasLight: boolean;
  gold: number;
  // Slime-only (see shared/skills.ts's MIMIC_SKILL/REVERT_SKILL):
  // mimicableRaces accumulates every unique race/monster-kind whose body
  // part this slime has ever consumed; mimicForm is whichever of those
  // (if any) it's currently disguised as — null means its own plain
  // slime appearance. No mechanical effect yet, purely cosmetic.
  mimicableRaces: (Race | MonsterKind)[];
  mimicForm: (Race | MonsterKind) | null;
  // Zombie-only Eat Brains cooldown, in the same world-tick units as
  // WorldTimePayload.tick — lets the client gray the button out instead
  // of letting it be clicked and fail (see main.ts's updateEatBrainsButton).
  eatBrainsReadyAtTick: number;
  // Per-skill cooldowns (currently just Glare — see shared/skills.ts's
  // SKILL_COOLDOWN_MS) as an epoch-ms "ready at" timestamp, keyed by
  // skill name; a skill with no entry here has no cooldown gate at all.
  // Wall-clock, not tick-based, so the client can render a countdown/wipe
  // (item 23) without needing to know the server's own tick counter.
  skillCooldowns: Record<string, number>;
}

// A static (never-moving) map occupant — the "test/dummy" skeleton in the
// Great Plains today; same shape a wandering NPC could reuse later. Has
// the same stats as a real player (see combat/formulas.ts's starting
// values) since it's a real target for the punch/combat system too.
export interface NpcSnapshot {
  id: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  hp: number;
  maxHp: number;
}

// A wild monster — wanders on its own, has no account/login, and is a
// valid punch/combat target like an NPC or another player.
export interface MonsterSnapshot {
  id: string;
  kind: MonsterKind;
  monsterClass: MonsterClass;
  map: MapName;
  row: number;
  col: number;
  level: number;
  hp: number;
  maxHp: number;
  // While alive, whatever it's carrying — the first weapon-slot item (if
  // any) shows as a held-weapon overlay, same as a player's equipped
  // weapon; the rest just ride along until it drops everything on death.
  carriedItems: string[];
}

// Left behind when a monster, the training dummy, or a real player dies.
// Usually just a body part, but some monsters (a wild skeleton with a
// carried weapon) can drop more than one item. Looting (grab-all or one
// at a time) empties the item list but does NOT remove the corpse
// itself — it sticks around (see corpse-manager.service.ts's
// CORPSE_TTL_MS) until its 10-minute TTL expires, or — monster corpses
// only — until it's sacrificed (see the "Sacrifice" loot-modal option).
export interface CorpseSnapshot {
  id: string;
  kind: Race | MonsterKind;
  // The level of whatever died — a monster corpse's sacrifice-for-gold
  // reward is based on this (see game.gateway.ts's handleSacrificeCorpse).
  level: number;
  items: string[];
  map: MapName;
  row: number;
  col: number;
  // Whoever landed the killing blow, if anyone did (a corpse from some
  // future non-combat source could have none) — backs the zombie-only
  // "Eat Brains" option in the loot modal (see main.ts), only offered to
  // the player who actually earned it.
  killedBy?: string;
}

export interface SyncPayload {
  player: PlayerSnapshot;
}

// Broadcast to everyone in a map's room whenever anyone joins, moves
// within it, or leaves — the client's only source of truth for rendering
// other players/NPCs/monsters/corpses (and thus for knowing which tiles
// are occupied).
// A static, never-attackable shop NPC (see server/worlds/vendors.ts) —
// deliberately a separate list from NpcSnapshot, which is a combat
// target.
export interface VendorItem {
  label: string;
  price: number;
}
export interface VendorSnapshot {
  id: string;
  name: string;
  map: MapName;
  row: number;
  col: number;
  items: VendorItem[];
}

export interface MapStatePayload {
  mapName: MapName;
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
  monsters: MonsterSnapshot[];
  corpses: CorpseSnapshot[];
  vendors: VendorSnapshot[];
}

// Broadcast to a map's room whenever a punch actually lands on a target
// (an NPC/monster/other player standing exactly one tile ahead, in the
// direction thrown) — carries enough to update everyone's view of the
// fight (health bars, a combat log line) without waiting for the next
// map:state.
export interface CombatEventPayload {
  attacker: string;
  attackerLevel: number;
  attackerExp: number;
  attackerHp: number;
  attackerMaxHp: number;
  targetKind: 'player' | 'npc' | 'monster';
  target: string;
  targetLabel: string;
  damage: number;
  targetHp: number;
  targetMaxHp: number;
  targetDied: boolean;
  expGained?: number;
  leveledUp?: boolean;
  message: string;
  // Attacker's own weapon-skill growth (punch, or dagger while wielding
  // one), plus the defender's dodge/parry/shield-block growth when their
  // avoidance actually triggered/was attempted — each a standalone line
  // for the combat log, same message shape for every skill.
  growthMessages?: string[];
}

export interface MoveAck {
  ok: boolean;
  player: PlayerSnapshot;
  // Set when ok is false (e.g. walked into the world's edge, or the tile
  // is occupied by another player/NPC) or on a map transition (e.g. "You
  // enter the Labyrinth.") — purely cosmetic, the client doesn't have to
  // show it.
  message?: string;
  // Set specifically when ok is false because the player doesn't have
  // enough movement left to afford a step on their current ground — a
  // dedicated flag (rather than string-matching `message`) so the client
  // can reliably focus the Combat tab and flag it as a "need rest"
  // moment (item 8) instead of treating it like any other blocked move.
  outOfMovement?: boolean;
}

export interface KickedPayload {
  message: string;
}

export interface PunchPayload {
  username: string;
  direction: Direction;
}

export interface LootAck {
  ok: boolean;
  inventory?: string[];
  message?: string;
}

export interface BuyAck {
  ok: boolean;
  inventory?: string[];
  gold?: number;
  message?: string;
}

export interface EatBrainsAck {
  ok: boolean;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  movement?: number;
  maxMovement?: number;
  message?: string;
}

export interface SacrificeAck {
  ok: boolean;
  gold?: number;
  message?: string;
}

export interface UseItemAck {
  ok: boolean;
  action?: 'consumed' | 'equipped' | 'unequipped';
  inventory?: string[];
  equipment?: Record<string, string>;
  consumeExp?: number;
  skills?: Record<string, number>;
  message?: string;
}

// Local (map-scoped) chat — broadcast only to the room for `map`, so a
// player in the Labyrinth never sees a chat line sent from the Great
// Plains, and vice versa.
export interface ChatPayload {
  username: string;
  map: MapName;
  message: string;
}

export interface WhoEntry {
  username: string;
  map: MapName;
  level: number;
}

export interface WhoAck {
  players: WhoEntry[];
}

// A periodic passive-regen tick (see game.gateway.ts's stat-tick timer) —
// deliberately its own lightweight event rather than reusing 'sync',
// since 'sync' also forces the client to reset any in-progress move/punch
// animation, which a purely-passive background regen tick shouldn't do.
export interface StatTickPayload {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  movement: number;
  maxMovement: number;
}

// Broadcast to every connected socket (not just one map's room) whenever
// the shared world clock advances an hour — the client turns this into a
// gradually shifting day/night overlay (see main.ts). `tick` is the same
// globalStatTick counter GameGateway measures Eat Brains/Glare cooldowns
// in, exposed so the client can gray out a still-cooling-down skill
// button rather than just letting the user click it and fail.
export interface WorldTimePayload {
  hour: number;
  tick: number;
}

export interface ServerToClientEvents {
  sync: (data: SyncPayload) => void;
  'session:kicked': (data: KickedPayload) => void;
  'map:state': (data: MapStatePayload) => void;
  punch: (data: PunchPayload) => void;
  combat: (data: CombatEventPayload) => void;
  chat: (data: ChatPayload) => void;
  statTick: (data: StatTickPayload) => void;
  worldTime: (data: WorldTimePayload) => void;
}

export interface ClientToServerEvents {
  move: (direction: Direction, ack: (res: MoveAck) => void) => void;
  // Also resolves combat server-side: if a punch in this direction lands
  // on an NPC/monster/player standing exactly one tile ahead, damage is
  // applied and a 'combat' event is broadcast — no separate "attack"
  // event needed, the direction alone is enough.
  punch: (direction: Direction) => void;
  // Same contact-range shape as punch, but names an explicit learned
  // skill (bone finger strike, glare) instead of always defaulting to
  // punch/dagger — silently ignored if the player hasn't actually learned
  // it. Either way this only ARMS/refreshes a combat session; the actual
  // hit resolves on the next combat tick (see game.gateway.ts's
  // handleUseSkill/combatTick).
  useSkill: (payload: { direction: Direction; skill: string }) => void;
  loot: (corpseId: string, ack: (res: LootAck) => void) => void;
  // Grabs a single item out of a corpse by index (the corpse loot modal's
  // "click one item" path) rather than everything at once — the corpse
  // itself is removed once its last item is taken.
  lootItem: (payload: { corpseId: string; itemIndex: number }, ack: (res: LootAck) => void) => void;
  buyItem: (payload: { vendorId: string; itemLabel: string }, ack: (res: BuyAck) => void) => void;
  // Zombie-only: heals 20% hp/mana/movement, see game.gateway.ts's
  // EAT_BRAINS_COOLDOWN_TICKS for the cooldown this starts.
  eatBrains: (corpseId: string, ack: (res: EatBrainsAck) => void) => void;
  // Monster-corpse-only "sacrifice it to the gods" — see
  // game.gateway.ts's handleSacrificeCorpse for the gold formula.
  sacrificeCorpse: (corpseId: string, ack: (res: SacrificeAck) => void) => void;
  // Clicking an inventory item: the server decides consume vs. equip
  // based on the item itself (see combat/formulas.ts's
  // EQUIPMENT_SLOT_FOR_ITEM) so the client never has to know which items
  // are equippable.
  useItem: (itemIndex: number, ack: (res: UseItemAck) => void) => void;
  // Right-click: always consumes, even if the item is normally
  // equippable — see game.gateway.ts's handleConsumeItem.
  consumeItem: (itemIndex: number, ack: (res: UseItemAck) => void) => void;
  // The Equipment modal's 'x' button (item 15) — moves whatever's in
  // that slot back into the inventory. A no-op ack (still ok: true) if
  // the slot was already empty.
  unequipItem: (slot: EquipmentSlot, ack: (res: UseItemAck) => void) => void;
  // Fire-and-forget, same as punch — the server trims/validates/length-
  // caps and rebroadcasts to the sender's own map room only.
  chat: (message: string) => void;
  who: (ack: (res: WhoAck) => void) => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  level: number;
  exp: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
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
  restState: RestState;
  gold: number;
  mimicableRaces: (Race | MonsterKind)[];
  mimicForm: (Race | MonsterKind) | null;
  // Zombie-only Eat Brains cooldown — a world-tick number (see
  // GameGateway's currentTick/globalStatTick), never persisted (resets on
  // reconnect, same tradeoff as restState).
  eatBrainsReadyAtTick: number;
  // A carried torch's remaining burn time (see GameGateway's
  // TORCH_LIFETIME_MS) — torchLitAt is the epoch-ms it was last equipped,
  // or null while unequipped/not carrying one; neither is persisted
  // (resets to a fresh torch on reconnect, same tradeoff as restState).
  torchRemainingMs: number;
  torchLitAt: number | null;
  // See PlayerSnapshot's own doc comment — same shape, never persisted
  // (resets on reconnect, same tradeoff as restState/torchRemainingMs).
  skillCooldowns: Record<string, number>;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
