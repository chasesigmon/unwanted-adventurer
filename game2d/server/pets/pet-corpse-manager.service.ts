import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import type { PetKind } from '../../shared/pets.js';
import { PET_CORPSE_TTL_MS, type PetCorpseSnapshot } from '../../shared/pets.js';

// A later follow-up ask: "the corpses of pets should be selectable and
// should open a modal so that the player can grab any items or equipment
// the pet had and the pet should be sacrificable" — same entirely-
// in-memory, TTL-expiring shape as CorpseManagerService (see that file's
// own doc comment), kept as its own separate manager rather than folded
// into it since a pet corpse's own kind/ownership/sacrifice rules don't
// fit that one's Race | MonsterKind-shaped, killedBy-gated design at all.
@Injectable()
export class PetCorpseManagerService {
  private corpses = new Map<string, PetCorpseSnapshot>();
  private expiresAt = new Map<string, number>();

  spawn(
    ownerUsername: string,
    name: string,
    kind: PetKind,
    level: number,
    items: string[],
    mapName: MapName,
    row: number,
    col: number
  ): PetCorpseSnapshot {
    const corpse: PetCorpseSnapshot = {
      id: randomUUID(),
      ownerUsername,
      name,
      kind,
      level,
      map: mapName,
      row,
      col,
      items,
    };
    this.corpses.set(corpse.id, corpse);
    this.expiresAt.set(corpse.id, Date.now() + PET_CORPSE_TTL_MS);
    return corpse;
  }

  get(id: string): PetCorpseSnapshot | undefined {
    return this.corpses.get(id);
  }

  remove(id: string): void {
    this.corpses.delete(id);
    this.expiresAt.delete(id);
  }

  // Same "sticks around even once empty" shape as CorpseManagerService's
  // own clearItems — only sacrificing (or the TTL) actually removes a
  // pet corpse once its items are gone.
  clearItems(id: string): void {
    const corpse = this.corpses.get(id);
    if (!corpse) return;
    corpse.items = [];
  }

  removeItem(id: string, itemIndex: number): string | undefined {
    const corpse = this.corpses.get(id);
    if (!corpse) return undefined;
    const item = corpse.items[itemIndex];
    if (item === undefined) return undefined;
    corpse.items = [...corpse.items.slice(0, itemIndex), ...corpse.items.slice(itemIndex + 1)];
    return item;
  }

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

  getSnapshotsForMap(mapName: MapName): PetCorpseSnapshot[] {
    return [...this.corpses.values()].filter((c) => c.map === mapName);
  }
}
