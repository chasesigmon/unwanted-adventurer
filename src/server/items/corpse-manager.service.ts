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

  // The first corpse at a cell — a thin convenience wrapper around
  // getCorpsesAt for the common single-corpse case.
  getCorpseAt(mapName: MapName, row: number, col: number): Corpse | undefined {
    return this.getCorpsesAt(mapName, row, col)[0];
  }

  // Every corpse at a cell, in a stable order (insertion order, since
  // `corpses` is a Map) — order 1 is whichever landed first. Needed once
  // a room can hold more than one corpse at a time, disambiguated via
  // "N.corpse" (see resolveCorpseAt).
  getCorpsesAt(mapName: MapName, row: number, col: number): Corpse[] {
    const results: Corpse[] = [];
    for (const corpse of this.corpses.values()) {
      if (corpse.mapName === mapName && corpse.row === row && corpse.col === col) {
        results.push(corpse);
      }
    }
    return results;
  }

  // Resolves "corpse"/"cor"/"corp"/"corps" (min 3, partial-matched against
  // the literal word "corpse") to whichever corpse the query refers to —
  // the *first* one at this cell by default, or a specific one via
  // "N.corpse" (1-based, e.g. "2.cor") when the room holds more than one.
  // Used by "l in <query>", "sacrifice <query>", and "grab ... from
  // <query>".
  resolveCorpseAt(mapName: MapName, row: number, col: number, query: string): Corpse | undefined {
    const corpses = this.getCorpsesAt(mapName, row, col);
    if (corpses.length === 0) return undefined;

    const dotIdx = query.indexOf('.');
    const indexPart = dotIdx === -1 ? undefined : query.slice(0, dotIdx);
    const namePart = dotIdx === -1 ? query : query.slice(dotIdx + 1);

    if (namePart.length < 3 || !'corpse'.startsWith(namePart.toLowerCase())) {
      return undefined;
    }

    if (indexPart === undefined) {
      return corpses[0];
    }

    const index = Number(indexPart);
    if (!Number.isInteger(index) || index < 1 || index > corpses.length) {
      return undefined;
    }
    return corpses[index - 1];
  }

  // Partial, case-insensitive match against a corpse's contents at a
  // specific cell — same style as ItemManagerService.findItemByNameAt.
  // `containerQuery` resolves which corpse the same way resolveCorpseAt
  // does (supports "N.corpse" when there's more than one).
  findItemInCorpseAt(
    mapName: MapName,
    row: number,
    col: number,
    containerQuery: string,
    itemQuery: string
  ): { corpse: Corpse; itemName: string } | undefined {
    const corpse = this.resolveCorpseAt(mapName, row, col, containerQuery);
    if (!corpse) return undefined;
    const needle = itemQuery.toLowerCase();
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
