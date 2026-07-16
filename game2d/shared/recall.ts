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
];

export function recallPointForMap(mapName: MapName): RecallPoint | undefined {
  return RECALL_POINTS.find((p) => p.visitedOnEnteringMap === mapName);
}

export function recallPointById(id: string): RecallPoint | undefined {
  return RECALL_POINTS.find((p) => p.id === id);
}
