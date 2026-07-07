import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';

const MONSTER_CORPSE_LIFESPAN_MS = 8 * 60 * 1000;
const PLAYER_CORPSE_LIFESPAN_MS = 10 * 60 * 1000;

export interface Corpse {
  id: string;
  ownerType: 'monster' | 'player';
  // "wild skeleton" for a monster corpse, the username for a player
  // corpse — whatever reads naturally in "The ${label}'s corpse lies here."
  label: string;
  level: number;
  mapName: MapName;
  row: number;
  col: number;
  items: string[];
}

// In-memory only, same as ItemManagerService/MonsterManagerService — a
// corpse and everything inside it vanish entirely once its timer fires
// (never persisted), consistent with nothing else in the world surviving
// a server restart either. Monster corpses last 8 minutes and hold
// whatever non-body-part loot dropped (body parts themselves go straight
// on the ground, never into a corpse — see GameGateway
// .resolveAttackExchange); player corpses last 10 minutes and hold
// everything the player had equipped and carried.
@Injectable()
export class CorpseManagerService implements OnModuleDestroy {
  private readonly corpses = new Map<string, Corpse>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private nextId = 1;

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  private schedule(id: string, lifespanMs: number): void {
    const timer = setTimeout(() => this.removeCorpse(id), lifespanMs);
    timer.unref();
    this.timers.set(id, timer);
  }

  createMonsterCorpse(label: string, level: number, mapName: MapName, row: number, col: number, items: string[]): Corpse {
    const id = `corpse-${this.nextId++}`;
    const corpse: Corpse = { id, ownerType: 'monster', label, level, mapName, row, col, items };
    this.corpses.set(id, corpse);
    this.schedule(id, MONSTER_CORPSE_LIFESPAN_MS);
    return corpse;
  }

  createPlayerCorpse(username: string, level: number, mapName: MapName, row: number, col: number, items: string[]): Corpse {
    const id = `corpse-${this.nextId++}`;
    const corpse: Corpse = { id, ownerType: 'player', label: username, level, mapName, row, col, items };
    this.corpses.set(id, corpse);
    this.schedule(id, PLAYER_CORPSE_LIFESPAN_MS);
    return corpse;
  }

  // Just the first corpse at a cell — two corpses landing in the exact
  // same cell at once is a rare edge case with no ordering concept to get
  // right if it happened, same reasoning as ItemManagerService.getItemAt
  // originally had for items.
  getCorpseAt(mapName: MapName, row: number, col: number): Corpse | undefined {
    for (const corpse of this.corpses.values()) {
      if (corpse.mapName === mapName && corpse.row === row && corpse.col === col) {
        return corpse;
      }
    }
    return undefined;
  }

  // Partial, case-insensitive match against a corpse's contents at a
  // specific cell — same style as ItemManagerService.findItemByNameAt.
  findItemInCorpseAt(
    mapName: MapName,
    row: number,
    col: number,
    query: string
  ): { corpse: Corpse; itemName: string } | undefined {
    const corpse = this.getCorpseAt(mapName, row, col);
    if (!corpse) return undefined;
    const needle = query.toLowerCase();
    const itemName = corpse.items.find((name) => name.toLowerCase().includes(needle));
    return itemName ? { corpse, itemName } : undefined;
  }

  removeItemFromCorpse(corpseId: string, itemName: string): void {
    const corpse = this.corpses.get(corpseId);
    if (!corpse) return;
    const index = corpse.items.indexOf(itemName);
    if (index !== -1) corpse.items.splice(index, 1);
  }

  addItemToCorpse(corpseId: string, itemName: string): void {
    this.corpses.get(corpseId)?.items.push(itemName);
  }

  // Removes the corpse and everything in it — used both by natural expiry
  // (the timer above) and "sacrifice"/auto-sacrifice (which redistribute
  // the items elsewhere *before* calling this, so nothing is silently
  // lost in that path).
  removeCorpse(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.corpses.delete(id);
  }

  getAll(): Corpse[] {
    return Array.from(this.corpses.values());
  }
}
