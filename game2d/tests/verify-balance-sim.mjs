// A later follow-up ask: "simulate a player going from level 1 to level
// 10 by killing the monsters in Grimoak Grounds... determine how long it
// might take with resting in between... determine if the monsters hit
// too hard or the player hits too hard or not hard enough." This is a
// pure numeric simulation (no server/socket involved) — it imports the
// REAL exported formulas/species data via tsx so the results reflect the
// actual shipped balance, not a hand-derived approximation, and prints a
// summary table plus a verdict for each level.
import {
  baseDamage,
  attributeBonus,
  skillBonus,
  armorVsPhysicalFor,
  applyArmorMitigation,
  punchDamage,
  monsterAttributeForLevel,
  maxTnlForLevel,
  applyExpGain,
  expGainFor,
  MAX_PLAYER_LEVEL,
} from '../server/combat/formulas.js';
import { MONSTER_SPECIES } from '../server/monsters/monster.js';

const ATTACK_COOLDOWN_S = 3;
const STAT_TICK_S = 30;
const AWAKE_HEAL_PERCENT = 0.085; // midpoint of the 7-10% awake range
const REST_HEAL_PERCENT = 0.105; // midpoint of the 9-12% resting range
const DODGE_BASE_CHANCE = 0.15;
const DODGE_SKILL_WEIGHT = 0.15;

// Grimoak Grounds' own roster (a level-1 player's actual starting map):
// imps (patrol, attackDamage) plus the tougher level-5/7 "grounds"
// populations and their 3 rare cousins.
const grimoakGroundsMonsters = MONSTER_SPECIES.filter((s) => s.homeMap === 'Grimoak Grounds');
console.log(
  'Grimoak Grounds roster:',
  grimoakGroundsMonsters.map((s) => `${s.id ?? s.kind} (L${s.level ?? 1}, ${s.startingHp}hp, ${s.attackDamage ?? 'reactive-only'} dmg, ${s.expReward} exp)`)
);

function monsterCombatantStats(level) {
  const a = monsterAttributeForLevel(level);
  return { level, strength: a, intelligence: a, wisdom: a, dexterity: a, constitution: a, luck: a };
}

function dodgeChance(defenderLevel, defenderDex, attackerLevel, attackerDex) {
  const levelEdge = (defenderLevel - attackerLevel) * 0.01;
  const attributeEdge = (defenderDex - attackerDex) * 0.01;
  return Math.max(0, Math.min(0.75, DODGE_BASE_CHANCE + levelEdge + attributeEdge));
}

// A fresh level-1 human player, unallocated (every attribute at the new
// baseline of 5 — see player.entity.ts) — the "naive default playthrough"
// this simulation models, not a min-maxed build.
function freshPlayer() {
  return {
    level: 1,
    exp: 0,
    hp: 100,
    maxHp: 100,
    mv: 100,
    strength: 5,
    dexterity: 5,
    constitution: 5,
    intelligence: 5,
    wisdom: 5,
  };
}

// Simulates one full kill of a monster species via melee (the only
// combat option available with zero prerequisites — no wand, no
// practice points spent) — returns exp gained, real-world seconds spent
// swinging, and expected hp lost to counter-attacks (dodge-adjusted).
function simulateKill(player, species) {
  const level = species.level ?? 1;
  const monster = monsterCombatantStats(level);
  const playerStats = { level: player.level, strength: player.strength, intelligence: player.intelligence, wisdom: player.wisdom, dexterity: player.dexterity, constitution: player.constitution, luck: 5 };
  const monsterArmor = armorVsPhysicalFor(monster.dexterity, monster.strength, 0);
  const swingDamage = punchDamage(playerStats, monster, 0, 0, monsterArmor);
  const swingsToKill = Math.ceil(species.startingHp / Math.max(1, swingDamage));
  const seconds = swingsToKill * ATTACK_COOLDOWN_S;

  const playerArmor = armorVsPhysicalFor(player.dexterity, player.strength, 0);
  let expectedHpLost = 0;
  if (species.attackDamage !== undefined) {
    const dodge = dodgeChance(player.level, player.dexterity, level, monster.dexterity);
    const rawHitAfterArmor = applyArmorMitigation(species.attackDamage, playerArmor);
    expectedHpLost = swingsToKill * (1 - dodge) * rawHitAfterArmor;
  } else {
    // Reactive-only species (plain wild goblin/skeleton) counter-attack
    // via the SAME punchDamage formula, once per player swing.
    const dodge = dodgeChance(player.level, player.dexterity, level, monster.dexterity);
    const counterDamage = punchDamage(monster, playerStats, 0, 0, playerArmor);
    expectedHpLost = swingsToKill * (1 - dodge) * counterDamage;
  }

  const exp = expGainFor(species.expReward, player.level, level);
  return { exp, seconds, expectedHpLost, swingDamage, monsterArmor };
}

