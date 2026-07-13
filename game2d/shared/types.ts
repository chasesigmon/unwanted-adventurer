import type { Server, Socket } from 'socket.io';
import type { Gender, HairColor, MapName, Race, SkinTone, Direction, MonsterKind, MonsterClass, HouseName, SpecializationPath } from './constants.js';
import type { EquipmentSlot } from './equipment.js';
import type { QuestProgress } from './quests.js';

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
  restState: RestState;
  // Whether this player is sleeping in a Dorms bed specifically (a later
  // follow-up ask), not just on the floor — grants an extra 15% on top of
  // the normal sleep heal (see game.gateway.ts's applyStatTick) and shows
  // "Sleeping in a bed" instead of plain "Sleeping" in the Affects modal.
  // Optional for the same reason as wandLitUntil/mapUnlocked above — only
  // the OWNING client's own snapshot ever needs it.
  sleepingInBed?: boolean;
  // The /dance command (a later follow-up ask) — purely cosmetic, no
  // heal-rate effect like restState above; moving cancels it (see
  // game.gateway.ts's handleMove). Visible to every other nearby player
  // too (see WorldScene's applyDancePose), not just the dancer's own
  // client, so it's a plain required boolean rather than optional like
  // sleepingInBed.
  dancing: boolean;
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
  // Whether the celeritas spell is currently active for THIS player
  // (a follow-up ask) — same "wand toggle" shape as wandLit below, boosts
  // their own move speed by ~10% while on (see WorldScene's
  // effectiveMoveCooldownMs); auto-expires after spellDurationMs, same as
  // lucem.
  celeritasActive: boolean;
  // Absolute epoch-ms expiry for lucem/celeritas, whenever active (a
  // follow-up ask: the new Affects modal needs to show a live countdown,
  // e.g. "Lucem - 2m" — an absolute timestamp lets the client compute
  // "how much time is left" continuously via Date.now() without needing
  // a fresh server push every second). null while inactive; optional
  // (rather than every OTHER player's snapshot needing a filler null)
  // since only the OWNING client's own Affects modal ever reads this —
  // see snapshotFor, the one place that actually populates it.
  wandLitUntil?: number | null;
  celeritasActiveUntil?: number | null;
  // Scutum (a later follow-up ask) — a fixed-duration self-shield, unlike
  // lucem/celeritas which the player toggles back off early: always ON
  // for its own full duration once cast. Same absolute-expiry-timestamp
  // shape as wandLitUntil/celeritasActiveUntil above, for the Affects
  // modal's own countdown; scutumActive itself drives the blue-sphere
  // visual (see WorldScene's updateScutumVisual) and a damage-reduction
  // check server-side (see resolveHitOnPlayer).
  scutumActive: boolean;
  scutumActiveUntil?: number | null;
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
  // A later follow-up ask replaced the old automatic per-level attribute
  // bonus: leveling up now grants this many stat points (stacking across
  // multiple levels if unspent) for the player to allocate themselves via
  // the character sheet's own +/- buttons (see the 'allocateStatPoint'
  // event and game.gateway.ts's handleAllocateStatPoint).
  statPointsAvailable: number;
  // Whether THIS player's own wand is currently lit (the lucem spell's
  // toggle — see game.gateway.ts's handleLucemCommand) — never persisted
  // (resets to unlit on reconnect, same tradeoff as restState/torchLitAt).
  // Distinct from hasLight below: this is checked for the LOCAL player's
  // own vision (see WorldScene's localLightRadiusTiles); hasLight is what
  // OTHER nearby players see.
  wandLit: boolean;
  // Whether this player has ever taken the map out of the secret room's
  // treasure chest (a follow-up ask: "the map/world map/who/where modal"
  // is now something a player finds, not a starting given) — gates the
  // map corner button, its 'm' hotkey, and the map modal itself client-
  // side; permanent once true (see game.gateway.ts's handleTakeChestItem).
  // Optional for the same reason as wandLitUntil/celeritasActiveUntil
  // above — only the OWNING client's own snapshot ever populates it.
  mapUnlocked?: boolean;
  // Per-player lock state for the secret room's own door/chest (a later
  // follow-up ask) — optional for the same reason as mapUnlocked above,
  // used client-side purely to tint the door/chest sprites and word
  // messages ("already unlocked" vs "locked").
  secretDoorUnlocked?: boolean;
  secretChestUnlocked?: boolean;
  // Eating & drinking (a follow-up ask) — 0-100, 1 point lost per
  // world-clock hour (see game.gateway.ts's applyStatTick), 20 points
  // recovered per drink/meal. See shared/items.ts for what restores each.
  // Optional for the same reason as mapUnlocked above — private stats,
  // only the OWNING client's own snapshot ever populates them (see
  // WorldManagerService.getMapState, which never sets them for the
  // copies OTHER players in the room see).
  hunger?: number;
  thirst?: number;
  // Quest id -> progress (see shared/quests.ts's own QuestProgress and
  // its quest/objective definitions) — a quest id present here (even with
  // an empty object) means it's been started. Optional for the same
  // reason as hunger/thirst above.
  quests?: Record<string, QuestProgress>;
  // The Learn Spells quest's own completion reward (a follow-up ask) — a
  // temporary +10-percentage-point bonus to every spell's own skill-
  // growth roll (see game.gateway.ts's maybeGrowSpellSkill), same
  // "absolute epoch-ms expiry, optional, owning-client-only" shape as
  // wandLitUntil/celeritasActiveUntil. Never persisted (resets on
  // reconnect, same tradeoff as those).
  enhancedLearningUntil?: number | null;
  // Which of the 4 houses this player has chosen (a follow-up ask) —
  // permanent once set (see game.gateway.ts's handleChooseHouse), gates
  // which house's own Common Room/Dorms this player may enter (see
  // shared/constants.ts's houseCommonRoomFor/houseDormsFor). Optional for
  // the same reason as mapUnlocked above.
  house?: HouseName;
  // Which specialization path this player has chosen (a follow-up ask) —
  // permanent once set, level-10-gated (see game.gateway.ts's
  // handleChooseSpecialization); no mechanics wired to it yet beyond
  // recording the choice. Optional for the same reason as mapUnlocked
  // above.
  specialization?: SpecializationPath;
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
  // A follow-up ask's practice scarecrows — true means this NPC resets
  // to full hp in place on "death" instead of leaving a corpse/relocating
  // (see game.gateway.ts's resolveHitOnNpc) and never counter-attacks.
  // Absent (falsy) for the original Great Plains training dummy, whose
  // behavior is unchanged.
  immortal?: boolean;
  // Display name used in combat messages/emitCombat's targetLabel —
  // defaults to "training dummy" (the original NPC's own name) when
  // absent, so existing behavior doesn't need every NPCS entry updated.
  label?: string;
  // While present, whatever this NPC is carrying (a follow-up ask gave
  // the training skeletons a wooden club to practice exarme on) — same
  // "first weapon-slot item shows as a held-weapon overlay" shape as
  // MonsterSnapshot's own carriedItems. Absent (not just empty) for every
  // NPC that was never meant to carry anything.
  carriedItems?: string[];
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
  // Absent (the default) means "yes, has a desk one tile south" — every
  // classroom teacher. false is for a non-classroom teacher who shouldn't
  // get one at all (a follow-up ask's Headmistress, standing between the
  // Entrance Hall's own fireplaces, not at a desk) — see
  // server/worlds/teachers.ts's teacherDeskFootprintFor.
  hasDesk?: boolean;
  // Present only for a teacher who offers a quest on click (a follow-up
  // ask) — opens a dialogue modal (see src/ui/npcDialogueModal.ts) with
  // this quest's own description (shared/quests.ts) as the spoken line
  // and a button to start it, instead of the plain classroom-teacher
  // tooltip.
  questId?: string;
  // Which way this teacher's own sprite faces — absent means 'down'
  // (every existing teacher, standing at the front of their own room
  // facing the door/players). A follow-up ask's map-quest teacher stands
  // against the Entrance Hall's own west wall facing the room's center
  // ('right'/east) instead.
  facing?: 'down' | 'up' | 'left' | 'right';
  // The Specialization room's own teacher (a follow-up ask) — opens a
  // level-gated dialogue instead of the ordinary quest offer/classroom
  // tooltip: "Return to me when you are level 10" below that, "choose
  // your path" (with choices TBD) at/above it. No quest, no persisted
  // state at all — just a live myProfile.level check every time.
  specializationGate?: boolean;
  // The Entrance Hall's own house-assignment teacher (a follow-up ask) —
  // opens a dialogue offering the 4 houses as clickable choices (see
  // src/ui/npcDialogueModal.ts's openHouseChoiceDialogue) if the player
  // hasn't picked one yet, or a fixed "already chosen" line with no
  // buttons if they have. No quest, permanent once chosen (see
  // game.gateway.ts's handleChooseHouse).
  houseChoiceGate?: boolean;
  // A distinct robe color per teacher (a follow-up ask) — absent means
  // the spritesheet's own base navy. See src/characterSprites.ts's
  // teacher-${TeacherRobeColor} variant textures (one full recolored
  // spritesheet per name, generated from the base art — see assets/
  // teacher-spritesheet-*.png).
  robeColorKey?: TeacherRobeColor;
}

