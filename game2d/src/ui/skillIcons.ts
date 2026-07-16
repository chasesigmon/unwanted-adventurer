// Small hand-rolled inline-SVG glyphs, one per skill/spell, used in place
// of a plain letter (a follow-up ask: "create little sprites/icons that
// relate to what a skill/spell does") — same "data-URI, no external
// asset" treatment as mapRender.ts's cursor SVGs (SWORD_CURSOR etc.).
// Deliberately monochrome (a warm parchment stroke) so a single glyph
// style reads consistently regardless of the icon's own hashed/grouped
// background color (see skillMeta.ts's skillIconColor) — the background
// already carries the "attack" vs "defensive" grouping, the glyph just
// needs to hint at the specific action.
import {
  PUNCH_SKILL,
  DODGE_SKILL,
  PARRY_SKILL,
  SHIELD_BLOCK_SKILL,
  DAGGER_SKILL,
  WAND_BOLT_SKILL,
  SECOND_ATTACK_SKILL,
  THIRD_ATTACK_SKILL,
  ENHANCED_DAMAGE_SKILL,
  LESSER_NORMAL_MONSTER_RESISTANCE,
  LESSER_UNDEAD_MONSTER_RESISTANCE,
  LESSER_FIRE_RESISTANCE,
  INFRAVISION_SKILL,
  LACERATE_SKILL,
  MIMIC_SKILL,
  REVERT_SKILL,
  EAT_BRAINS_SKILL,
  GLARE_SKILL,
  ENHANCED_DURABILITY_SKILL,
  BONE_FINGER_STRIKE_SKILL,
  LIGHT_SKILL,
  WATERFILL_SKILL,
  HASTE_SKILL,
  UNLOCK_SKILL,
  ARCANE_BOLT_SKILL,
  DRINK_SKILL,
  POUR_SKILL,
  STUN_SKILL,
  DISARM_SKILL,
  AEGIS_SKILL,
  STONE_WALL_SKILL,
  ANIMATE_DEAD_SKILL,
  RECALL_SKILL,
  BARRIER_SKILL,
  SHAMAN_ENHANCE_DAMAGE_SKILL,
  FIRE_BOLT_SKILL,
  WATER_BOLT_SKILL,
  AIR_BOLT_SKILL,
  EARTH_BOLT_SKILL,
  LESSER_HEAL_SKILL,
  ENHANCED_UNDEAD_DAMAGE_SKILL,
  LESSER_SELF_HEAL_SKILL,
  WISP_TRANSFORMATION_SKILL,
  BATTLEMAGE_ENHANCED_ARMOR_SKILL,
  BATTLEMAGE_ENHANCED_DAMAGE_SKILL,
  KINETIC_STRIKE_SKILL,
  SAP_HEALTH_SKILL,
  MONSTER_SUMMONS_SKILL,
  SUMMON_DEMON_IMP_SKILL,
  ENHANCED_HOLY_DAMAGE_SKILL,
  INVISIBILITY_SKILL,
  CREATE_DUPLICATE_SKILL,
} from '../../shared/skills.js';

const STROKE = '#f5f0dc';

