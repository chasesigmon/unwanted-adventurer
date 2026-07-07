import type { MapName, Race } from './constants.js';

// Shapes actually sent over the wire (Socket.io 'sync' event and command
// acks) — kept here since both client and server need to agree on them.
export interface PlayerSnapshot {
  username: string;
  race: Race;
  map: MapName;
  row: number;
  col: number;
  // Base attributes — fixed at 1 for every character right now (no
  // leveling/allocation mechanic yet), but part of the snapshot from the
  // start so the score box/command have somewhere to read them from.
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
  hp: number;
  mana: number;
  movement: number;
  exp: number;
  level: number;
  // Experience needed to reach the next level (level x 100) — derived
  // server-side, not stored; the client uses it purely to size the XP bar.
  maxTnl: number;
  // Permanent abilities, keyed by name with a 1-100 percentage value —
  // gained either from a goblin's level-1 starter kit (dodge/parry/
  // dagger/kick) or from consuming a body part ("lesser undead monster
  // resistance", "lesser <race> resistance"). See players/skills.ts.
  skillLevels: Record<string, number>;
  // Items picked up via "grab"/"get <item>" — see the "inventory" command.
  inventory: string[];
  // Separate from `exp`/leveling — +1 per body part consumed via
  // "consume <item>", regardless of whether the skill roll succeeded.
  consumeExp: number;
  // Earned via "sacrifice" (manual or automatic).
  gold: number;
  // Toggled via "auto sac"/"auto sacrifice" — drives the shaded/unshaded
  // tile in the client's Auto box.
  autoSacrifice: boolean;
}

// A named area of the game world and what it connects to — coarse, no
// per-room detail (that's what the "map" command is for). Returned by the
// "worldmap" command for the client to render in a modal.
export interface WorldMapArea {
  name: MapName;
  rows: number;
  cols: number;
  connectsTo: MapName[];
}

export interface MinimapCell {
  self: boolean;
  inBounds: boolean;
  exit: boolean;
}

// Each grid space is a "room" with its own id, name, and description. For
// now the name is just the map name and the description is derived from
// the map name and position — this is the seam where authored per-room
// content (real names/descriptions) would plug in later without changing
// the wire shape.
export interface RoomInfo {
  id: string;
  name: string;
  description: string;
}
