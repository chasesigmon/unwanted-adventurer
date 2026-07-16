import { CAVERNA_CHEST_POSITION } from './maps.js';
import type { MapName } from './constants.js';

// Spell definitions for the wizarding-school pivot — pure name/description
// data for the Spells modal's read-only reference list. A later follow-up
// ask renamed every spell away from Latin (each name here doubles as its
// own skill key in shared/skills.ts, so these strings must match those
// constants' values exactly).
export interface SpellDefinition {
  name: string;
  description: string;
}

export const SPELLS: SpellDefinition[] = [
  { name: 'unlock', description: 'Unlocks locks and doors.' },
  { name: 'light', description: 'Illuminates light from your wand, or puts it out.' },
  { name: 'disarm', description: "A disarming charm — knocks a weapon from its target's grip." },
  { name: 'aegis', description: 'Conjures a protective shield.' },
  { name: 'stun', description: 'Stuns a target.' },
  { name: 'waterfill', description: 'Fills a targeted container — a cup, bowl, canteen, well, or hole — with water.' },
  { name: 'haste', description: 'Quickens your own footsteps for a time.' },
  { name: 'arcane bolt', description: 'Hurls a bolt of arcane magic at a target.' },
  { name: 'stone wall', description: 'Summons a stone block to absorb hits and draw aggro.' },
];

export function spellDefinition(name: string): SpellDefinition | undefined {
  return SPELLS.find((s) => s.name === name);
}

// A later follow-up ask removed the podium/spellbook system entirely (see
// game.gateway.ts's handleLearnSkill for the teacher click-to-learn modal
// that replaced it) — every *_BOOK_MAP/POSITION/LABEL constant and
// isPodiumBlocked that used to live here are gone with it.

// The secret room's treasure chest (a follow-up ask) — a solid object
// either way regardless of its own per-player lock state (see
// client.data.secretChestUnlocked), so this is a plain position check,
// same shape as isPodiumBlocked.
export function isChestBlocked(mapName: MapName, row: number, col: number): boolean {
  return mapName === 'Caverna Secretissima' && row === CAVERNA_CHEST_POSITION.row && col === CAVERNA_CHEST_POSITION.col;
}