function svgUrl(inner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${STROKE}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ICONS: Record<string, string> = {
  [PUNCH_SKILL]: svgUrl(
    '<circle cx="9" cy="10" r="2"/><circle cx="13" cy="8" r="2"/><circle cx="17" cy="10" r="2"/><path d="M7 12 v3 a4 4 0 0 0 4 4 h4 a4 4 0 0 0 4-4 v-4"/>'
  ),
  [DAGGER_SKILL]: svgUrl('<path d="M12 2 L14 12 L12 15 L10 12 Z" fill="' + STROKE + '"/><rect x="10.7" y="15" width="2.6" height="4" rx="0.6"/><path d="M9 16 h6"/>'),
  [WAND_BOLT_SKILL]: svgUrl('<path d="M13 2 L6 13 h4 l-1 9 l8 -12 h-4 Z" fill="' + STROKE + '"/>'),
  [SECOND_ATTACK_SKILL]: svgUrl('<path d="M5 6 L11 18"/><path d="M13 6 L19 18"/>'),
  [THIRD_ATTACK_SKILL]: svgUrl('<path d="M4 6 L8 18"/><path d="M11 6 L13 18"/><path d="M16 6 L20 18"/>'),
  [ENHANCED_DAMAGE_SKILL]: svgUrl('<path d="M12 3 L15 10 L12 9 L14 21 L9 12 L12 13 Z" fill="' + STROKE + '"/>'),
  [DODGE_SKILL]: svgUrl('<path d="M5 15 a7 7 0 1 1 3 6"/><path d="M4 17 l1 4 l4 -1"/>'),
  [PARRY_SKILL]: svgUrl('<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><path d="M8 12 L16 8"/>'),
  [SHIELD_BLOCK_SKILL]: svgUrl('<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/>'),
  [LESSER_NORMAL_MONSTER_RESISTANCE]: svgUrl(
    '<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><circle cx="12" cy="12" r="2.3" fill="' + STROKE + '"/>'
  ),
  [LESSER_UNDEAD_MONSTER_RESISTANCE]: svgUrl(
    '<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><circle cx="10" cy="11" r="0.9" fill="' +
      STROKE +
      '"/><circle cx="14" cy="11" r="0.9" fill="' +
      STROKE +
      '"/><path d="M9.5 15 q2.5 2 5 0"/>'
  ),
  [LESSER_FIRE_RESISTANCE]: svgUrl(
    '<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><path d="M12 8 c2 2 2 4 0.5 5.5 c0.3 -1 -0.3 -1.5 -0.8 -1 c-0.6 0.6 -0.3 2 0.7 2.5 c-1.8 0.3 -3 -1 -2.7 -2.7 c0.2 -1 1 -1.8 2.3 -4.3 Z" fill="' +
      STROKE +
      '"/>'
  ),
  [INFRAVISION_SKILL]: svgUrl('<path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z"/><circle cx="12" cy="12" r="2.6" fill="' + STROKE + '"/>'),
  [LACERATE_SKILL]: svgUrl('<path d="M5 4 L10 20"/><path d="M10 4 L15 20"/><path d="M15 4 L20 20"/>'),
  [MIMIC_SKILL]: svgUrl(
    '<path d="M4 10 C4 6 8 4 12 4 C16 4 20 6 20 10 C20 15 16 18 12 18 C8 18 4 15 4 10 Z"/><circle cx="9" cy="10" r="1.1" fill="' +
      STROKE +
      '"/><circle cx="15" cy="10" r="1.1" fill="' +
      STROKE +
      '"/><path d="M9 14 q3 2 6 0"/>'
  ),
  [REVERT_SKILL]: svgUrl('<path d="M4 12 a8 8 0 1 1 2.3 5.6"/><path d="M4 17 v-5 h5"/>'),
  [EAT_BRAINS_SKILL]: svgUrl(
    '<path d="M9 4 c-3 0 -5 2 -5 5 c-1.5 0.5 -1.5 3 0 3.5 c0 3 2.5 5 5 5 h6 c2.5 0 5 -2 5 -5 c1.5 -0.5 1.5 -3 0 -3.5 c0 -3 -2 -5 -5 -5 Z"/><path d="M9 7 q1.5 2 0 4 q1.5 2 0 4"/><path d="M15 7 q-1.5 2 0 4 q-1.5 2 0 4"/>'
  ),
  [GLARE_SKILL]: svgUrl(
    '<path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z"/><circle cx="12" cy="12" r="2.6" fill="' +
      STROKE +
      '"/><path d="M12 2 v2.5 M12 19.5 v2.5 M2.5 12 h2.5 M19 12 h2.5"/>'
  ),
  [ENHANCED_DURABILITY_SKILL]: svgUrl(
    '<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><path d="M12 8 v8 M8.5 12 h7"/>'
  ),
  [BONE_FINGER_STRIKE_SKILL]: svgUrl(
    '<path d="M6 13 c-1.2 0 -2 -1 -1.6 -2.2 c-1 -0.4 -1 -1.9 0.1 -2.2 c-0.3 -1.2 0.8 -2.2 1.9 -1.7 c0.4 -1.1 2 -1.1 2.4 0 c1.1 -0.5 2.2 0.5 1.9 1.7 c1.1 0.3 1.1 1.8 0.1 2.2 c0.4 1.2 -0.4 2.2 -1.6 2.2 Z"/><path d="M8 13 v4 a2 2 0 0 0 2 2 h1 a2 2 0 0 0 2 -2 v-6"/>'
  ),
  [LIGHT_SKILL]: svgUrl('<circle cx="12" cy="12" r="4"/><path d="M12 3 v2.5 M12 18.5 v2.5 M3 12 h2.5 M18.5 12 h2.5 M5.6 5.6 l1.8 1.8 M16.6 16.6 l1.8 1.8 M5.6 18.4 l1.8 -1.8 M16.6 7.4 l1.8 -1.8"/>'),
  [WATERFILL_SKILL]: svgUrl('<path d="M12 3 C8 9 5 12.5 5 15.5 A7 7 0 0 0 19 15.5 C19 12.5 16 9 12 3 Z" fill="' + STROKE + '" fill-opacity="0.25"/>'),
  [HASTE_SKILL]: svgUrl(
    '<path d="M8 20 l5 -18 l-2 8 h4 l-6 12 l1 -7 h-3 Z" fill="' + STROKE + '"/><path d="M2 9 h4 M1 12.5 h4.5 M2 16 h4" stroke-width="1.2"/>'
  ),
  [UNLOCK_SKILL]: svgUrl(
    '<circle cx="7" cy="7" r="4"/><circle cx="7" cy="7" r="1.3" fill="' +
      STROKE +
      '"/><path d="M10 10 L20 20 M16 16 l2.5 -2.5 M18.5 18.5 l2.5 -2.5"/>'
  ),
  [ARCANE_BOLT_SKILL]: svgUrl(
    '<path d="M12 3 c3 3.5 3 6.5 0.8 9 c0.5 -1.6 -0.5 -2.4 -1.3 -1.6 c-1 1 -0.5 3.2 1.2 4 c-3 0.5 -5 -1.6 -4.4 -4.5 c0.4 -1.8 1.7 -3 3.7 -6.9 Z" fill="' +
      STROKE +
      '"/>'
  ),
  [FIRE_BOLT_SKILL]: svgUrl(
    '<path d="M12 2 c3 4 4 7 2 10 c0.5 -2 -0.8 -2.8 -1.6 -1.8 c-1.2 1.4 -0.4 3.6 1.6 4.4 c-3.5 0.6 -6 -2 -5.2 -5.4 c0.4 -1.8 1.8 -3.2 3.2 -7.2 Z" fill="' +
      STROKE +
      '"/>'
  ),
  [WATER_BOLT_SKILL]: svgUrl(
    '<path d="M12 2 c3.5 4.5 5.5 8 5.5 10.5 a5.5 5.5 0 1 1 -11 0 c0 -2.5 2 -6 5.5 -10.5 Z" fill="' + STROKE + '"/>'
  ),
  [AIR_BOLT_SKILL]: svgUrl(
    '<path d="M4 8 h11 a3 3 0 1 0 -2.6 -4.5" /><path d="M3 13 h15 a3 3 0 1 1 -2.6 4.5" /><path d="M4 18 h9"/>'
  ),
  [EARTH_BOLT_SKILL]: svgUrl(
    '<path d="M12 3 L20 12 L12 21 L4 12 Z" fill="' + STROKE + '"/><path d="M12 7 L16 12 L12 17 L8 12 Z"/>'
  ),
  [LESSER_HEAL_SKILL]: svgUrl('<path d="M12 4 v16 M4 12 h16"/>'),
  [LESSER_SELF_HEAL_SKILL]: svgUrl('<path d="M12 6 v12 M6 12 h12"/><circle cx="12" cy="12" r="9"/>'),
  [WISP_TRANSFORMATION_SKILL]: svgUrl(
    '<circle cx="12" cy="12" r="4" fill="' +
      STROKE +
      '"/><circle cx="12" cy="4" r="1.6"/><circle cx="19" cy="9" r="1.6"/><circle cx="16.5" cy="18" r="1.6"/><circle cx="7.5" cy="18" r="1.6"/><circle cx="5" cy="9" r="1.6"/>'
  ),
  [BATTLEMAGE_ENHANCED_ARMOR_SKILL]: svgUrl(
    '<path d="M12 3 L19 6 V12 C19 16 16 19.5 12 21 C8 19.5 5 16 5 12 V6 Z" fill="' + STROKE + '"/><path d="M9 12 l2 2 l4 -4"/>'
  ),
  [BATTLEMAGE_ENHANCED_DAMAGE_SKILL]: svgUrl(
    '<path d="M4 4 L11 11 M11 4 L4 11" stroke-width="2.4"/><path d="M13 13 L20 20 M20 13 L13 20" stroke-width="2.4"/>'
  ),
  [KINETIC_STRIKE_SKILL]: svgUrl(
    '<path d="M4 12 L13 12" stroke-width="2.2"/><path d="M9 8 L13 12 L9 16" stroke-width="2.2"/><path d="M16 8 L20 12 L16 16" stroke-width="2.2"/>'
  ),
  [SAP_HEALTH_SKILL]: svgUrl(
    '<path d="M12 3 C7.5 3 5 6.5 5 10.5 C5 13 6.3 15 8 16.5 V19 h8 v-2.5 c1.7 -1.5 3 -3.5 3 -6 C19 6.5 16.5 3 12 3 Z" fill="#aa0000"/><path d="M12 8 v6 M9 11 h6" stroke="' +
      STROKE +
      '"/>'
  ),
  [MONSTER_SUMMONS_SKILL]: svgUrl(
    '<path d="M12 3 L20 8 V16 L12 21 L4 16 V8 Z"/><circle cx="12" cy="12" r="3" fill="' + STROKE + '"/>'
  ),
  [SUMMON_DEMON_IMP_SKILL]: svgUrl(
    '<path d="M6 4 L4 9 M18 4 L20 9" stroke-width="2"/><path d="M6 10 C6 6 9 4 12 4 C15 4 18 6 18 10 V15 C18 18 15 20 12 20 C9 20 6 18 6 15 Z" fill="' +
      STROKE +
      '"/><circle cx="9.5" cy="11" r="1.2"/><circle cx="14.5" cy="11" r="1.2"/>'
  ),
  [ENHANCED_HOLY_DAMAGE_SKILL]: svgUrl(
    '<path d="M12 3 v18 M6 9 h12" stroke-width="2.2"/><path d="M9 5 L12 3 L15 5" stroke-width="1.6"/>'
  ),
  [INVISIBILITY_SKILL]: svgUrl(
    '<path d="M2 12 C5 6 9 4 12 4 C15 4 19 6 22 12 C19 18 15 20 12 20 C9 20 5 18 2 12 Z" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3" fill="' +
      STROKE +
      '" opacity="0.5"/>'
  ),
  [CREATE_DUPLICATE_SKILL]: svgUrl(
    '<circle cx="9" cy="9" r="5" opacity="0.55"/><circle cx="15" cy="15" r="5" fill="' + STROKE + '" opacity="0.85"/>'
  ),
  [ENHANCED_UNDEAD_DAMAGE_SKILL]: svgUrl(
    '<path d="M12 3 L14 11 L12 10 L13 21 L8 12 L11 13 Z" fill="' +
      STROKE +
      '"/><path d="M5 5 l2.5 2.5 M19 5 l-2.5 2.5" stroke-width="1.4"/>'
  ),
  [DRINK_SKILL]: svgUrl('<path d="M6 4 h12 l-1.5 14 a2 2 0 0 1 -2 1.8 h-5 a2 2 0 0 1 -2 -1.8 Z"/><path d="M7 9 h10"/>'),
  [POUR_SKILL]: svgUrl('<path d="M5 5 h10 l-1 9 a2 2 0 0 1 -2 1.7 h-4 a2 2 0 0 1 -2 -1.7 Z" transform="rotate(-25 10 12)"/><path d="M17 8 q4 1 4 4"/>'),
  [STUN_SKILL]: svgUrl(
    '<circle cx="12" cy="12" r="2"/><path d="M12 4 a8 8 0 0 1 8 8" stroke-dasharray="2 3"/><path d="M4 12 a8 8 0 0 1 3 -6.2" stroke-dasharray="2 3"/><path d="M6 18.5 a8 8 0 0 1 -2 -4.5" stroke-dasharray="2 3"/>'
  ),
  [DISARM_SKILL]: svgUrl(
    '<path d="M5 5 L11 11 M13 13 L15 15" /><path d="M15 15 L20 20 M17 21 L21 17"/><path d="M9 15 L5 19 M5 15 l4 4"/>'
  ),
  [AEGIS_SKILL]: svgUrl(
    '<path d="M12 3 l7 3 v5 c0 5 -3.5 8 -7 9 c-3.5 -1 -7 -4 -7 -9 v-5 Z"/><circle cx="12" cy="11" r="2.4" fill="' + STROKE + '" fill-opacity="0.5"/>'
  ),
  [STONE_WALL_SKILL]: svgUrl(
    '<rect x="3" y="9" width="7" height="5" rx="0.5"/><rect x="10" y="9" width="7" height="5" rx="0.5"/><rect x="6.5" y="14" width="7" height="5" rx="0.5"/><rect x="13.5" y="14" width="7" height="5" rx="0.5"/>'
  ),
  [ANIMATE_DEAD_SKILL]: svgUrl(
    '<path d="M12 3 C7.5 3 5 6.5 5 10.5 C5 13 6.3 15 8 16.5 V19 h8 v-2.5 c1.7 -1.5 3 -3.5 3 -6 C19 6.5 16.5 3 12 3 Z"/><circle cx="9" cy="10.5" r="1.3" fill="' +
      STROKE +
      '"/><circle cx="15" cy="10.5" r="1.3" fill="' +
      STROKE +
      '"/><path d="M9 19 v1.6 M11.4 19 v1.6 M14 19 v1.6"/>'
  ),
  [RECALL_SKILL]: svgUrl(
    '<path d="M12 3 a8 8 0 1 1 -6.5 3.3"/><path d="M2.5 4 l1.8 3.6 l3.7 -1"/><rect x="9" y="10" width="6" height="6" rx="0.6" fill="' +
      STROKE +
      '"/><path d="M9 12.5 h6"/>'
  ),
  [BARRIER_SKILL]: svgUrl(
    '<ellipse cx="12" cy="19" rx="8.5" ry="2"/><path d="M3.5 19 A8.5 7.5 0 0 1 20.5 19"/><path d="M12 11.5 v-3 M12 6.3 v-1.3"/>'
  ),
  [SHAMAN_ENHANCE_DAMAGE_SKILL]: svgUrl(
    '<path d="M6 3 L9 10 L6.5 9.3 L9 21 L4 12 L6.5 12.7 Z" fill="' +
      STROKE +
      '"/><path d="M15 8 l2 2 l4 -4" stroke-width="2"/><circle cx="18" cy="7" r="5.2"/>'
  ),
};

// A generic sparkle for anything not in the table above (future-proofing
// — every current skill/spell IS covered, this is just a safety net).
const FALLBACK_ICON = svgUrl('<path d="M12 3 v6 M12 15 v6 M3 12 h6 M15 12 h6 M6 6 l3 3 M15 15 l3 3 M6 18 l3 -3 M15 9 l3 -3"/>');

export function skillIconGlyphUrl(skillName: string): string {
  return ICONS[skillName] ?? FALLBACK_ICON;
}
