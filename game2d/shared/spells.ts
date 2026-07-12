import { CLASSROOM_MID_COL } from './maps.js';
import type { MapName } from './constants.js';

// Spell definitions for the wizarding-school pivot — pure name/description
// data for now ("they will be implemented later functionally"), same
// "data lives in shared/, mechanics come later" status a few skills
// already have (see shared/skills.ts's LESSER_FIRE_RESISTANCE comment).
// "lucem" is the one exception already wired up end to end (see
// shared/skills.ts's LUCEM_SKILL and WorldScene's wand-light handling) —
// every other spell here is inert flavor text a player can read about but
// not yet cast.
export interface SpellDefinition {
  name: string;
  description: string;
}

export const SPELLS: SpellDefinition[] = [
  { name: 'resera', description: 'Unlocks locks and doors.' },
  { name: 'lucem', description: 'Illuminates light from your wand, or puts it out.' },
  { name: 'levare', description: 'Levitates objects.' },
  { name: 'figo', description: 'Fixes broken objects.' },
  { name: 'volatio', description: 'Summons objects to you.' },
  { name: 'exarme', description: "A disarming charm — knocks a weapon from its target's grip." },
  { name: 'scutum', description: 'Conjures a protective shield.' },
  { name: 'stupefaciunt', description: 'Stuns a target.' },
  { name: 'irrigo', description: 'Fills a targeted container — a cup, bowl, canteen, well, or hole — with water.' },
  { name: 'quick movement', description: 'Quickens your own footsteps for a time.' },
];

export function spellDefinition(name: string): SpellDefinition | undefined {
  return SPELLS.find((s) => s.name === name);
}

// The Utilization classroom's spellbook podium — shared so the client
// (where to render/click the podium sprite, and to block movement onto
// it) and the server (the reach check in game.gateway.ts's
// handleReadLucemBook) always agree on where it actually is. Centered on
// the room (CLASSROOM_MID_COL), a few rows south of the teacher (row 2)
// and desk (row 3) it stands in front of — a follow-up correction from
// an earlier off-center placement.
export const LUCEM_BOOK_MAP = 'Utilization' as const;
export const LUCEM_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const LUCEM_BOOK_LABEL = 'Secrets of the light';

// The Elemental Casting classroom's own spellbook podium, teaching irrigo
// — same shape/position convention as the Utilization one above.
export const IRRIGO_BOOK_MAP = 'Elemental Casting' as const;
export const IRRIGO_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const IRRIGO_BOOK_LABEL = 'Secrets of the liquid';

// A second podium standing right next to Utilization's own lucem one (a
// follow-up ask) — offset a few tiles over so both are individually
// reachable (see isWithinRadius's own reach check) without overlapping.
export const QUICK_MOVEMENT_BOOK_MAP = 'Utilization' as const;
export const QUICK_MOVEMENT_BOOK_POSITION = { row: LUCEM_BOOK_POSITION.row, col: LUCEM_BOOK_POSITION.col + 3 };
export const QUICK_MOVEMENT_BOOK_LABEL = 'Secrets of the quick';

// True if (mapName, row, col) is any classroom podium's own tile — a
// single shared collision check (a follow-up ask: "add collision for the
// podiums," plural) so both server collision checkers (world-manager.
// service.ts, monster-manager.service.ts) stay in sync automatically if a
// further podium is ever added here.
export function isPodiumBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName === LUCEM_BOOK_MAP && row === LUCEM_BOOK_POSITION.row && col === LUCEM_BOOK_POSITION.col) return true;
  if (mapName === IRRIGO_BOOK_MAP && row === IRRIGO_BOOK_POSITION.row && col === IRRIGO_BOOK_POSITION.col) return true;
  if (mapName === QUICK_MOVEMENT_BOOK_MAP && row === QUICK_MOVEMENT_BOOK_POSITION.row && col === QUICK_MOVEMENT_BOOK_POSITION.col) return true;
  return false;
}
