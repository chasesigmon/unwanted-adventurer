import type { Server, Socket } from 'socket.io';
import type { Gender, HairColor, MapName, Race, SkinTone, Direction, MonsterKind, MonsterClass, HouseName, SpecializationPath } from './constants.js';
import type { EquipmentSlot } from './equipment.js';
import type { QuestProgress } from './quests.js';
import type { PetSnapshot, PetCommand, AnimatedMonsterSnapshot, FollowerEquipmentSlot, PetCorpseSnapshot, TamedBeastSnapshot } from './pets.js';

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
  // Movement points (a later follow-up ask re-added this resource) — see
  // combat/formulas.ts's STARTING_MV/MV_COST_PER_TILE.
  mv: number;
  maxMv: number;
  // Hemomancer's own resource (a later follow-up ask) — 0 for everyone
  // else, granted at 100 the moment a player becomes a Hemomancer. No
  // maxBp — its max (MAX_BP, shared/skills.ts) is a flat constant.
  // Can go below 0 (see game.gateway.ts's handleCastSapHealth).
  bp: number;
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
  // Item 17: a single balance shared across Kortho's and Floro's own Bank
  // vendors — deposit is free, withdrawal costs a flat 5% fee (see
  // game.gateway.ts's handleDepositGold/handleWithdrawGold).
  bankedGold: number;
  // Slime-only leftovers from the since-removed /mimic and /revert
  // commands (a later follow-up ask) — mimicableRaces/mimicForm can no
  // longer be set to anything meaningful, kept only because dropping the
  // columns/fields outright would need a live DB migration for no
  // functional gain.
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
  // Barrier (a later follow-up ask) — same absolute-expiry-timestamp
  // shape as scutumActiveUntil above, drives the yellow dome visual (see
  // WorldScene's updateBarrierVisual) and the movement/damage-immunity
  // gates server-side (see game.gateway.ts's handleMove/
  // resolveMonsterCounterAttack). The dome's own fixed origin lives in
  // GameGateway's own activeBarriers registry, not here.
  barrierActive: boolean;
  barrierActiveUntil?: number | null;
  // Shaman's "enhance damage" (a later follow-up ask) — same fixed-
  // duration self-buff shape as scutum, but with no visible effect on
  // OTHER players' screens (just a flat damage bonus — see
  // game.gateway.ts's rollExtraAttacks/resolveRangedAutoAttack), so unlike
  // scutum/barrier this never needs to thread through PlayerState/
  // world-manager's broadcast snapshot — only the OWNING client's own
  // Affects modal countdown reads it.
  enhanceDamageActive?: boolean;
  enhanceDamageActiveUntil?: number | null;
  // Druid's wisp transformation (a later follow-up ask) — same
  // fixed-duration self-buff shape as scutum/barrier, threaded through
  // PlayerState/world-manager's broadcast snapshot (unlike
  // enhanceDamageActive above) since every nearby player needs to see
  // the caster's sprite actually swap to the wisp form (see WorldScene's
  // updateWispVisual). No damage-immunity/movement-confinement gate like
  // barrier — just the no-attack/faster-movement rules (see
  // game.gateway.ts's wispActive checks, WorldScene's
  // effectiveMoveCooldownMs).
  wispActive: boolean;
  wispActiveUntil?: number | null;
  // Item 11's Transform spell — same "every nearby player needs to see
  // the sprite swap" reasoning as wispActive above; beastTransformKind
  // rides along on the SAME broadcast snapshot (not just the self-only
  // optional copy above) since other players need to know WHICH beast to
  // render, not just that a transform is active.
  beastTransformActive: boolean;
  beastTransformKind?: MonsterKind | null;
  // Illusionist's invisibility (a later follow-up ask) — same
  // fixed-duration self-buff shape as scutum/barrier/wisp, threaded
  // through PlayerState/world-manager's broadcast snapshot for the
  // OPPOSITE reason wisp's own visual is: every nearby player needs to
  // know to SKIP rendering this player's sprite entirely (see
  // WorldScene's applyMapState), while the OWNING client instead just
  // fades its own sprite (see updateInvisibilityVisual). Breaks early on
  // the caster's own basic attack (see game.gateway.ts's
  // breakInvisibilityIfActive) — no manual recast-to-cancel like barrier.
  invisibleActive: boolean;
  invisibleActiveUntil?: number | null;
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
  // Server-computed, not stored — a later follow-up ask split the old
  // single "Armor Class" into two tracks (see combat/formulas.ts's
  // armorVsPhysicalFor/armorVsMagicalFor): physical mitigates melee/
  // punch/dagger hits (dexterity + strength + worn armor), magical
  // mitigates spell damage (intelligence + wisdom + worn armor — no item
  // grants this yet). Each IS the final flat damage reduction directly.
  // Shown on the character sheet purely for transparency; damage
  // reduction itself is computed fresh per-hit server-side.
  armorVsPhysical: number;
  armorVsMagical: number;
  // Condeath tracking (item 23) — every death, from any cause, counts
  // toward CONDEATH_LIMIT (65); see game.gateway.ts's applyCondeathPenalty.
  deathCount: number;
  // A later follow-up ask replaced the old automatic per-level attribute
  // bonus: leveling up now grants this many stat points (stacking across
  // multiple levels if unspent) for the player to allocate themselves via
  // the character sheet's own +/- buttons (see the 'allocateStatPoint'
  // event and game.gateway.ts's handleAllocateStatPoint).
  statPointsAvailable: number;
  // "Practice points" (a later follow-up ask replaced the old podium-
  // reading skill system) — 3 granted every level, spent at a teacher's
  // own click-to-learn modal (see the 'learnSkill' event).
  practicePointsAvailable: number;
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
  // The Illusionist's own create duplicate spell (a later follow-up ask:
  // "have an affect while create duplicate is active so they know when
  // it will end") — same "absolute epoch-ms expiry, optional, owning-
  // client-only" shape as enhancedLearningUntil above; no separate
  // xActive boolean since this has no manual early-cancel, purely time-
  // based (see game.gateway.ts's activeDuplicates/checkDuplicateExpiry).
  duplicateActiveUntil?: number | null;
  // Flight (a later follow-up ask) — same fixed-duration self-buff shape
  // as scutum/barrier/wisp, threaded through PlayerState/world-manager's
  // broadcast snapshot (flightActive only — bystanders need to see the
  // floating visual/wind trail too, see WorldScene's applyMapState) but
  // flightActiveUntil/flightBurstReadyAt are optional/owning-client-only,
  // same reasoning as wispActiveUntil/duplicateActiveUntil above.
  flightActive: boolean;
  flightActiveUntil?: number | null;
  flightBurstReadyAt?: number | null;
  // A later follow-up ask: boats ("a small canoe"/"a large raft") — which
  // one (if either) this player is CURRENTLY riding, auto-set the instant
  // they step onto (or land on, from flight) a water tile while carrying
  // one (see game.gateway.ts's handleMove/checkFlightExpiry), auto-cleared
  // the instant they step back onto dry land. Threaded through
  // PlayerState/world-manager's broadcast snapshot like flightActive —
  // bystanders need to see the boat sprite too (see WorldScene's
  // applyMapState).
  inBoat?: 'small' | 'large' | null;
  // A minimal player party (a later follow-up ask) — see shared/pvp.ts's
  // own doc comment. Optional/owning-client-only, same reasoning as
  // hunger/thirst above — only used for the local player's own PvP-cursor
  // eligibility check (see WorldScene's pointermove handler), never
  // rendered for bystanders.
  party?: string[];
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
  // Recall's own "have I been there" gate (a later follow-up ask) — only
  // ever populated/read for the LOCAL player's own snapshot (see
  // game.gateway.ts's snapshotFor); other players' own map:state entries
  // simply omit it, same "optional, self-only" shape as mapUnlocked.
  visitedPois?: string[];
  // A later follow-up ask reworked recall down to a single settable
  // point ("the player must set one location to be their recall
  // choice at a time") — the RecallPoint.id (see shared/recall.ts) they
  // last set, or null/undefined if they never have. Same "optional,
  // self-only" shape as visitedPois above.
  recallPointId?: string | null;
  // A later follow-up ask: dying now takes a real 10s respawn countdown
  // ("have a countdown shown on screen... the screen darken while the
  // yellow text countdown happens") — the absolute epoch-ms it ends, same
  // convention as wandLitUntil/flightActiveUntil above; null/undefined
  // while alive. Self-only — nothing about another player's own respawn
  // needs to render for bystanders.
  respawningUntil?: number | null;
  // "If the player has a corpse anywhere in the game... tell them where"
  // — the map their own most recent death corpse sits in, if it hasn't
  // faded yet (see CorpseManagerService.findForOwner), else null.
  // Self-only, recomputed fresh on every snapshotFor call.
  corpseLocation?: MapName | null;
  // Summoner's own "which monster kinds can I summon" gate (a later
  // follow-up ask) — same "optional, self-only" shape as visitedPois:
  // only populated once a player has actually specialized into Summoner
  // (see game.gateway.ts's recordMonsterKill), read by the monster
  // summons modal.
  killedMonsterKinds?: string[];
  // Item 11's Transform spell — same "optional, self-only" shape as
  // killedMonsterKinds above, read by the transform beast-picker modal.
  tamedBeastKinds?: string[];
  // The exact expiry timestamp — self-only (see beastTransformActive/
  // beastTransformKind above for the fields every OTHER nearby player's
  // own snapshot also carries, same "flag vs. flag+expiry" split
  // wandLit/wandLitUntil already establishes).
  beastTransformUntil?: number | null;
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
  // A "rare" variant (a later follow-up ask) — drives a bigger sprite
  // scale client-side (see WorldScene's own monster rendering); absent
  // for every ordinary monster.
  isRare?: boolean;
  // A later follow-up ask ("level 8 falcons... that fly around") — drives
  // a small airborne y-offset client-side (see WorldScene's own monster
  // rendering) instead of sitting flush on the ground like every other
  // monster.
  flies?: boolean;
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
  // A flat coin drop (a later follow-up ask: "the imps should drop 3
  // coins every time on death... skeletons 5... goblins 7") — added
  // straight to the looter's own gold on handleLoot, not an inventory
  // item (gold was never a stackable item string to begin with). Item 16
  // extended this to a player's own death corpse too (their full gold
  // total, stripped the same way their inventory/equipment are) — absent/0
  // only for the training dummy now.
  gold?: number;
  map: MapName;
  row: number;
  col: number;
  // Whoever landed the killing blow, if anyone did (a corpse from some
  // future non-combat source could have none) — backs the zombie-only
  // "Eat Brains" option in the loot modal (see main.ts), only offered to
  // the player who actually earned it.
  killedBy?: string;
  // The monster's own max hp/attack damage at the moment it died (a later
  // follow-up ask's animate dead spell needs these to build an animated
  // monster with "2x the hp of the original monster... and the same
  // attack" — see game.gateway.ts's handleCastAnimateDead). Absent for a
  // player/training-dummy corpse, which animate dead can't target anyway.
  sourceMaxHp?: number;
  sourceAttackDamage?: number;
  // Whether the monster that died was a "rare" variant (a later follow-up
  // ask: "when the necromancer animates a corpse, it should reflect what
  // they were before... if animating a rare wild goblin then the
  // animated dead should have the title Animated rare wild goblin and
  // should be the same size" — see AnimatedMonsterSnapshot's own isRare
  // and game.gateway.ts's handleCastAnimateDead). Absent/false for
  // anything that isn't a rare monster's corpse.
  isRare?: boolean;
  // A later follow-up ask: "if the player has a corpse anywhere in the
  // game... tell them where their corpse is" — set only for a PLAYER's
  // own death corpse (see game.gateway.ts's spawnPlayerCorpseAndStripGear),
  // absent for every monster/NPC corpse, which has no single "owner" to
  // report back to.
  ownerUsername?: string;
}

