import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import type { DroppedItemChestSnapshot } from '../../shared/types.js';

// A later follow-up ask: "if a player drops an item on the ground that a
// treasure chest appears that contains the item... upon removing all
// items from a treasure chest that appears from dropped items, it should
// completely disappear. If a player drops multiple items in the same
// spot or within 10 feet of an already existing treasure chest, then
// those items should also go into that existing treasure chest." Plain
// in-memory, not persisted — same tradeoff every other world-content
// manager here (monsters, ordinary corpses) already makes.
const MERGE_RADIUS_TILES = 10;

@Injectable()
export class DroppedItemManagerService {
  private chests = new Map<string, DroppedItemChestSnapshot>();

  // Finds an existing chest within MERGE_RADIUS_TILES on the same map, if
  // any — merging into the CLOSEST one if more than one qualifies.
  private findMergeableChest(mapName: MapName, row: number, col: number): DroppedItemChestSnapshot | undefined {
    let best: DroppedItemChestSnapshot | undefined;
    let bestDist = Infinity;
    for (const chest of this.chests.values()) {
      if (chest.map !== mapName) continue;
      const dist = Math.max(Math.abs(chest.row - row), Math.abs(chest.col - col));
      if (dist <= MERGE_RADIUS_TILES && dist < bestDist) {
        best = chest;
        bestDist = dist;
      }
    }
    return best;
  }

  dropItem(mapName: MapName, row: number, col: number, item: string): DroppedItemChestSnapshot {
    const existing = this.findMergeableChest(mapName, row, col);
    if (existing) {
      existing.items = [...existing.items, item];
      return existing;
    }
    const chest: DroppedItemChestSnapshot = { id: randomUUID(), map: mapName, row, col, items: [item] };
    this.chests.set(chest.id, chest);
    return chest;
  }

  getChest(id: string): DroppedItemChestSnapshot | undefined {
    return this.chests.get(id);
  }

  // Takes ONE item out by index — the chest disappears outright once its
  // last item is gone (see this file's own doc comment).
  takeItem(id: string, itemIndex: number): { item: string; chestGone: boolean } | undefined {
    const chest = this.chests.get(id);
    if (!chest) return undefined;
    const item = chest.items[itemIndex];
    if (item === undefined) return undefined;
    chest.items = chest.items.filter((_, i) => i !== itemIndex);
    const chestGone = chest.items.length === 0;
    if (chestGone) this.chests.delete(id);
    return { item, chestGone };
  }

  takeAll(id: string): string[] | undefined {
    const chest = this.chests.get(id);
    if (!chest) return undefined;
    const items = chest.items;
    this.chests.delete(id);
    return items;
  }

  getSnapshotsForMap(mapName: MapName): DroppedItemChestSnapshot[] {
    const snapshots: DroppedItemChestSnapshot[] = [];
    for (const chest of this.chests.values()) {
      if (chest.map === mapName) snapshots.push({ ...chest });
    }
    return snapshots;
  }
}
