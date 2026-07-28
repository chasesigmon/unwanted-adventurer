// The first-person mode's own "must actually be aimed at the target"
// combat rule (a big follow-up ask) — only ever consulted while
// SocketData.firstPerson is true (see game.gateway.ts's own insertion
// points: combatTick's ranged branch, castAugue, resolveElementalBolt,
// castSapHealth, castStupefaciunt, castExarme); normal top-down combat
// never calls this at all and stays exactly as it always has.
//
// Same angle convention as client/game/mapRender.ts's own first-person
// raycaster (0 = facing screen-"north"/-row, increasing clockwise toward
// +col/"east" — i.e. direction vector (sin(angle), -cos(angle))) so the
// player's aim always lines up with what they actually see rendered,
// rather than the two drifting apart from using different conventions.

// How far off dead-center (in radians, each side) a target can still be
// considered "aimed at" — generous enough that mouse-look aiming feels
// responsive rather than pixel-precise, tight enough that actually
// pointing at the enemy is a meaningful requirement. ~14 degrees.
export const AIM_TOLERANCE_RAD = 0.25;

export function isAimedAtTarget(fromRow: number, fromCol: number, facingAngle: number, toRow: number, toCol: number, toleranceRad: number = AIM_TOLERANCE_RAD): boolean {
  const dRow = toRow - fromRow;
  const dCol = toCol - fromCol;
  // Already standing on the same tile (shouldn't normally happen for a
  // ranged/spell target, but not this function's job to reject) — treat
  // as aimed, there's no meaningful direction to be wrong about.
  if (dRow === 0 && dCol === 0) return true;
  const targetAngle = Math.atan2(dCol, -dRow);
  let delta = targetAngle - facingAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= toleranceRad;
}