// A later follow-up ask: "if a player drops an item on the ground that a
// treasure chest appears that contains the item... upon removing all
// items from a treasure chest that appears from dropped items, it should
// completely disappear. If a player drops multiple items in the same
// spot or within 10 feet of an already existing treasure chest, then
// those items should also go into that existing treasure chest." Anyone
// can loot it (same as a monster corpse) — no single owner is tracked.
export interface DroppedItemChestSnapshot {
  id: string;
  map: MapName;
  row: number;
  col: number;
  items: string[];
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
  // A later follow-up ask: "update the teachers titles in the entrance
  // hall to be their name and their position" — e.g. "House
  // Administrator", "Quest Giver". Absent for every teacher without a
  // distinct role (every classroom/specialization-chamber teacher) —
  // display code falls back to plain `name` for those.
  title?: string;
  map: MapName;
  row: number;
  col: number;
  // Absent (the default) means "yes, has a desk one tile south" — every
  // classroom teacher. false is for a non-classroom teacher who shouldn't
  // get one at all (a follow-up ask's Headmistress, standing between the
  // Entrance Hall's own fireplaces, not at a desk) — see
  // server/worlds/teachers.ts's teacherDeskFootprintFor.
  hasDesk?: boolean;
  // Present only for a teacher who offers one or more quests on click (a
  // follow-up ask) — opens a dialogue modal (see src/ui/npcDialogueModal.ts)
  // with this quest's own description (shared/quests.ts) as the spoken
  // line and a button to start it, instead of the plain classroom-teacher
  // tooltip. Checked in order (see shared/quests.ts's activeQuestIdFor) —
  // a teacher with more than one (Professor Hollowell's 2nd quest, a
  // later follow-up ask) offers them one at a time, moving to the next
  // once the current one is turned in.
  questIds?: string[];
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
  // Every skill/spell this teacher offers through the click-to-learn
  // modal (a later follow-up ask replaced the old podium-reading skill
  // system, and generalized the Necromancer's own bespoke single-skill
  // purchase gate into this list — any classroom or specialization
  // teacher can offer any number of skills, each gated by its own
  // shared/skills.ts SKILL_LEVEL_REQUIREMENT/SKILL_SPECIALIZATION_REQUIREMENT).
  // Undefined/empty means the plain generic classroom tooltip instead.
  teachesSkills?: string[];
  // A distinct robe color per teacher (a follow-up ask) — absent means
  // the spritesheet's own base navy. See src/characterSprites.ts's
  // teacher-${TeacherRobeColor} variant textures (one full recolored
  // spritesheet per name, generated from the base art — see assets/
  // teacher-spritesheet-*.png).
  robeColorKey?: TeacherRobeColor;
  // Long hair (a follow-up ask: "update the female teachers to have long
  // hair so you can tell they are females") — absent means the base
  // short/round hairstyle. See src/characterSprites.ts's own
  // teacher-${TeacherRobeColor}-longhair variant textures.
  longHair?: boolean;
}