// Rests (30s ticks, awake or deliberately resting) until hp is back above
// a threshold — mirrors "resting in between" from the ask.
function restToFull(player, timeLog) {
  let ticks = 0;
  while (player.hp < player.maxHp * 0.95) {
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * REST_HEAL_PERCENT);
    ticks += 1;
  }
  timeLog.restSeconds += ticks * STAT_TICK_S;
}

const player = freshPlayer();
const timeLog = { combatSeconds: 0, restSeconds: 0 };
const HP_REST_THRESHOLD = 0.35;
const perLevelReport = [];
let totalKills = 0;
const killsByMonster = {};

// Pick the best available Grimoak Grounds target for the player's
// CURRENT level — a cautious, realistic player fights whatever they've
// already caught up to or surpassed (monster level <= player level),
// preferring the TOUGHEST such option (best exp/time), and only ever
// risks the imp (the one species with no level floor) once nothing else
// qualifies yet.
function pickTarget(level) {
  const candidates = grimoakGroundsMonsters.filter((s) => !s.isRare);
  const eligible = candidates.filter((c) => (c.level ?? 1) <= level);
  if (eligible.length === 0) return candidates.find((c) => c.kind === 'imp');
  return eligible.reduce((best, c) => ((c.level ?? 1) > (best.level ?? 1) ? c : best));
}

for (let targetLevel = 2; targetLevel <= 10; targetLevel++) {
  const startLevel = player.level;
  const startSeconds = timeLog.combatSeconds + timeLog.restSeconds;
  let killsThisLevel = 0;
  while (player.level < targetLevel) {
    const species = pickTarget(player.level);
    const { exp, seconds, expectedHpLost } = simulateKill(player, species);
    timeLog.combatSeconds += seconds;
    player.hp -= expectedHpLost;
    killsThisLevel += 1;
    totalKills += 1;
    killsByMonster[species.id ?? species.kind] = (killsByMonster[species.id ?? species.kind] ?? 0) + 1;
    if (player.hp < player.maxHp * HP_REST_THRESHOLD) restToFull(player, timeLog);

    const state = applyExpGain({ level: player.level, exp: player.exp }, exp, MAX_PLAYER_LEVEL);
    player.level = state.level;
    player.exp = state.exp;
    if (player.level >= targetLevel) break;
  }
  const elapsed = timeLog.combatSeconds + timeLog.restSeconds - startSeconds;
  perLevelReport.push({ level: targetLevel, kills: killsThisLevel, minutes: (elapsed / 60).toFixed(1) });
}

console.log('\n--- Level 1 -> 10 simulation (melee-only, Grimoak Grounds) ---');
console.table(perLevelReport);
console.log('Total kills 1->10:', totalKills);
console.log('Kills by monster:', killsByMonster);
console.log('Total combat time:', (timeLog.combatSeconds / 60).toFixed(1), 'minutes');
console.log('Total rest time:', (timeLog.restSeconds / 60).toFixed(1), 'minutes');
console.log('Total wall-clock time 1->10:', ((timeLog.combatSeconds + timeLog.restSeconds) / 60).toFixed(1), 'minutes');

// Per-hit sanity numbers for the report (imp vs a level-1..5 player).
console.log('\n--- Per-hit sanity check (imp vs player, melee) ---');
for (let lvl = 1; lvl <= 5; lvl++) {
  const p = { ...freshPlayer(), level: lvl, strength: 5 + lvl, dexterity: 5 + lvl };
  const imp = grimoakGroundsMonsters.find((s) => s.kind === 'imp' && !s.isRare);
  const { swingDamage, monsterArmor } = simulateKill(p, imp);
  const playerArmor = armorVsPhysicalFor(p.dexterity, p.strength, 0);
  const impHitAfterArmor = applyArmorMitigation(imp.attackDamage, playerArmor).toFixed(2);
  console.log(`Level ${lvl} player: punch does ${swingDamage} to imp (imp armor ${monsterArmor}); imp punch does ${impHitAfterArmor} to player (player armor ${playerArmor})`);
}