export const TEACHER_ROBE_COLORS = ['violet', 'crimson', 'teal', 'forest', 'amber', 'steel', 'plum', 'olive', 'maroon', 'slate'] as const;
export type TeacherRobeColor = (typeof TEACHER_ROBE_COLORS)[number];

export type TeacherFacing = NonNullable<TeacherSnapshot['facing']>;

// The desk sits one tile in front of the teacher, in whichever direction
// they face (absent facing defaults to 'down', same as TeacherSnapshot
// itself) — shared so server/worlds/teachers.ts's collision footprint
// and WorldScene's own desk sprite placement can never drift apart.
export function deskOffsetForFacing(facing: TeacherFacing | undefined): { dRow: number; dCol: number } {
  switch (facing) {
    case 'up':
      return { dRow: -1, dCol: 0 };
    case 'left':
      return { dRow: 0, dCol: -1 };
    case 'right':
      return { dRow: 0, dCol: 1 };
    case 'down':
    default:
      return { dRow: 1, dCol: 0 };
  }
}

// The desk sprite art is drawn extending "up" (toward a south-facing
// teacher) by default — rotated clockwise here to match whichever
// direction the teacher actually faces (see WorldScene's desk sprite).
export const DESK_ANGLE_FOR_FACING: Record<TeacherFacing, number> = { down: 0, right: 90, up: 180, left: 270 };