export const TEACHER_ROBE_COLORS = ['violet', 'crimson', 'teal', 'forest', 'amber', 'steel', 'plum', 'olive', 'maroon', 'slate'] as const;
export type TeacherRobeColor = (typeof TEACHER_ROBE_COLORS)[number];

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
  // Every pet currently on this map (a later follow-up ask) — usually
  // just the local player's own, but another player's pet shows too
  // (purely cosmetic to a bystander, only its OWNER can command it).
  pets: PetSnapshot[];
  // Every animated monster currently on this map (a later follow-up
  // ask's animate dead spell) — same "usually just your own, another
  // player's shows too but only they can command it" shape as pets above.
  animatedMonsters: AnimatedMonsterSnapshot[];
  // A later follow-up ask: "the corpses of pets should be selectable..."
  // — a dead pet's own world presence, replacing the live pets array
  // entry the moment it dies (see PetManagerService.getSnapshotsForMap's
  // own alive-only filter) so it can expire instead of lingering forever.
  petCorpses: PetCorpseSnapshot[];
  // The Druid's own Tame Beast spell (a later follow-up ask) — same
  // "usually just your own, another player's shows too but only they can
  // command it" shape as pets/animated monsters above.
  tamedBeasts: TamedBeastSnapshot[];
  // Dropped-item treasure chests (a later follow-up ask) — lootable by
  // anyone, same as a monster corpse.
  droppedChests: DroppedItemChestSnapshot[];
}

