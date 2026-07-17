// The target info modal (double-click a player/npc/monster/pet) — name,
// equipment/carried items, and (for an actual combat target) a
// "consideration" message comparing the target's level to your own.
import Phaser from 'phaser';
import { myProfile } from '../state.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS } from '../../shared/equipment.js';
import { FOLLOWER_EQUIPMENT_SLOTS } from '../../shared/pets.js';
import { appendStatRow, closeAllModals, targetInfoBody, targetInfoConsideration, targetInfoModal, targetInfoTitle, updateInputCaptured } from './modalCore.js';

// This project has no prior "consider" mechanic to match (the text game
// doesn't have one either) — these tiers/wording are new, not ported
// from anywhere.
function considerationMessage(viewerLevel: number, targetLevel: number): string {
  const diff = targetLevel - viewerLevel;
  if (diff <= -5) return 'This would be no challenge at all for you.';
  if (diff <= -2) return 'You would win this fight easily.';
  if (diff <= 1) return 'This would be a fair fight.';
  if (diff <= 4) return 'This could go either way — be careful.';
  return 'You would likely be defeated.';
}

export function openTargetInfoModal(kind: 'player' | 'npc' | 'monster' | 'pet', id: string, sprite: Phaser.GameObjects.Sprite): void {
  closeAllModals();
  const label = (sprite.getData('label') as string | undefined) ?? id;
  const level = (sprite.getData('level') as number | undefined) ?? 1;

  targetInfoTitle.textContent = label;
  targetInfoBody.innerHTML = '';
  appendStatRow(targetInfoBody, 'Level', level);

  if (kind === 'player') {
    const equipment = (sprite.getData('equipment') as Record<string, string> | undefined) ?? {};
    for (const slot of EQUIPMENT_SLOTS) {
      appendStatRow(targetInfoBody, EQUIPMENT_SLOT_LABELS[slot], equipment[slot] ?? '(none)');
    }
  } else if (kind === 'monster') {
    const carried = (sprite.getData('carriedItems') as string[] | undefined) ?? [];
    appendStatRow(targetInfoBody, 'Carrying', carried.length > 0 ? carried.join(', ') : '(nothing)');
  } else if (kind === 'pet') {
    // A later follow-up ask: "see more details including possible
    // equipment" — a follower's own equipment is limited to
    // FOLLOWER_EQUIPMENT_SLOTS (weapon/torso only), unlike a player's
    // full 12-slot list above.
    const ownerUsername = (sprite.getData('ownerUsername') as string | undefined) ?? '(unknown)';
    appendStatRow(targetInfoBody, 'Owner', ownerUsername);
    const equipment = (sprite.getData('equipment') as Record<string, string> | undefined) ?? {};
    for (const slot of FOLLOWER_EQUIPMENT_SLOTS) {
      appendStatRow(targetInfoBody, EQUIPMENT_SLOT_LABELS[slot], equipment[slot] ?? '(none)');
    }
    const carried = (sprite.getData('inventory') as string[] | undefined) ?? [];
    appendStatRow(targetInfoBody, 'Carrying', carried.length > 0 ? carried.join(', ') : '(nothing)');
  }

  // A pet isn't a real combat target — "would I win this fight" doesn't
  // apply to a friendly follower, so it just gets no consideration line
  // rather than a nonsensical one.
  targetInfoConsideration.textContent = kind !== 'pet' && myProfile ? considerationMessage(myProfile.level, level) : '';
  targetInfoModal.hidden = false;
  updateInputCaptured();
}
