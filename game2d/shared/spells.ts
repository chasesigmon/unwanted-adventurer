import { CLASSROOM_MID_COL, CAVERNA_CHEST_POSITION } from './maps.js';
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
  { name: 'exarme', description: "A disarming charm — knocks a weapon from its target's grip." },
  { name: 'scutum', description: 'Conjures a protective shield.' },
  { name: 'stupefaciunt', description: 'Stuns a target.' },
  { name: 'irrigo', description: 'Fills a targeted container — a cup, bowl, canteen, well, or hole — with water.' },
  { name: 'celeritas', description: 'Quickens your own footsteps for a time.' },
  { name: 'augue', description: 'Hurls a bolt of flame at a target.' },
  { name: 'murus lapideus', description: 'Summons a stone block to absorb hits and draw aggro.' },
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
export const LUCEM_BOOK_MAP = 'Utility Classroom' as const;
export const LUCEM_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const LUCEM_BOOK_LABEL = 'Secrets of the light';

// The Elemental Casting classroom's own spellbook podium, teaching irrigo
// — same shape/position convention as the Utilization one above.
export const IRRIGO_BOOK_MAP = 'Elemental Casting Classroom' as const;
export const IRRIGO_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const IRRIGO_BOOK_LABEL = 'Secrets of the liquid';

// A second podium standing right next to Utilization's own lucem one (a
// follow-up ask) — offset a few tiles over so both are individually
// reachable (see isWithinRadius's own reach check) without overlapping.
export const CELERITAS_BOOK_MAP = 'Utility Classroom' as const;
export const CELERITAS_BOOK_POSITION = { row: LUCEM_BOOK_POSITION.row, col: LUCEM_BOOK_POSITION.col + 3 };
export const CELERITAS_BOOK_LABEL = 'Secrets of the quick';

// A THIRD podium in the same room (a later follow-up ask), teaching
// resera — offset further still so all three stay individually reachable.
export const RESERA_BOOK_MAP = 'Utility Classroom' as const;
export const RESERA_BOOK_POSITION = { row: LUCEM_BOOK_POSITION.row, col: LUCEM_BOOK_POSITION.col + 6 };
export const RESERA_BOOK_LABEL = 'Secrets of the lock';

// The Offense classroom's own spellbook podium, teaching augue — same
// shape/position convention as the others above.
export const AUGUE_BOOK_MAP = 'Offense Classroom' as const;
export const AUGUE_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const AUGUE_BOOK_LABEL = 'Secrets of the flame';

// Offense's second and third podiums (a later follow-up ask), teaching
// stupefaciunt and exarme — offset the same way Utility's own extra
// podiums are.
export const STUPEFACIUNT_BOOK_MAP = 'Offense Classroom' as const;
export const STUPEFACIUNT_BOOK_POSITION = { row: AUGUE_BOOK_POSITION.row, col: AUGUE_BOOK_POSITION.col + 3 };
export const STUPEFACIUNT_BOOK_LABEL = 'Secrets of the still';
export const EXARME_BOOK_MAP = 'Offense Classroom' as const;
export const EXARME_BOOK_POSITION = { row: AUGUE_BOOK_POSITION.row, col: AUGUE_BOOK_POSITION.col + 6 };
export const EXARME_BOOK_LABEL = 'Secrets of the clumsy';

// The Defense classroom's own podium (a later follow-up ask), teaching
// scutum.
export const SCUTUM_BOOK_MAP = 'Defense Classroom' as const;
export const SCUTUM_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const SCUTUM_BOOK_LABEL = 'Secrets of the shield';

// The Summoning classroom's own podium (a later follow-up ask), teaching
// murus lapideus.
export const MURUS_LAPIDEUS_BOOK_MAP = 'Summoning Classroom' as const;
export const MURUS_LAPIDEUS_BOOK_POSITION = { row: 6, col: CLASSROOM_MID_COL };
export const MURUS_LAPIDEUS_BOOK_LABEL = 'Secrets of the stone';

// True if (mapName, row, col) is any classroom podium's own tile — a
// single shared collision check (a follow-up ask: "add collision for the
// podiums," plural) so both server collision checkers (world-manager.
// service.ts, monster-manager.service.ts) stay in sync automatically if a
// further podium is ever added here.
export function isPodiumBlocked(mapName: MapName, row: number, col: number): boolean {
  if (mapName === LUCEM_BOOK_MAP && row === LUCEM_BOOK_POSITION.row && col === LUCEM_BOOK_POSITION.col) return true;
  if (mapName === IRRIGO_BOOK_MAP && row === IRRIGO_BOOK_POSITION.row && col === IRRIGO_BOOK_POSITION.col) return true;
  if (mapName === CELERITAS_BOOK_MAP && row === CELERITAS_BOOK_POSITION.row && col === CELERITAS_BOOK_POSITION.col) return true;
  if (mapName === AUGUE_BOOK_MAP && row === AUGUE_BOOK_POSITION.row && col === AUGUE_BOOK_POSITION.col) return true;
  if (mapName === RESERA_BOOK_MAP && row === RESERA_BOOK_POSITION.row && col === RESERA_BOOK_POSITION.col) return true;
  if (mapName === STUPEFACIUNT_BOOK_MAP && row === STUPEFACIUNT_BOOK_POSITION.row && col === STUPEFACIUNT_BOOK_POSITION.col) return true;
  if (mapName === EXARME_BOOK_MAP && row === EXARME_BOOK_POSITION.row && col === EXARME_BOOK_POSITION.col) return true;
  if (mapName === SCUTUM_BOOK_MAP && row === SCUTUM_BOOK_POSITION.row && col === SCUTUM_BOOK_POSITION.col) return true;
  if (mapName === MURUS_LAPIDEUS_BOOK_MAP && row === MURUS_LAPIDEUS_BOOK_POSITION.row && col === MURUS_LAPIDEUS_BOOK_POSITION.col) return true;
  return false;
}

// The secret room's treasure chest (a follow-up ask) — a solid object
// either way regardless of its own per-player lock state (see
// client.data.secretChestUnlocked), so this is a plain position check,
// same shape as isPodiumBlocked.
export function isChestBlocked(mapName: MapName, row: number, col: number): boolean {
  return mapName === 'Caverna Secretissima' && row === CAVERNA_CHEST_POSITION.row && col === CAVERNA_CHEST_POSITION.col;
}