export interface PetCommandAck {
  ok: boolean;
  pet?: PetSnapshot;
  message?: string;
}

export interface AnimatedMonsterCommandAck {
  ok: boolean;
  animatedMonster?: AnimatedMonsterSnapshot;
  message?: string;
}

// The 'z' hotkey (a later follow-up ask): "send the monster [follower]
// to auto attack the target" — commands every living pet/animated
// monster the caller owns to approach and attack whichever
// monster/player they currently have selected.
export interface CommandFollowerAttackAck {
  ok: boolean;
  message?: string;
}

// Phase C's "give/equip" ask — shared by giveFollowerItem/takeFollowerItem/
// equipFollowerItem/unequipFollowerItem, all of which just need a plain
// ok/message result (the actual updated follower state arrives via the
// map:state broadcast every one of them also triggers).
export interface FollowerItemAck {
  ok: boolean;
  message?: string;
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
  // Set only on a map transition (a follow-up bug fix: "teachers & desks
  // or training skeletons were visible until I moved") — the server also
  // broadcasts a 'map:state' for the destination room the instant this
  // socket joins it, but that broadcast can race the ack itself (arriving
  // before the client has updated its own currentMap, and so getting
  // silently dropped by applyMapState's "wrong map" guard) — this rides
  // along with the ack instead, so the very first render of the new map
  // is never missing its teachers/NPCs/monsters while waiting on a
  // broadcast that may already have come and gone.
  mapState?: MapStatePayload;
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
  // Item 16: set only when the corpse actually carried gold (grab-all
  // sweeps it up alongside every item) — the client's own displayed gold
  // otherwise wouldn't update until the next unrelated stat-tick sync.
  gold?: number;
  message?: string;
}