// Murus lapideus (a later follow-up ask) — a temporary, defensive summon
// standing wherever the caster clicked; rendered like an NPC (a health
// bar, no other UI) but tracked entirely in GameGateway (see
// mapStateFor), not WorldManagerService/MonsterManagerService.
export interface StoneBlockSnapshot {
  id: string;
  map: MapName;
  row: number;
  col: number;
  hp: number;
  maxHp: number;
}

export interface MapStatePayload {
  mapName: MapName;
  players: PlayerSnapshot[];
  npcs: NpcSnapshot[];
  monsters: MonsterSnapshot[];
  corpses: CorpseSnapshot[];
  vendors: VendorSnapshot[];
  teachers: TeacherSnapshot[];
  stoneBlocks: StoneBlockSnapshot[];
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
  // Which skill actually landed this hit (a follow-up ask) — lets the
  // client trigger a skill-specific visual (a fireball for augue, a bolt
  // for the wand's own ranged auto-attack) instead of guessing from
  // `message`'s own text. Absent for melee (punch/dagger/bone finger
  // strike/glare), which has no projectile to animate.
  skill?: string;
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
  skills?: Record<string, number>;
  // Set only when consuming a cup of water/jerky (a follow-up ask's
  // eating & drinking system) — see game.gateway.ts's applyConsume.
  hunger?: number;
  thirst?: number;
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

// Utility Classroom's own 4th podium, teaching irrigo (moved there from
// the old Elemental Casting Classroom — a later follow-up ask) — same
// shape as ReadLucemBookAck.
export interface ReadIrrigoBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  irrigoBookReadyAtTick?: number;
  message?: string;
}

