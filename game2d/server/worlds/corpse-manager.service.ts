import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName, Race, MonsterKind } from '../../shared/constants.js';
import type { CorpseSnapshot } from '../../shared/types.js';

// Every corpse (player, training dummy, or wild monster) despawns after
// this long — same TTL for all of them now, and the same "Grab all or
// pick items" loot modal client-side (see main.ts).
const CORPSE_TTL_MS = 10 * 60 * 1000;

// The body-part item every corpse always includes, named after whatever
// died — reusing the character's own vocabulary (ears read as
// goblin-ish, bones as skeleton-ish) rather than inventing a whole
// item-definition system for a single guaranteed drop type. A corpse can
// carry additional items too (e.g. a wild skeleton's bone dagger) — see
// game.gateway.ts's death handling, which builds the full items list.
const BODY_PART_LABEL: Record<Race | MonsterKind, string> = {
  goblin: 'goblin ear',
  skeleton: 'skeleton bone',
  hobgoblin: 'hobgoblin ear',
  zombie: 'zombie finger',
  dragonborn: 'dragonborn scale',
  slime: 'slime residue',
  // No combat/death system exists for a human wizard corpse yet, but the
  // lookup must stay total over Race — a plausible placeholder rather
  // than a runtime crash if this is ever reached.
  human: 'lock of hair',
  // Placeholders, like the human entry above — a later follow-up ask
  // added these 4 as playable races, but no PvP/combat-death system
  // targets a player corpse yet for any of them either.
  elf: 'elf ear',
  'half-elf': 'half-elf ear',
  viravis: 'viravis feather',
  pixie: 'pixie dust',
  'wild goblin': 'wild goblin ear',
  'wild skeleton': 'wild skeleton bone',
  // A placeholder, like the human entry above — imp combat/death details
  // ("killing an imp") are still to come.
  imp: 'imp horn',
  // A placeholder too — a Diabolist's demon imp is summon-only (never a
  // wild spawn) and never actually drops a corpse when it dies (see
  // AnimatedMonsterManagerService, which has no corpse-spawning of its
  // own), but the lookup must stay total over MonsterKind.
  'demon imp': 'imp horn',
  'dire wolf': 'dire wolf fang',
  bear: 'bear claw',
  wolf: 'wolf fang',
  moose: 'moose antler',
  falcon: 'falcon feather',
  gobbler: 'gobbler tooth',
  'gobbler necromancer': 'gobbler necromancer bone charm',
  'gobbler warrior': 'gobbler warrior tooth',
  'gobbler chieftain': 'gobbler chieftain tusk',
  'coven witch': 'coven witch hex mark',
  troll: 'troll hide',
  'rune beast': 'rune beast shard',
  'woodland fairy': 'fairy wing',
};

export function bodyPartLabelFor(kind: Race | MonsterKind): string {
  return BODY_PART_LABEL[kind];
}

// Entirely in-memory, same tradeoff as MonsterManagerService — corpses
// reset on server restart. Every corpse despawns after CORPSE_TTL_MS
// regardless of whether it's ever looted (see removeExpired).
@Injectable()
export class CorpseManagerService {
  private corpses = new Map<string, CorpseSnapshot>();
  private expiresAt = new Map<string, number>();

  spawn(
    kind: Race | MonsterKind,
    level: number,
    items: string[],
    mapName: MapName,
    row: number,
    col: number,
    killedBy?: string,
    gold?: number,
    sourceMaxHp?: number,
    sourceAttackDamage?: number,
    isRare?: boolean,
    ownerUsername?: string
  ): CorpseSnapshot {
    const corpse: CorpseSnapshot = {
      id: randomUUID(),
      kind,
      level,
      items,
      gold,
      map: mapName,
      row,
      col,
      killedBy,
      sourceMaxHp,
      sourceAttackDamage,
      isRare,
      ownerUsername,
    };
    this.corpses.set(corpse.id, corpse);
    this.expiresAt.set(corpse.id, Date.now() + CORPSE_TTL_MS);
    return corpse;
  }

  get(id: string): CorpseSnapshot | undefined {
    return this.corpses.get(id);
  }

  // A later follow-up ask: "if the player has a corpse anywhere in the
  // game, that has not faded away due to time limit, tell them where" —
  // only ever set on a player's own death corpse (see
  // spawnPlayerCorpseAndStripGear), so this never matches a monster/NPC
  // corpse. A player can only ever die once at a time, so at most one
  // corpse will ever match a given username.
  findForOwner(ownerUsername: string): CorpseSnapshot | undefined {
    for (const corpse of this.corpses.values()) {
      if (corpse.ownerUsername === ownerUsername) return corpse;
    }
    return undefined;
  }

  remove(id: string): void {
    this.corpses.delete(id);
    this.expiresAt.delete(id);
  }

  // Empties a corpse's item list without removing the corpse itself — a
  // grab-all no longer despawns it early; only its TTL (or, for a
  // monster corpse, sacrificing it) does that now.
  clearItems(id: string): void {
    const corpse = this.corpses.get(id);
    if (!corpse) return;
    corpse.items = [];
    // A follow-up bug fix: a corpse's own flat coin drop (see
    // CorpseSnapshot.gold) was never cleared here, so clicking "grab all"
    // more than once on the same corpse re-granted its gold every time
    // until it expired.
    corpse.gold = 0;
  }

  // Grabs just a corpse's flat gold drop (the loot modal's gold line is
  // now clickable on its own, like any item — see handleLootGold),
  // leaving any remaining items untouched. Returns the amount actually
  // taken (0 if there was none, or it was already grabbed), same
  // "zero it so a second click can't re-grant it" reasoning as
  // clearItems's own gold-clearing.
  takeGold(id: string): number {
    const corpse = this.corpses.get(id);
    if (!corpse || !corpse.gold) return 0;
    const gold = corpse.gold;
    corpse.gold = 0;
    return gold;
  }

  // Removes and returns a single item from a corpse (for "click one item
  // in the loot modal" rather than grab-everything) — the corpse sticks
  // around even once empty, same as clearItems above.
  removeItem(id: string, itemIndex: number): string | undefined {
    const corpse = this.corpses.get(id);
    if (!corpse) return undefined;
    const item = corpse.items[itemIndex];
    if (item === undefined) return undefined;
    corpse.items = [...corpse.items.slice(0, itemIndex), ...corpse.items.slice(itemIndex + 1)];
    return item;
  }

  // Called on the same shared tick as monster wander/respawn — sweeps out
  // any player corpse past its TTL and reports which maps actually lost
  // one, so the caller only has to re-broadcast map:state for those.
  removeExpired(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    const now = Date.now();
    for (const [id, expiry] of this.expiresAt) {
      if (now < expiry) continue;
      const corpse = this.corpses.get(id);
      if (corpse) changedMaps.add(corpse.map);
      this.remove(id);
    }
    return changedMaps;
  }

  getSnapshotsForMap(mapName: MapName): CorpseSnapshot[] {
    return [...this.corpses.values()].filter((c) => c.map === mapName);
  }
}
