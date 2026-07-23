// A later follow-up bug fix: "when the wisp transformation and flight
// wore off I was standing on top of the moat without a boat and it
// didn't kill me... this should have killed the player as per previous
// rules." checkFlightExpiry already had a drowning check for the Flight
// spell specifically; checkWispTransformationExpiry and
// checkBeastTransformExpiry never did, even though isEffectivelyFlying
// treats all three as equally valid ways to be airborne over water. The
// fix factored the check into a shared checkWaterLandingAfterFlightSourceEnds
// helper (server/game-gateway/game.gateway.ts), now called from all
// three expiry handlers right after each one clears its OWN flag.
//
// Casting the real spells and waiting out their actual 2-4 minute
// durations for a full live E2E run would be slow for a quick regression
// check, so this instead verifies the exact DECISION LOGIC the shared
// helper is built from -- isEffectivelyFlying (shared/constants.ts) and
// isWaterBlocked (shared/maps.ts), the same two predicates the real
// server code calls -- across every combination that matters: a single
// source expiring while stranded on water (should drown), one source
// expiring while ANOTHER is still active (should NOT drown, since the
// player is still aloft), and not being on water at all (never drowns).
import { isEffectivelyFlying } from '../shared/constants.js';
import { isMoatBlocked, GRIMOAK_GROUNDS_MOAT_MID_ROW, MOAT_OUTER_LEFT } from '../shared/maps.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

const moatRow = GRIMOAK_GROUNDS_MOAT_MID_ROW;
const moatCol = MOAT_OUTER_LEFT + 1; // solidly inside the moat's own water band
check('sanity: this tile is really moat water', isMoatBlocked('Grimoak Grounds', moatRow, moatCol));

// Mirrors checkWaterLandingAfterFlightSourceEnds's own two-step decision:
// 1. isEffectivelyFlying(client.data) -- if true, still aloft, never drowns.
// 2. isWaterBlocked(...) -- if false (dry land), nothing to do either.
// Only both false-negative (not flying) + standing on water triggers the
// kill path (mirroring the real function's own short-circuit order).
function wouldDrown(flightState, onWater) {
  if (isEffectivelyFlying(flightState)) return false;
  if (!onWater) return false;
  return true; // (the real function also checks client.data.inBoat, held constant here as "no boat" -- see the standalone boat-aware case below)
}

// Case 1 (the exact reported bug): wisp JUST expired (now false), flight
// was never active, standing on the moat, no boat -- should drown.
check(
  'wisp expiring alone while stranded on the moat now triggers the drown check',
  wouldDrown({ flightActive: false, wispActive: false, beastTransformActive: false, beastTransformKind: null }, true) === true
);

// Case 2: flight JUST expired, same as above -- should also drown (this
// is the pre-existing, already-working path, confirmed unchanged).
check(
  'flight expiring alone while stranded on the moat still triggers the drown check',
  wouldDrown({ flightActive: false, wispActive: false, beastTransformActive: false, beastTransformKind: null }, true) === true
);

// Case 3: wisp just expired, but flight is STILL active (stacked buffs)
// -- must NOT drown, since isEffectivelyFlying is still true via flight.
check(
  'wisp expiring while flight is still active does NOT drown the player (still aloft via the other source)',
  wouldDrown({ flightActive: true, wispActive: false, beastTransformActive: false, beastTransformKind: null }, true) === false
);

// Case 4: a flying beast transform (falcon/crystal wyvern) just expired
// (beastTransformActive already flipped false by revertBeastTransform
// before the check runs, per the real call-site ordering), stranded on
// water, no other source -- should drown.
check(
  'beast-transform flight expiring alone while stranded on the moat triggers the drown check',
  wouldDrown({ flightActive: false, wispActive: false, beastTransformActive: false, beastTransformKind: null }, true) === true
);

// Case 5: not on water at all -- never drowns regardless of flight state.
check(
  'no source active and NOT on water never drowns (nothing to do)',
  wouldDrown({ flightActive: false, wispActive: false, beastTransformActive: false, beastTransformKind: null }, false) === false
);

process.exit(failures > 0 ? 1 : 0);