// Item 12: dropping an item onto the ground (or merging into an existing
// dropped-item chest within 10 tiles) — see server/worlds/
// dropped-item-manager.service.ts. The chest itself arrives to every
// nearby client through the ordinary map:state broadcast's own
// `droppedChests` field, not through this ack.
export interface DropItemAck {
  ok: boolean;
  inventory?: string[];
  message?: string;
}

// Looting a dropped-item chest (grab-one or grab-all) — same shape as
// LootAck, reused as its own type since a chest disappearing entirely
// once emptied is chest-specific behavior the client needs to react to
// (see droppedChestModal.ts), unlike an ordinary corpse which sticks
// around empty.
export interface LootDroppedChestAck {
  ok: boolean;
  inventory?: string[];
  chestGone?: boolean;
  message?: string;
}

export interface BuyAck {
  ok: boolean;
  inventory?: string[];
  gold?: number;
  // Set only when buying a canteen (a later follow-up ask: "comes fully
  // filled at 6/6") — see game.gateway.ts's handleBuyItem.
  canteenDrinks?: number;
  message?: string;
}

// A later follow-up ask: "sell to vendor" — see server/worlds/vendors.ts's
// sellValueFor.
export interface SellAck {
  ok: boolean;
  inventory?: string[];
  gold?: number;
  message?: string;
}

// Item 17's Bank vendor — deposit is always free; withdrawal charges a
// flat 5% fee (see game.gateway.ts's BANK_WITHDRAWAL_FEE_PERCENT). One
// shared balance regardless of which town's Bank you're standing in.
export interface BankAck {
  ok: boolean;
  gold?: number;
  bankedGold?: number;
  message?: string;
}

// Item 30's Kortho/Floro Inn "Stay and rest" service — a flat 5-gold fee,
// full hp/mana/mv heal on success. The client plays its own 2-second
// black cutscreen (see restCutscene.ts) driven off this ack, not a
// server-side delay.
export interface RestAtInnAck {
  ok: boolean;
  gold?: number;
  hp?: number;
  maxHp?: number;
  mana?: number;
  maxMana?: number;
  mv?: number;
  maxMv?: number;
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
  // The "identify" spell's own result (a later follow-up ask) — present
  // only on a successful cast; the client already has every item's own
  // description/equipment-bonus text locally (see skillMeta.ts/
  // equipment.ts), so the server only needs to confirm which item this
  // was, not resend its description.
  itemLabel?: string;
  // Barrier's own fixed dome origin (a later follow-up ask) — present
  // only on a successful FRESH barrier cast, so the caster's own client
  // can draw the dome centered on the exact server-authoritative cast
  // tile rather than assuming its own (possibly stale) local position.
  barrierOrigin?: { row: number; col: number };
  // Recall's own destination room state (a later follow-up bug fix:
  // "teachers and benches and things didn't show up until I moved" —
  // same race MoveAck's own `mapState` field already fixed for ordinary
  // door/stairs/portal transitions: the room-wide 'map:state' broadcast
  // for the new map can arrive before the client's own 'sync' handler has
  // updated `currentMap` to match, so applyMapState's "wrong map" guard
  // silently drops it. Present only on a successful recall — see
  // game.gateway.ts's handleCastRecall.
  mapState?: MapStatePayload;
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
  mv: number;
  maxMv: number;
  bp: number;
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
  // A later follow-up ask: "when the follower goes and attacks a target
  // the player should begin to auto attack or auto move toward the
  // monster... similar to right clicking" — private to the follower's
  // OWNER (same one-client shape as combatNotice above), telling the
  // client to engage this target the same way a right-click would,
  // fired the moment the follower's own contact starts a brand new
  // player-combat session server-side (see resolveFollowerContact).
  followerEngaged: (data: { targetKind: 'monster' | 'player'; targetId: string }) => void;
}

