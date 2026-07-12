import type { Server, Socket } from 'socket.io';
import type { Gender, HairColor, MapName, Race, SkinTone, Direction, MonsterKind, MonsterClass } from './constants.js';
import type { EquipmentSlot } from './equipment.js';

// Never persisted across sessions (a fresh connection always starts
// 'awake') — matches the text game's own restState, which the same
// heal-percent-per-tick range and sleep/rest/wake commands key off.
export type RestState = 'awake' | 'resting' | 'sleeping';

export interface PlayerSnapshot {
  username: string;
  race: Race;
  // Human-only appearance (item 4) — null for every other race.
  gender: Gender | null;
  hairColor: HairColor | null;
  skinTone: SkinTone | null;
  map: MapName;
  row: number;
  col: number;
  level: number;
  exp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  // Starts at 1 like every other attribute — no mechanical effect yet,
  // reserved for future use (see server/combat/formulas.ts's Attributes).
  luck: number;
  // How many drinks of water remain in the player's canteen, 0-
  // CANTEEN_CAPACITY (see shared/items.ts) — refilled by irrigo, drained
  // by drink, dumped to 0 by pour.
  canteenDrinks: number;
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
  // Whether the quick movement spell is currently active for THIS player
  // (a follow-up ask) — same "wand toggle" shape as wandLit below, boosts
  // their own move speed by ~10% while on (see WorldScene's
  // effectiveMoveCooldownMs); auto-expires after spellDurationMs, same as
  // lucem.
  quickMovementActive: boolean;
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
  // Server-computed, not stored — see combat/formulas.ts's armorClassFor
  // (base 10 + a small dexterity nudge + a bone shield's own +5 while
  // equipped). Shown on the character sheet purely for transparency;
  // damage reduction itself is computed fresh per-hit server-side.
  armorClass: number;
  // Condeath tracking (item 23) — every death, from any cause, counts
  // toward CONDEATH_LIMIT (65); see game.gateway.ts's applyCondeathPenalty.
  deathCount: number;
  // Whether THIS player's own wand is currently lit (the lucem spell's
  // toggle — see game.gateway.ts's handleLucemCommand) — never persisted
  // (resets to unlit on reconnect, same tradeoff as restState/torchLitAt).
  // Distinct from hasLight below: this is checked for the LOCAL player's
  // own vision (see WorldScene's localLightRadiusTiles); hasLight is what
  // OTHER nearby players see.
  wandLit: boolean;
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
  // Randomized appearance (item 13, phase 1) — every shopkeeper is
  // randomly male/female and gets its own skin-tone tint applied over the
  // shared shopkeeper spritesheet (see main.ts's rendering). A coarse
  // first pass, not true per-part hair/eye/clothing customization, which
  // would need real layered art assets this project doesn't have yet.
  gender: 'male' | 'female';
  skinTint: number;
  // Shown at the top of the shop modal — each shopkeeper's own flavor
  // line instead of one generic greeting shared by every vendor.
  greeting: string;
}

// A stationary classroom teacher (see server/worlds/teachers.ts) — no
// combat stats (not a fight target like NpcSnapshot's training dummy),
// no shop (unlike VendorSnapshot); just a name/position, standing behind
// its own desk (see deskPositionFor).
export interface TeacherSnapshot {
  id: string;
  name: string;
  map: MapName;
  row: number;
  col: number;
}

export interface MapStatePayload {
  mapName: MapName;
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
  monsters: MonsterSnapshot[];
  corpses: CorpseSnapshot[];
  vendors: VendorSnapshot[];
  teachers: TeacherSnapshot[];
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
  // The ATTACKER's own current skills (see emitCombat) — lets the client
  // update myProfile.skills (and re-render an open Skills modal)
  // immediately when a growth message lands, instead of only reading the
  // percent back out of `message`'s own text (which the client never
  // actually parsed, so the Skills modal stayed stale until the next
  // unrelated 'sync' happened to refresh it).
  attackerSkills?: Record<string, number>;
}

export interface MoveAck {
  ok: boolean;
  player: PlayerSnapshot;
  // Set when ok is false (e.g. walked into the world's edge, or the tile
  // is occupied by another player/NPC) or on a map transition (e.g. "You
  // enter the Labyrinth.") — purely cosmetic, the client doesn't have to
  // show it.
  message?: string;
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
  // Missing here used to mean the client's own cooldown gate (see
  // main.ts's updateEatBrainsButton) never actually learned the new
  // cooldown until an unrelated 'sync' happened to arrive later — eating
  // brains looked "still clickable" even though the server had already
  // started the cooldown.
  eatBrainsReadyAtTick?: number;
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

// The Utilization classroom's spellbook podium (item 8) — same
// "world-tick cooldown + a chance roll" shape as EatBrainsAck/UseItemAck's
// consume path, just for a click-to-read interaction instead.
export interface ReadLucemBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  lucemBookReadyAtTick?: number;
  message?: string;
}

