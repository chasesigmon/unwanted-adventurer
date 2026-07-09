import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName, Race, MonsterKind } from '../../shared/constants.js';
import type { CorpseSnapshot } from '../../shared/types.js';

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
    return corpse;
  }

  get(id: string): CorpseSnapshot | undefined {
    return this.corpses.get(id);
  }

  remove(id: string): void {
    this.corpses.delete(id);
  }

  getSnapshotsForMap(mapName: MapName): CorpseSnapshot[] {
    return [...this.corpses.values()].filter((c) => c.map === mapName);
  }
}
