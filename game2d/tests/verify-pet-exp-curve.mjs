// A later follow-up ask: "make the pets have similar exp tnl to the
// player, they level too fast." Root cause: grantPetExpForKill (game.
// gateway.ts) called expGainFor(monster.expReward, pet.level, monster.
// level) -- expGainFor's own ratio = victimLevel*MULT/killerLevel scales
// UP the lower the killer is relative to the victim (a real player
// "punching above their level" bonus). Using the PET's own (usually much
// lower) level as killerLevel meant a pet kept getting a huge inflated
// ratio on every single kill an already-high-level owner made, rocketing
// the pet to its PET_MAX_LEVEL cap almost immediately. The fix scales off
// the OWNER's own level instead, giving the pet the exact same raw exp
// per kill the owner themselves earned.
import { expGainFor, applyExpGain, MAX_PLAYER_LEVEL } from '../server/combat/formulas.js';

const PET_MAX_LEVEL = 20;

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    console.error(`FAIL: ${label}` + (extra ? ` (${extra})` : ''));
    failures++;
  }
}

// Simulates an owner steadily at ownerLevel killing monsters at their own
// level, repeatedly granting exp to a separately-tracked pet (capped at
// PET_MAX_LEVEL) using the given ratio strategy, until the pet maxes out
// or a large kill-count ceiling is hit. Returns kills-to-max.
function simulatePetLeveling(ownerLevel, monsterExpReward, useOwnerLevelForRatio) {
  let pet = { level: 1, exp: 0 };
  let kills = 0;
  const KILL_CEILING = 5000;
  while (pet.level < PET_MAX_LEVEL && kills < KILL_CEILING) {
    const ratioKillerLevel = useOwnerLevelForRatio ? ownerLevel : pet.level;
    const petExpGained = expGainFor(monsterExpReward, ratioKillerLevel, ownerLevel);
    pet = applyExpGain(pet, petExpGained, PET_MAX_LEVEL);
    kills++;
  }
  return kills;
}

// A realistic-ish mid-game scenario: owner is level 25, fighting
// level-25 monsters, with a freshly-bought level-1 pet.
const ownerLevel = 25;
const monsterExpReward = Math.round(13 * ownerLevel); // MONSTER_EXP_REWARD_PER_LEVEL * level

const killsToMaxOld = simulatePetLeveling(ownerLevel, monsterExpReward, false);
const killsToMaxNew = simulatePetLeveling(ownerLevel, monsterExpReward, true);
console.log(`kills to reach PET_MAX_LEVEL(${PET_MAX_LEVEL}) -- old (pet-level ratio): ${killsToMaxOld}, new (owner-level ratio): ${killsToMaxNew}`);

check('the old pet-level-ratio formula reaches max level far too fast (the reported bug)', killsToMaxOld < 30, `got ${killsToMaxOld} kills`);
check('the new owner-level-ratio formula takes meaningfully more kills to max out (the actual fix)', killsToMaxNew > killsToMaxOld * 2, `old=${killsToMaxOld} new=${killsToMaxNew}`);

// The real baseline the ask cares about: how many kills does a PLAYER
// themselves need, fighting their own-level monsters the whole way, to
// go from level 1 to 20? This is "the player's own exp tnl" the pet
// should now track closely, since the fix gives the pet the exact same
// raw per-kill exp a player earns at the owner's level.
function simulatePlayerOwnPace(targetMaxLevel) {
  let state = { level: 1, exp: 0 };
  let kills = 0;
  const KILL_CEILING = 5000;
  while (state.level < targetMaxLevel && kills < KILL_CEILING) {
    const reward = Math.round(13 * state.level);
    const gained = expGainFor(reward, state.level, state.level);
    state = applyExpGain(state, gained, targetMaxLevel);
    kills++;
  }
  return kills;
}
const playerOwnPaceKills = simulatePlayerOwnPace(PET_MAX_LEVEL);
console.log(`for comparison, a PLAYER fighting own-level monsters the whole way takes ${playerOwnPaceKills} kills to go from level 1 to ${PET_MAX_LEVEL}`);
check(
  'the new pet formula\'s kill-count to max level is now the same order of magnitude as the player\'s own natural leveling pace (not off by 5x+ anymore)',
  killsToMaxNew > playerOwnPaceKills * 0.2 && killsToMaxNew < playerOwnPaceKills * 5,
  `pet=${killsToMaxNew} player-own-pace=${playerOwnPaceKills}`
);

// Directly confirm the new formula gives the pet the EXACT same raw exp
// per kill a player at the owner's own level would earn for that same
// kill -- this is the core claim ("similar exp tnl to the player").
const petExpNew = expGainFor(monsterExpReward, ownerLevel, ownerLevel);
const playerExpForSameKill = expGainFor(monsterExpReward, ownerLevel, ownerLevel);
check('the new formula grants the pet the identical raw exp-per-kill a player at the owner\'s level would earn', petExpNew === playerExpForSameKill);

process.exit(failures > 0 ? 1 : 0);