// The Elemental Casting classroom's own podium, teaching irrigo — same
// shape as ReadLucemBookAck.
export interface ReadIrrigoBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  irrigoBookReadyAtTick?: number;
  message?: string;
}

// Utilization's second podium (a follow-up ask), teaching quick movement —
// same shape as ReadLucemBookAck.
export interface ReadQuickMovementBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  quickMovementBookReadyAtTick?: number;
  message?: string;
}

// Lucem/quick movement's own ack-based cast (a follow-up ask, replacing
// lucem's old fire-and-forget '/lucem' chat command so the client can
// toast the result even with a modal open — see WorldScene's
// useTargetedSkill). Both are no-target toggles with identical mechanics
// (mana cost, percent-chance success, 2%-per-cast growth, real-time
// duration scaling with skill%), so one ack shape covers either.
export interface CastSpellAck {
  ok: boolean;
  active?: boolean;
  mana?: number;
  skills?: Record<string, number>;
  message?: string;
}

// Drink/pour/irrigo (items 7 & 8's follow-up asks) — all act on a single
// targeted inventory item (see WorldScene's targetItemIndex) and report
// back the canteen's new fill level so the client never has to guess it.
export interface CanteenActionAck {
  ok: boolean;
  canteenDrinks?: number;
  mana?: number;
  // Set only by castIrrigo (a later follow-up ask gave irrigo the same
  // percent-chance-to-grow mechanic lucem already has) — present whenever
  // a growth roll actually fired, so the client can refresh its own copy
  // without waiting for an unrelated 'sync'.
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
  // Zombie-only: heals 20% hp/mana, see game.gateway.ts's
  // EAT_BRAINS_COOLDOWN_TICKS for the cooldown this starts.
  eatBrains: (corpseId: string, ack: (res: EatBrainsAck) => void) => void;
  // Monster-corpse-only "sacrifice it to the gods" — see
  // game.gateway.ts's handleSacrificeCorpse for the gold formula.
  sacrificeCorpse: (corpseId: string, ack: (res: SacrificeAck) => void) => void;
  // The Utilization classroom's spellbook podium (item 8) — a 10% chance
  // per click of learning lucem, gated by a 2-world-tick cooldown; see
  // game.gateway.ts's handleReadLucemBook.
  readLucemBook: (ack: (res: ReadLucemBookAck) => void) => void;
  // The Elemental Casting classroom's own podium — same shape, teaching
  // irrigo instead; see game.gateway.ts's handleReadIrrigoBook.
  readIrrigoBook: (ack: (res: ReadIrrigoBookAck) => void) => void;
  // Utilization's second podium — same shape again, teaching quick
  // movement; see game.gateway.ts's handleReadQuickMovementBook.
  readQuickMovementBook: (ack: (res: ReadQuickMovementBookAck) => void) => void;
  // No-target toggles (a follow-up ask, replacing the old '/lucem' chat
  // command so the result can be toasted even with a modal open) — see
  // game.gateway.ts's handleCastLucem/handleCastQuickMovement.
  castLucem: (ack: (res: CastSpellAck) => void) => void;
  castQuickMovement: (ack: (res: CastSpellAck) => void) => void;
  // Drink/pour/irrigo (items 7 & 8's follow-up asks) — all take the
  // targeted inventory item's index (see WorldScene's targetItemIndex).
  drinkItem: (itemIndex: number, ack: (res: CanteenActionAck) => void) => void;
  pourItem: (itemIndex: number, ack: (res: CanteenActionAck) => void) => void;
  castIrrigo: (itemIndex: number, ack: (res: CanteenActionAck) => void) => void;
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
  gender: Gender | null;
  hairColor: HairColor | null;
  skinTone: SkinTone | null;
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
  luck: number;
  canteenDrinks: number;
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
  // Condeath tracking (item 23) — persisted; loaded from the player doc
  // on connect (see handleConnection), incremented on every death (see
  // applyCondeathPenalty).
  deathCount: number;
  // The lucem spell's own toggle (see PlayerSnapshot's wandLit) — never
  // persisted, same tradeoff as restState/torchLitAt. wandLitAt is the
  // epoch-ms it was last lit, or null while off — a follow-up ask gave
  // lucem a real-time duration (see game.gateway.ts's spellDurationMs/
  // checkLucemExpiry), same "lit at X, checked once per stat tick" shape
  // as a torch's own torchLitAt/checkTorchBurnout.
  wandLit: boolean;
  wandLitAt: number | null;
  // Quick movement's own toggle (a follow-up ask) — same shape as
  // wandLit/wandLitAt above, see PlayerSnapshot's quickMovementActive.
  quickMovementActive: boolean;
  quickMovementActiveAt: number | null;
  // A 2-stat-tick cooldown gate on reading the lucem spellbook (item 8),
  // same shape/units as eatBrainsReadyAtTick above.
  lucemBookReadyAtTick: number;
  // Same idea, for the Elemental Casting classroom's irrigo podium.
  irrigoBookReadyAtTick: number;
  // Same idea again, for Utilization's second podium (quick movement).
  quickMovementBookReadyAtTick: number;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