// Utilization's second podium (a follow-up ask), teaching celeritas —
// same shape as ReadLucemBookAck.
export interface ReadCeleritasBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  celeritasBookReadyAtTick?: number;
  message?: string;
}

// The Offense classroom's own podium (a follow-up ask), teaching augue —
// same shape as ReadLucemBookAck.
export interface ReadAugueBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  augueBookReadyAtTick?: number;
  message?: string;
}

// Lucem/celeritas's own ack-based cast (a follow-up ask, replacing
// lucem's old fire-and-forget '/lucem' chat command so the client can
// toast the result even with a modal open — see WorldScene's
// useTargetedSkill). Both are no-target toggles with identical mechanics
// (mana cost, percent-chance success, 2%-per-cast growth, real-time
// duration scaling with skill%), so one ack shape covers either. Augue (a
// later follow-up ask) reuses this same shape for its own pre-flight
// rejections (not learned/on cooldown/out of range) — its actual hit
// result broadcasts through the ordinary 'combat' event instead (see
// game.gateway.ts's handleCastAugue), same as every other attack.
export interface CastSpellAck {
  ok: boolean;
  active?: boolean;
  mana?: number;
  skills?: Record<string, number>;
  message?: string;
}

// Augue's own target (a follow-up ask) — the only kind of target this
// game currently offers is a wild monster (imps included), but this
// mirrors CombatEventPayload's own targetKind shape so extending to
// player/npc targets later is just relaxing a server-side guard, not a
// payload-shape change.
export interface AugueTargetPayload {
  targetKind: 'player' | 'npc' | 'monster';
  targetId: string;
}

// The character sheet's own stat-point allocation (a later follow-up
// ask, replacing the old automatic per-level attribute bonus) — see
// PlayerSnapshot's statPointsAvailable and game.gateway.ts's
// handleAllocateStatPoint.
export type AllocatableStat = 'strength' | 'intelligence' | 'wisdom' | 'dexterity' | 'constitution' | 'luck';

export interface AllocateStatPointAck {
  ok: boolean;
  message?: string;
}

// The Utility Classroom's third podium (a follow-up ask), teaching
// resera — same shape as ReadLucemBookAck.
export interface ReadReseraBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  reseraBookReadyAtTick?: number;
  message?: string;
}

// Resera's own targetable objects (a follow-up ask: "make all doors and
// treasure chests targetable") — identifies WHICH door/chest by its own
// map+position rather than a fixed enum, since every door in the castle
// is now clickable/resera-able (see WorldScene's renderMap door-click
// wiring), not just the one the secret room actually has. The server
// resolves this against its own small registry of REAL lockable objects
// (today, just the secret door + its chest — see game.gateway.ts's
// handleCastResera) and rejects anything else with a "not locked" message
// rather than trusting the client's `kind` label.
export interface LockTarget {
  kind: 'door' | 'chest';
  map: MapName;
  row: number;
  col: number;
}

// Resera's own ack-based cast — same percent-chance-success/growth shape
// as lucem/celeritas/augue, but on success sets a per-player persisted
// unlock flag (client.data.secretDoorUnlocked/secretChestUnlocked)
// instead of a toggle or damage.
export interface CastReseraAck {
  ok: boolean;
  skills?: Record<string, number>;
  message?: string;
}

// A later follow-up ask added 4 more podiums (stupefaciunt, exarme,
// scutum, murus lapideus) — same read-a-podium shape every earlier one
// uses, just without a bespoke per-spell readyAtTick field (dead data —
// no client call site ever read those either, see e.g.
// ReadReseraBookAck.reseraBookReadyAtTick). Reused for all 4.
export interface ReadSpellBookAck {
  ok: boolean;
  skills?: Record<string, number>;
  message?: string;
}

