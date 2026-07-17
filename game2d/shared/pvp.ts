// Player-vs-player combat (a later follow-up ask: "make it so that player
// killing is possible, but not until the player is level 10 and also they
// can only attack/kill players that are level 10 or higher... Grimoak
// Castle is fully non player killing") — PvP damage itself already existed
// mechanically (see game.gateway.ts's resolveHitOnPlayer, reachable only
// through a melee punch/weapon-skill swing against an adjacent player;
// ranged spells explicitly reject a player target), just with none of
// these restrictions wired in yet. Shared so both the server's own gate
// (engageInDirection/resolveHitOnPlayer) and the client's cursor-hover hint
// (WorldScene's pointermove handler) agree on the same rules.
import type { MapName } from './constants.js';
import { GRIMOAK_CASTLE_MAPS } from './constants.js';

export const PVP_MIN_LEVEL = 10;

// A minimal player party (a later follow-up ask's own "not in their
// group" exemption needed an actual multi-player group concept to exist
// first — see game.gateway.ts's own doc comment on `parties` for why this
// is a from-scratch, PvP-exemption-only feature rather than a fuller
// shared-exp/loot system).
export const PARTY_MAX_SIZE = 6;
export const PARTY_INVITE_TTL_MS = 60 * 1000;

export function isPvpAllowedMap(mapName: MapName): boolean {
  return !(GRIMOAK_CASTLE_MAPS as readonly string[]).includes(mapName);
}
