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
};

export function bodyPartLabelFor(kind: Race | MonsterKind): string {
  return BODY_PART_LABEL[kind];
}

// The reverse of BODY_PART_LABEL — which race/monster-kind a given
// consumed item's body part came from, if any (a weapon a corpse also
// carried, like a wild skeleton's bone dagger, correctly has no entry
// here). Backs the slime mimic skill (see game.gateway.ts's applyConsume).
const RACE_FOR_BODY_PART = new Map<string, Race | MonsterKind>(
  (Object.entries(BODY_PART_LABEL) as Array<[Race | MonsterKind, string]>).map(([kind, label]) => [label, kind])
);

export function raceForBodyPart(item: string): (Race | MonsterKind) | undefined {
  return RACE_FOR_BODY_PART.get(item);
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
    sourceAttackDamage?: number
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
    };
    this.corpses.set(corpse.id, corpse);
    this.expiresAt.set(corpse.id, Date.now() + CORPSE_TTL_MS);
    return corpse;
  }

  get(id: string): CorpseSnapshot | undefined {
    return this.corpses.get(id);
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