// Murus lapideus (a later follow-up ask) targets a MAP TILE, not a
// player/npc/monster/door/chest — "click the spell, then click a spot on
// the map."
export interface TileTargetPayload {
  row: number;
  col: number;
}

// The secret room's treasure chest (a follow-up ask) — `items` is either
// ['map'] (unlocked, not yet taken), [] (unlocked, already taken), or
// absent entirely (ok: false — still locked).
export interface OpenChestAck {
  ok: boolean;
  items?: string[];
  message?: string;
}

// Taking the map out of the chest (a follow-up ask) — returns the
// player's own fresh snapshot so the client can flip mapUnlocked (and
// thus show the map corner button/hotkey) the instant it happens, same
// "no need to wait for an unrelated sync" shape other acks already use.
export interface TakeChestItemAck {
  ok: boolean;
  player?: PlayerSnapshot;
  message?: string;
}

// Drink/pour/irrigo (items 7 & 8's follow-up asks) — all act on a single
// targeted inventory item (see WorldScene's targetItemIndex) and report
// back the canteen's new fill level so the client never has to guess it.
export interface CanteenActionAck {
  ok: boolean;
  canteenDrinks?: number;
  mana?: number;
  // Set only by drinkItem (a follow-up ask's eating & drinking system) —
  // a canteen drink restores thirst same as a cup of water.
  thirst?: number;
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
  hunger: number;
  thirst: number;
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
  // A later follow-up ask: "show a message when the monster hits
  // anything that concerns the player... including the stone." Unlike
  // 'combat' (broadcast to the whole room, since sprites/hp bars need to
  // update for every bystander too), this is a plain visible-combat-log
  // line sent to exactly ONE client — used for things that don't fit
  // CombatEventPayload's own player-vs-target shape (a monster hitting
  // the player's OWN summoned stone block, which isn't a player/npc/
  // monster attacker at all).
  combatNotice: (message: string) => void;
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
  // Utility Classroom's 4th podium (moved there from the old Elemental
  // Casting Classroom — a later follow-up ask) — same shape, teaching
  // irrigo instead; see game.gateway.ts's handleReadIrrigoBook.
  readIrrigoBook: (ack: (res: ReadIrrigoBookAck) => void) => void;
  // Utilization's second podium — same shape again, teaching quick
  // movement; see game.gateway.ts's handleReadCeleritasBook.
  readCeleritasBook: (ack: (res: ReadCeleritasBookAck) => void) => void;
  // The Offense classroom's own podium (a follow-up ask) — same shape
  // again, teaching augue instead; see game.gateway.ts's
  // handleReadAugueBook.
  readAugueBook: (ack: (res: ReadAugueBookAck) => void) => void;
  // The Utility Classroom's third podium (a later follow-up ask) — same
  // shape again, teaching resera instead; see game.gateway.ts's
  // handleReadReseraBook.
  readReseraBook: (ack: (res: ReadReseraBookAck) => void) => void;
  // Offense's second and third podiums, Defense's own podium, and
  // Summoning's own podium (a later follow-up ask) — same read-a-podium
  // shape as every one above.
  readStupefaciuntBook: (ack: (res: ReadSpellBookAck) => void) => void;
  readExarmeBook: (ack: (res: ReadSpellBookAck) => void) => void;
  readScutumBook: (ack: (res: ReadSpellBookAck) => void) => void;
  readMurusLapideusBook: (ack: (res: ReadSpellBookAck) => void) => void;
  // No-target toggles (a follow-up ask, replacing the old '/lucem' chat
  // command so the result can be toasted even with a modal open) — see
  // game.gateway.ts's handleCastLucem/handleCastCeleritas.
  castLucem: (ack: (res: CastSpellAck) => void) => void;
  castCeleritas: (ack: (res: CastSpellAck) => void) => void;
  // Augue (a later follow-up ask) — unlike the two toggles above, this
  // one needs a target (the only kind this game currently offers is a
  // wild monster); see game.gateway.ts's handleCastAugue.
  castAugue: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // The wand's ranged auto-attack (a follow-up ask) — arms/refreshes a
  // sustained combat session against this target (resolved automatically
  // every combat tick from here on, see combatTick's own WAND_BOLT_SKILL
  // branch) rather than resolving a single hit immediately. Ack-based
  // (unlike punch's fire-and-forget) purely so an immediate rejection
  // (no wand equipped, target out of range) can be shown right away
  // instead of silently doing nothing until the session quietly times out.
  engageRangedAttack: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // A later follow-up bug fix: "the imp did not start moving toward the
  // player when the player attacked" — a melee approach (see WorldScene's
  // tryEngage) walks the player toward a not-yet-adjacent target with NO
  // server round-trip at all until contact, so the monster had no aggro
  // to chase back with the whole time the player was closing the
  // distance. Fire-and-forget (no ack needed, same shape as punch/chat)
  // — just arms the monster's own aggro immediately so it starts
  // approaching too, "meeting in the middle" rather than making the
  // player close the entire gap alone.
  engageMelee: (payload: AugueTargetPayload) => void;
  // The 'x' hotkey (a later follow-up ask: "make the player stop auto
  // attacking") — clears whatever playerCombat session (melee OR ranged)
  // is currently armed. No payload/ack needed, same fire-and-forget shape
  // as chat/punch; the player's own target SELECTION is untouched, only
  // the automatic every-tick attack loop stops.
  disengage: () => void;
  // The character sheet's own stat-point allocation (a later follow-up
  // ask) — see game.gateway.ts's handleAllocateStatPoint.
  allocateStatPoint: (payload: { stat: AllocatableStat }, ack: (res: AllocateStatPointAck) => void) => void;
  // Resera (a later follow-up ask) — a targeted utility spell, not a
  // toggle or attack; see game.gateway.ts's handleCastResera.
  castResera: (payload: { target: LockTarget }, ack: (res: CastReseraAck) => void) => void;
  // The secret room's treasure chest (a later follow-up ask) — see
  // game.gateway.ts's handleOpenChest/handleTakeChestItem.
  openChest: (ack: (res: OpenChestAck) => void) => void;
  takeChestItem: (ack: (res: TakeChestItemAck) => void) => void;
  // Stupefaciunt/exarme (a later follow-up ask) — same targeted-attack
  // shape as augue (see game.gateway.ts's handleCastStupefaciunt/
  // handleCastExarme).
  castStupefaciunt: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  castExarme: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // Scutum (a later follow-up ask) — no target, a timed self-buff like
  // lucem/celeritas; see game.gateway.ts's handleCastScutum.
  castScutum: (ack: (res: CastSpellAck) => void) => void;
  // Murus lapideus (a later follow-up ask) — targets a map tile, not an
  // entity; see game.gateway.ts's handleCastMurusLapideus.
  castMurusLapideus: (payload: TileTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // A Dorms bed (a later follow-up ask) — targets a specific bed tile;
  // see game.gateway.ts's handleSleepInBed.
  sleepInBed: (payload: TileTargetPayload, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // A bench (a follow-up ask) — same targeted-tile shape as sleepInBed
  // above, resting (with its own near-a-bench bonus) instead of sleeping;
  // see game.gateway.ts's handleRestOnBench.
  restOnBench: (payload: TileTargetPayload, ack: (res: { ok: boolean; message?: string }) => void) => void;
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
  // The Headmistress's own quest offer (a follow-up ask) — see
  // game.gateway.ts's handleStartQuest. A no-op (still ok: true) if
  // already started.
  startQuest: (payload: { questId: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // Turning a finished quest back in to its own quest-giver (a follow-up
  // ask: "they should have to click to complete the quest") — see
  // game.gateway.ts's handleCompleteQuest. Rejected if any objective
  // isn't actually done yet, or if it's already been turned in.
  completeQuest: (payload: { questId: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // The new house-assignment teacher's own dialogue (a follow-up ask) —
  // permanent once chosen; rejected if the player already has one (see
  // game.gateway.ts's handleChooseHouse).
  chooseHouse: (payload: { house: HouseName }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // The Specialization room's own path choice (a follow-up ask) —
  // level-10-gated, permanent once chosen (see game.gateway.ts's
  // handleChooseSpecialization).
  chooseSpecialization: (payload: { path: SpecializationPath }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // ===== TESTING OVERRIDE — REMOVE AFTER TESTING ===== "add a 'cheat'
  // hotkey... pressing it should recover my mana to 100%. This will go
  // away after testing." Bound to the '~' key client-side (see
  // WorldScene's create()); see game.gateway.ts's handleCheatFullMana.
  cheatFullMana: (ack: (res: SyncPayload) => void) => void;
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
  restState: RestState;
  // See PlayerSnapshot's own doc comment — never persisted, resets to
  // false on reconnect same as restState itself.
  sleepingInBed: boolean;
  // The /dance command's own state — never persisted, resets to false on
  // reconnect same as restState/sleepingInBed above.
  dancing: boolean;
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
  // See PlayerSnapshot's own doc comment — persisted; loaded from the
  // player doc on connect, incremented on level-up, decremented on
  // allocation.
  statPointsAvailable: number;
  // The lucem spell's own toggle (see PlayerSnapshot's wandLit) — never
  // persisted, same tradeoff as restState/torchLitAt. wandLitUntil is the
  // epoch-ms it was last lit, or null while off — a follow-up ask gave
  // lucem a real-time duration (see game.gateway.ts's spellDurationMs/
  // checkLucemExpiry), same "lit at X, checked once per stat tick" shape
  // as a torch's own torchLitAt/checkTorchBurnout.
  wandLit: boolean;
  wandLitUntil: number | null;
  // Quick movement's own toggle (a follow-up ask) — same shape as
  // wandLit/wandLitUntil above, see PlayerSnapshot's celeritasActive.
  celeritasActive: boolean;
  celeritasActiveUntil: number | null;
  // Scutum's own toggle (a later follow-up ask) — see PlayerSnapshot's
  // scutumActive; always ON for its own full duration once cast (no
  // manual toggle-off, unlike lucem/celeritas).
  scutumActive: boolean;
  scutumActiveUntil: number | null;
  // A 2-stat-tick cooldown gate on reading the lucem spellbook (item 8),
  // same shape/units as eatBrainsReadyAtTick above.
  lucemBookReadyAtTick: number;
  // Same idea, for the Elemental Casting classroom's irrigo podium.
  irrigoBookReadyAtTick: number;
  // Same idea again, for Utilization's second podium (celeritas).
  celeritasBookReadyAtTick: number;
  // Same idea again, for the Offense classroom's own podium (augue).
  augueBookReadyAtTick: number;
  // Same idea again, for the Utility classroom's third podium (resera).
  reseraBookReadyAtTick: number;
  // Same idea again, for Offense's second/third podiums, Defense's own
  // podium, and Summoning's own podium (a later follow-up ask).
  stupefaciuntBookReadyAtTick: number;
  exarmeBookReadyAtTick: number;
  scutumBookReadyAtTick: number;
  murusLapideusBookReadyAtTick: number;
  // The secret room system (a follow-up ask) — persisted; loaded from the
  // player doc on connect. See the DB column's own comment
  // (docker/postgres/init-postgres.sql) for what each one means.
  secretDoorUnlocked: boolean;
  secretChestUnlocked: boolean;
  mapUnlocked: boolean;
  // See PlayerSnapshot's own doc comment — persisted; loaded from the
  // player doc on connect.
  hunger: number;
  thirst: number;
  quests: Record<string, QuestProgress>;
  // Never persisted — see PlayerSnapshot's own doc comment.
  enhancedLearningUntil: number | null;
  // House/specialization choice (a follow-up ask) — persisted; loaded
  // from the player doc on connect, null until chosen (permanent once
  // set). See PlayerSnapshot's own doc comment for what each gates.
  house: HouseName | null;
  specialization: SpecializationPath | null;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
