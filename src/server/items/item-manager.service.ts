import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import type { DroppedItem, ItemSkillReward } from './dropped-item.js';

// In-memory only, same as MonsterManagerService — items dropped by killed
// monsters live only as long as the server process does.
@Injectable()
export class ItemManagerService {
  private readonly items = new Map<string, DroppedItem>();
  private nextId = 1;

  dropItem(name: string, mapName: MapName, row: number, col: number, skill?: ItemSkillReward): DroppedItem {
    const id = `item-${this.nextId++}`;
    const item: DroppedItem = { id, name, mapName, row, col, skill };
    this.items.set(id, item);
    return item;
  }

  removeItem(id: string): boolean {
    return this.items.delete(id);
  }

  // Every item at a cell — a single kill can drop more than one (e.g. a
  // body part plus a bone dagger), and both need to actually be visible
  // (itemMessageFor/"look"), not just whichever happened to be first.
  getItemsAt(mapName: MapName, row: number, col: number): DroppedItem[] {
    const results: DroppedItem[] = [];
    for (const item of this.items.values()) {
      if (item.mapName === mapName && item.row === row && item.col === col) {
        results.push(item);
      }
    }
    return results;
  }

  // Partial, case-insensitive match against the item's name — "consume
  // leg" and "consume l" both find a dropped leg in the given cell. Same
  // matching style as MonsterManagerService.findMonsterByNameAt.
  findItemByNameAt(mapName: MapName, row: number, col: number, query: string): DroppedItem | undefined {
    const needle = query.toLowerCase();
    for (const item of this.items.values()) {
      if (item.mapName === mapName && item.row === row && item.col === col && item.name.toLowerCase().includes(needle)) {
        return item;
      }
    }
    return undefined;
  }

  getAll(): DroppedItem[] {
    return Array.from(this.items.values());
  }
}
