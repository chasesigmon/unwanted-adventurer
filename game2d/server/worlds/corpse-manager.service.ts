import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { RACES, type MapName, type Race, type MonsterKind } from '../../shared/constants.js';
import type { CorpseSnapshot } from '../../shared/types.js';

// Player (and the training dummy, which counts as "a player" for combat
// purposes — see game.gateway.ts) corpses despawn after this long; wild
// monster corpses have no TTL at all, same as before, until looted.
const PLAYER_CORPSE_TTL_MS = 10 * 60 * 1000;

// The body-part item every corpse always includes, named after whatever
// died — reusing the character's own vocabulary (ears read as
// goblin-ish, bones as skeleton-ish) rather than inventing a whole
// item-definition system for a single guaranteed drop type. A corpse can
// carry additional items too (e.g. a wild skeleton's bone dagger) — see
// game.gateway.ts's death handling, which builds the full items list.
const BODY_PART_LABEL: Record<Race | MonsterKind, string> = {
  goblin: 'goblin ear',
  skeleton: 'skeleton bone',
  'wild goblin': 'wild goblin ear',
  'wild skeleton': 'wild skeleton bone',
};

export function bodyPartLabelFor(kind: Race | MonsterKind): string {
  return BODY_PART_LABEL[kind];
}

// Entirely in-memory, same tradeoff as MonsterManagerService — corpses
// reset on server restart. There's no despawn timer; they sit until
// looted (or forever, for this project's scope).
@Injectable()
export class CorpseManagerService {
  private corpses = new Map<string, CorpseSnapshot>();
  private expiresAt = new Map<string, number>();

  spawn(kind: Race | MonsterKind, items: string[], mapName: MapName, row: number, col: number): CorpseSnapshot {
    const corpse: CorpseSnapshot = {
      id: randomUUID(),
      kind,
      items,
      map: mapName,
      row,
      col,
    };
    this.corpses.set(corpse.id, corpse);
    if ((RACES as readonly string[]).includes(kind)) {
      this.expiresAt.set(corpse.id, Date.now() + PLAYER_CORPSE_TTL_MS);
    }
    return corpse;
  }

  get(id: string): CorpseSnapshot | undefined {
    return this.corpses.get(id);
  }

  remove(id: string): void {
    this.corpses.delete(id);
    this.expiresAt.delete(id);
  }

  // Removes and returns a single item from a corpse (for "click one item
  // in the loot modal" rather than grab-everything) — the corpse itself
  // disappears once its last item is taken.
  removeItem(id: string, itemIndex: number): string | undefined {
    const corpse = this.corpses.get(id);
    if (!corpse) return undefined;
    const item = corpse.items[itemIndex];
    if (item === undefined) return undefined;
    corpse.items = [...corpse.items.slice(0, itemIndex), ...corpse.items.slice(itemIndex + 1)];
    if (corpse.items.length === 0) this.remove(id);
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
