// Recall's own points of interest (a later follow-up ask's Utility
// Classroom spell) — "any major point of interest that they have already
// visited (Grimoak Castle, and Bramwick so far)". Landing spot for each
// reuses startingPositionFor's own map-center fallback (shared/maps.ts) —
// the same "just the middle of the place" default every map without a
// bespoke spawn point already gets.
import type { MapName } from './constants.js';

export interface RecallPoint {
  id: string;
  label: string;
  // Entering this exact map marks the point of interest visited (see
  // game.gateway.ts's handleMove) — not necessarily the same map recall
  // lands the player back on, though today it is for both.
  visitedOnEnteringMap: MapName;
  landingMap: MapName;
}

export const RECALL_POINTS: RecallPoint[] = [
  { id: 'grimoak-castle', label: 'Grimoak Castle', visitedOnEnteringMap: 'Grimoak Entrance Hall', landingMap: 'Grimoak Entrance Hall' },
  { id: 'bramwick', label: 'Bramwick', visitedOnEnteringMap: 'Bramwick', landingMap: 'Bramwick' },
  // A later follow-up ask: "travelling to Floro/Kortho adds it to the
  // player's recall list" — same "first time you set foot there" gate as
  // every other point of interest above. Landing spot is each town's own
  // bespoke entrance-street position (see startingPositionFor), not the
  // generic map-center fallback, which now sits inside a shop's own
  // building collision.
  { id: 'kortho', label: 'Kortho', visitedOnEnteringMap: 'Kortho', landingMap: 'Kortho' },
  { id: 'floro', label: 'Floro', visitedOnEnteringMap: 'Floro', landingMap: 'Floro' },
];

export function recallPointForMap(mapName: MapName): RecallPoint | undefined {
  return RECALL_POINTS.find((p) => p.visitedOnEnteringMap === mapName);
}

export function recallPointById(id: string): RecallPoint | undefined {
  return RECALL_POINTS.find((p) => p.id === id);
}