export interface ClientToServerEvents {
  move: (direction: Direction, ack: (res: MoveAck) => void) => void;
  // Item 1: "move diagonally, e.g. pressing W+A at the same time to go
  // northwest" — a separate event from plain cardinal `move` above (see
  // WorldManagerService.processDiagonalMove's own doc comment for why
  // Direction itself isn't widened to 8 values for this).
  moveDiagonal: (payload: { dRow: -1 | 1; dCol: -1 | 1 }, ack: (res: MoveAck) => void) => void;
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
  // Item 12: drops one inventory item onto the ground beneath the player,
  // creating (or merging into) a dropped-item chest — see
  // dropped-item-manager.service.ts.
  dropItem: (itemIndex: number, ack: (res: DropItemAck) => void) => void;
  lootDroppedChest: (chestId: string, ack: (res: LootDroppedChestAck) => void) => void;
  lootDroppedChestItem: (payload: { chestId: string; itemIndex: number }, ack: (res: LootDroppedChestAck) => void) => void;
  buyItem: (payload: { vendorId: string; itemLabel: string }, ack: (res: BuyAck) => void) => void;
  sellItem: (payload: { vendorId: string; itemIndex: number }, ack: (res: SellAck) => void) => void;
  // Item 17: Kortho's/Floro's own Bank vendor — one shared balance, free
  // deposit, a 5% withdrawal fee. Depositing `amount: undefined` deposits
  // everything currently carried.
  depositGold: (payload: { amount?: number }, ack: (res: BankAck) => void) => void;
  withdrawGold: (payload: { amount?: number }, ack: (res: BankAck) => void) => void;
  // Item 30: Kortho's/Floro's own Inn "Stay and rest" service.
  restAtInn: (ack: (res: RestAtInnAck) => void) => void;
  // Commanding your own pet (a later follow-up ask) — "stay by side,
  // attack, sleep" (plus 'follow', the default the moment it's bought).
  petCommand: (command: PetCommand, ack: (res: PetCommandAck) => void) => void;
  commandFollowerAttack: (
    payload: { targetKind: 'monster' | 'player'; targetId: string },
    ack: (res: CommandFollowerAttackAck) => void
  ) => void;
  // Phase C's own "give/equip" ask — followerId is only needed for an
  // animated monster (an owner can have more than one); a pet needs none
  // (one per owner).
  giveFollowerItem: (
    payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number },
    ack: (res: FollowerItemAck) => void
  ) => void;
  takeFollowerItem: (
    payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number },
    ack: (res: FollowerItemAck) => void
  ) => void;
  equipFollowerItem: (
    payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; itemIndex: number },
    ack: (res: FollowerItemAck) => void
  ) => void;
  unequipFollowerItem: (
    payload: { followerKind: 'pet' | 'animatedMonster'; followerId?: string; slot: FollowerEquipmentSlot },
    ack: (res: FollowerItemAck) => void
  ) => void;
  // Zombie-only: heals 20% hp/mana, see game.gateway.ts's
  // EAT_BRAINS_COOLDOWN_TICKS for the cooldown this starts.
  eatBrains: (corpseId: string, ack: (res: EatBrainsAck) => void) => void;
  // Monster-corpse-only "sacrifice it to the gods" — see
  // game.gateway.ts's handleSacrificeCorpse for the gold formula.
  sacrificeCorpse: (corpseId: string, ack: (res: SacrificeAck) => void) => void;
  // A later follow-up ask: pet corpses — same loot/loot-one/sacrifice
  // shape as the monster-corpse trio above, just against
  // PetCorpseManagerService and restricted to the pet's own owner only
  // (see game.gateway.ts's handleLootPetCorpse/handleLootPetCorpseItem/
  // handleSacrificePetCorpse).
  lootPetCorpse: (corpseId: string, ack: (res: LootAck) => void) => void;
  lootPetCorpseItem: (payload: { corpseId: string; itemIndex: number }, ack: (res: LootAck) => void) => void;
  sacrificePetCorpse: (corpseId: string, ack: (res: SacrificeAck) => void) => void;
  // The classroom/specialization teacher click-to-learn modal (a later
  // follow-up ask replaced the old podium-reading skill system — every
  // readXBook event above it used to occupy this spot); see
  // game.gateway.ts's handleLearnSkill.
  learnSkill: (payload: { skill: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // No-target toggles (a follow-up ask, replacing the old '/lucem' chat
  // command so the result can be toasted even with a modal open) — see
  // game.gateway.ts's handleCastLucem/handleCastCeleritas.
  castLucem: (ack: (res: CastSpellAck) => void) => void;
  castCeleritas: (ack: (res: CastSpellAck) => void) => void;
  // Augue (a later follow-up ask) — unlike the two toggles above, this
  // one needs a target (the only kind this game currently offers is a
  // wild monster); see game.gateway.ts's handleCastAugue.
  castAugue: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // The Elementalist's own 4 bolts (a later follow-up ask) — same target
  // shape as augue above.
  castFireBolt: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  castWaterBolt: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  castAirBolt: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  castEarthBolt: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // Cleric's own lesser heal (a later follow-up ask) — null when the
  // caster has no player currently selected (heals themselves instead).
  castLesserHeal: (payload: AugueTargetPayload | null, ack: (res: CastSpellAck) => void) => void;
  // Druid's own 2 spells (a later follow-up ask) — both no-target.
  castLesserSelfHeal: (ack: (res: CastSpellAck) => void) => void;
  castWispTransformation: (ack: (res: CastSpellAck) => void) => void;
  // Battlemage's own targeted spell (a later follow-up ask) — same
  // target shape as augue/the elemental bolts.
  castKineticStrike: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // Hemomancer's own targeted spell (a later follow-up ask) — same
  // target shape as augue/the elemental bolts/kinetic strike.
  castSapHealth: (payload: AugueTargetPayload, ack: (res: CastSpellAck) => void) => void;
  // The Druid's own Tame Beast (a later follow-up ask) — always a
  // monster target (the only kind a "beast" can be).
  castTameBeast: (payload: { targetId: string }, ack: (res: CastSpellAck) => void) => void;
  // Item 11's Transform spell — no in-world target; `kind` is one of the
  // caster's own tamedBeastKinds, picked from the client's own beast-
  // picker modal.
  castTransform: (payload: { kind: string }, ack: (res: CastSpellAck) => void) => void;
  // The Utility Classroom's own "identify" spell (a later follow-up ask)
  // — targets an inventory item by index, not a player/npc/monster.
  castIdentify: (payload: { itemIndex: number }, ack: (res: CastSpellAck) => void) => void;
  // Same follow/stay/sleep/attack shape as petCommand above, and a plain
  // voluntary permanent release.
  tamedBeastCommand: (command: string, ack: (res: { ok: boolean; message?: string }) => void) => void;
  removeTamedBeast: (ack: (res: { ok: boolean; message?: string }) => void) => void;
  // The Summoner's own monster-summons modal pick (a later follow-up
  // ask) — no target selection needed, just which kind to summon.
  castMonsterSummons: (payload: { monsterKind: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // The Diabolist's own fixed summon (a later follow-up ask) — no
  // payload needed at all.
  castSummonDemonImp: (ack: (res: { ok: boolean; message?: string }) => void) => void;
  // The Illusionist's own 2 spells (a later follow-up ask) — both
  // no-target.
  castInvisibility: (ack: (res: CastSpellAck) => void) => void;
  castCreateDuplicate: (ack: (res: { ok: boolean; message?: string }) => void) => void;
  // Flight (a later follow-up ask, "available to every specialization at
  // level 25") — no-target, same shape as wisp transformation.
  castFlight: (ack: (res: CastSpellAck) => void) => void;
  // The flight spell's own spacebar burst — a discrete forward dash in
  // the caller's current facing direction, same MoveAck-style "always
  // carries the fresh snapshot, ok or not" shape as `move` above, since
  // WorldScene needs the resulting position either way.
  flightBurst: (direction: Direction, ack: (res: { ok: boolean; player: PlayerSnapshot; message?: string }) => void) => void;
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
  castAnimateDead: (payload: { corpseId: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  animatedMonsterCommand: (payload: { id: string; command: PetCommand }, ack: (res: AnimatedMonsterCommandAck) => void) => void;
  // "An option... to 'remove' and get rid of" (a later follow-up ask) —
  // a dedicated event rather than folding into PetCommand, since a real
  // pet is never removable this way (only animated monsters are).
  removeAnimatedMonster: (payload: { id: string }, ack: (res: { ok: boolean; message?: string }) => void) => void;
  // A later follow-up ask reworked recall to a single settable point —
  // no poiId anymore, see shared/recall.ts's own doc comment.
  castRecall: (payload: Record<string, never>, ack: (res: { ok: boolean; message?: string }) => void) => void;
  setRecallPoint: (payload: Record<string, never>, ack: (res: { ok: boolean; message?: string; recallPointId?: string }) => void) => void;
  castBarrier: (ack: (res: { ok: boolean; message?: string }) => void) => void;
  castEnhanceDamage: (ack: (res: CastSpellAck) => void) => void;
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
  mv: number;
  maxMv: number;
  bp: number;
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
  bankedGold: number;
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
  practicePointsAvailable: number;
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
  barrierActive: boolean;
  barrierActiveUntil: number | null;
  // Shaman's "enhance damage" — see PlayerSnapshot's own enhanceDamageActive.
  enhanceDamageActive: boolean;
  enhanceDamageActiveUntil: number | null;
  // Druid's wisp transformation — see PlayerSnapshot's own wispActive.
  wispActive: boolean;
  wispActiveUntil: number | null;
  // Item 11's Transform spell — see PlayerSnapshot's own beastTransformActive.
  beastTransformActive: boolean;
  beastTransformKind: MonsterKind | null;
  beastTransformUntil: number | null;
  // Item 11's own tracking system — every distinct beast kind ever tamed.
  tamedBeastKinds: string[];
  // Illusionist's invisibility — see PlayerSnapshot's own invisibleActive.
  invisibleActive: boolean;
  invisibleActiveUntil: number | null;
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
  // Never persisted — see PlayerSnapshot's own doc comment.
  duplicateActiveUntil: number | null;
  // Flight (a later follow-up ask) — same never-persisted toggle shape as
  // wispActive/wispActiveUntil above. flightBurstReadyAt is the spacebar
  // burst's OWN separate 10-second cooldown clock (epoch-ms it next
  // becomes usable, or null while ready) — deliberately not folded into
  // skillCooldowns since it isn't triggered through the ordinary
  // useSkill/cast flow at all.
  flightActive: boolean;
  flightActiveUntil: number | null;
  flightBurstReadyAt: number | null;
  // Boats (a later follow-up ask) — never persisted (a boat is only ever
  // "worn" while standing in/on water; see PlayerSnapshot's own doc
  // comment). null while on dry land or with no boat item on hand.
  inBoat: 'small' | 'large' | null;
  // The single settable recall point (a later follow-up ask) — persisted;
  // loaded from the player doc on connect. null until the player ever
  // sets one (see shared/recall.ts's RecallPoint/RECALL_POINTS).
  recallPointId: string | null;
  // The 10s respawn countdown (a later follow-up ask) — never persisted,
  // same tradeoff as every other ephemeral toggle here; checked on the
  // same fast tick flight/wisp/etc already expire on (see
  // checkRespawnCountdown).
  respawningUntil: number | null;
  // A minimal player party (a later follow-up ask) — see shared/pvp.ts's
  // own doc comment. Never persisted; rehydrated from GameGateway's own
  // in-memory `parties` map on every fresh connection (that map is itself
  // keyed by username, so it survives a reconnect even though this field
  // doesn't). Other usernames in the caller's own party, excluding
  // themselves.
  party: string[];
  // House/specialization choice (a follow-up ask) — persisted; loaded
  // from the player doc on connect, null until chosen (permanent once
  // set). See PlayerSnapshot's own doc comment for what each gates.
  house: HouseName | null;
  specialization: SpecializationPath | null;
  // Recall's own "have I been there" gate (a later follow-up ask) — see
  // PlayerSnapshot's own doc comment.
  visitedPois: string[];
  // Summoner's own kill-tracking (a later follow-up ask) — see
  // PlayerSnapshot's own doc comment.
  killedMonsterKinds: string[];
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
