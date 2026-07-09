// Pure, dependency-free combat/leveling formulas — mirrors the shape of
// the text game's own src/server/players/leveling.ts and skills.ts, sized
// down to this project's much smaller scope (one skill, one attack, no
// equipment/dodge/parry).

export const STARTING_ATTRIBUTE = 1;
export const STARTING_VITAL = 100;
export const STARTING_LEVEL = 1;
export const STARTING_EXP = 0;

export const PUNCH_SKILL = 'punch';
export const STARTING_SKILL_PERCENT = 1;
export const MAX_SKILL_PERCENT = 100;
export const SKILL_GROWTH_CHANCE = 0.02;

export interface Attributes {
  strength: number;
  intelligence: number;
  wisdom: number;
  dexterity: number;
  constitution: number;
}

export interface CombatantStats extends Attributes {
  level: number;
}

// Base unarmed damage — mirrors the text game's baseHitDamage (its own
// PLAYER_BASE_ATTACK_DAMAGE_FLOOR of 6, plus half of strength and half of
// level), the floor every punch builds on top of before any bonuses.
const PUNCH_BASE_DAMAGE_FLOOR = 6;
export function baseDamage(strength: number, level: number): number {
  return PUNCH_BASE_DAMAGE_FLOOR + Math.floor(strength / 2) + Math.floor(level / 2);
}

// Every 2 points of relative strength edge, and every 2 levels of
// relative level edge, add +1 damage — clamped at 0 (being weaker or
// lower-level never subtracts damage, it just earns no bonus). Since this
// is symmetric between attacker/defender, whichever side is ahead is the
// one who gets the bonus: the bigger the gap, the more damage THEY do —
// exactly "the more difference there is, the more damage either one
// would do".
export function attributeBonus(attacker: CombatantStats, defender: CombatantStats): number {
  const strengthEdge = attacker.strength - defender.strength;
  const levelEdge = attacker.level - defender.level;
  return Math.max(0, Math.floor(strengthEdge / 2) + Math.floor(levelEdge / 2));
}

// Skill proficiency adds a small flat bonus — same shape as the text
// game's percentBonus (its dagger-skill bonus): +1 per 20% learned,
// capping at +5 at 100%.
export function skillBonus(skillPercent: number): number {
  return Math.floor(skillPercent / 20);
}

export function punchDamage(
  attacker: CombatantStats,
  defender: CombatantStats,
  punchSkillPercent: number,
  weaponBonus = 0
): number {
  return baseDamage(attacker.strength, attacker.level) + attributeBonus(attacker, defender) + skillBonus(punchSkillPercent) + weaponBonus;
}

// --- Equipment (one slot: weapon) ---

// Which equipment slot an item goes into, if any — items not listed here
// aren't equippable at all, just consumable body parts (see
// CONSUME_EXP_PER_ITEM below).
export const EQUIPMENT_SLOT_FOR_ITEM: Record<string, string> = {
  'bone dagger': 'weapon',
};

// Flat damage bonus while a given item is equipped in its slot.
export const WEAPON_DAMAGE_BONUS: Record<string, number> = {
  'bone dagger': 3,
};

export function weaponBonusFor(equipment: Record<string, string>): number {
  const weapon = equipment.weapon;
  return weapon ? (WEAPON_DAMAGE_BONUS[weapon] ?? 0) : 0;
}

// --- Consuming body parts (mirrors the text game's separate
// consumeExp counter — tracked here but, unlike the text game's Hobgoblin
// evolution, doesn't drive any further mechanic yet in this project) ---

export const CONSUME_EXP_PER_ITEM = 5;

// --- Leveling — identical shape to the text game's leveling.ts ---

export function maxTnlForLevel(level: number): number {
  return level * 100;
}

export interface LevelState {
  level: number;
  exp: number;
}

export function applyExpGain(state: LevelState, gained: number): LevelState {
  let { level, exp } = state;
  exp += gained;
  let maxTnl = maxTnlForLevel(level);
  while (exp >= maxTnl) {
    exp -= maxTnl;
    level += 1;
    maxTnl = maxTnlForLevel(level);
  }
  return { level, exp };
}

export const LEVEL_UP_ATTRIBUTE_BONUS = 1;
export const LEVEL_UP_VITAL_BONUS = 10;

// --- Experience rewards ---

// One shared ratio formula for both monster and player kills: the higher
// the killer's level is above the victim's, the less experience it's
// worth (diminishing returns for stomping something far weaker); the
// lower the killer's level, the more it's worth (risk vs. reward for
// punching above your weight). Player kills just use a bigger base
// reward than a monster kill (see PLAYER_KILL_EXP_REWARD) — since it's a
// straight multiple fed through this SAME formula, the ratio between
// them holds at any level pairing, not just when levels happen to match.
export function expGainFor(baseReward: number, killerLevel: number, victimLevel: number): number {
  const ratio = (victimLevel * 10) / killerLevel;
  return Math.max(1, Math.round(baseReward * ratio));
}

export const WILD_GOBLIN_EXP_REWARD = 8;
export const WILD_SKELETON_EXP_REWARD = 10;
// ~7x a wild goblin kill (the monster this project actually spawns) at
// any matching level pairing — see expGainFor's doc comment above.
export const PLAYER_KILL_EXP_REWARD = WILD_GOBLIN_EXP_REWARD * 7;
