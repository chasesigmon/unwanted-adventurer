// The corpse loot modal (players, the training dummy, and monsters
// alike) — a choice between "Grab all" and picking items one at a time,
// plus the zombie-only Eat Brains action and monster-only Sacrifice.
import { activeScene, currentWorldTick, lastWorldTickAt, myProfile, network, setMyProfile, worldTimeKnown } from '../state.js';
import { MONSTER_KINDS } from '../../shared/constants.js';
import { attachTooltip } from './tooltip.js';
import { applyCooldownOverlayFraction } from './skillMeta.js';
import { logCombatMessage } from './log.js';
import { updateStatusBar } from './statusBar.js';
import {
  corpseEatBrainsBtn,
  corpseGrabAllBtn,
  corpseItemList,
  corpseModal,
  corpseModalTitle,
  corpseSacrificeBtn,
  closeAllModals,
  hideModal,
  refreshOpenModals,
  updateInputCaptured,
} from './modalCore.js';

// A later follow-up bug fix: "grabbed crystal and grabbed crystal and
// grabbed crystal" — grabbing a corpse's whole item list used to just
// join every raw item name with "and", so 3 identical drops read as the
// same name repeated 3 times in a row instead of a single stacked count.
// Same "item xN" convention renderInventory's own stacking already uses.
export function stackedItemsLabel(items: string[]): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts, ([item, count]) => (count > 1 ? `${item} x${count}` : item)).join(' and ');
}

let currentCorpseId: string | null = null;
let currentCorpseItems: string[] = [];
let currentCorpseKind: string | undefined;
let currentCorpseKilledBy: string | undefined;
// Item 16: a player's own death corpse now carries their gold too — shown
// as an informational line above the item list (not an individually
// clickable "item", since gold isn't one) and swept up by Grab All.
let currentCorpseGold = 0;

// Must match game.gateway.ts's own EAT_BRAINS_COOLDOWN_TICKS — needed
// client-side purely to size the cooldown wipe's denominator, since the
// server only ever tells us the target tick, not the original cooldown
// length.
const EAT_BRAINS_COOLDOWN_TICKS_CLIENT = 4;
// Must match game.gateway.ts's own STAT_TICK_MS.
const WORLD_STAT_TICK_MS = 30_000;

function eatBrainsTicksRemaining(): number {
  if (!myProfile || !worldTimeKnown) return 0;
  return Math.max(0, myProfile.eatBrainsReadyAtTick - currentWorldTick);
}

// Interpolates BETWEEN world ticks using how long ago the last one
// actually landed — the tick itself is a flat WORLD_STAT_TICK_MS apart,
// so this is exact barring clock drift, and gives the wipe smooth
// per-frame motion instead of only visibly changing once every 30s.
function eatBrainsMsRemaining(): number {
  const ticksLeft = eatBrainsTicksRemaining();
  if (ticksLeft <= 0) return 0;
  const elapsedSinceLastTick = Date.now() - lastWorldTickAt;
  return Math.max(0, (ticksLeft - 1) * WORLD_STAT_TICK_MS + (WORLD_STAT_TICK_MS - elapsedSinceLastTick));
}

const eatBrainsCooldownOverlay = document.createElement('div');
eatBrainsCooldownOverlay.className = 'cooldown-overlay';
corpseEatBrainsBtn.appendChild(eatBrainsCooldownOverlay);
attachTooltip(corpseEatBrainsBtn, () => {
  const ticksLeft = eatBrainsTicksRemaining();
  if (ticksLeft <= 0) return '';
  return `Eat Brains is recharging — ${ticksLeft} more world tick${ticksLeft === 1 ? '' : 's'} (~${Math.ceil(eatBrainsMsRemaining() / 1000)}s).`;
});

// A skull has no brains left to eat — applies to both a player skeleton's
// own corpse and a wild skeleton's, regardless of who landed the killing
// blow.
function corpseHasBrains(kind: string | undefined): boolean {
  return kind !== 'skeleton' && kind !== 'wild skeleton';
}

export function updateEatBrainsButton(): void {
  const canEatBrains =
    myProfile?.race === 'zombie' &&
    currentCorpseKilledBy !== undefined &&
    currentCorpseKilledBy === myProfile.username &&
    corpseHasBrains(currentCorpseKind);
  corpseEatBrainsBtn.hidden = !canEatBrains;
  if (!canEatBrains || !myProfile) {
    applyCooldownOverlayFraction(eatBrainsCooldownOverlay, 0);
    return;
  }

  // Only known once worldTimeKnown (the first 'worldTime' broadcast) —
  // until then, assume ready rather than greying it out on a guess.
  const onCooldown = worldTimeKnown && currentWorldTick < myProfile.eatBrainsReadyAtTick;
  corpseEatBrainsBtn.disabled = onCooldown;
  corpseEatBrainsBtn.classList.toggle('on-cooldown', onCooldown);
  const totalMs = EAT_BRAINS_COOLDOWN_TICKS_CLIENT * WORLD_STAT_TICK_MS;
  applyCooldownOverlayFraction(eatBrainsCooldownOverlay, onCooldown ? eatBrainsMsRemaining() / totalMs : 0);
}

// Player (and training-dummy) corpses share the same Race-shaped `kind`
// as each other with no way to tell them apart — only a REAL monster
// corpse (kind is one of MONSTER_KINDS) can be sacrificed, matching the
// server's own check in handleSacrificeCorpse.
function updateSacrificeButton(): void {
  const canSacrifice = currentCorpseKind !== undefined && (MONSTER_KINDS as readonly string[]).includes(currentCorpseKind);
  corpseSacrificeBtn.hidden = !canSacrifice;
}

// A corpse no longer disappears once its last item is grabbed — it
// sticks around until its TTL or, for a monster corpse, sacrifice — so an
// empty item list just means nothing left to grab, not "close the modal".
function renderCorpseModal(): void {
  corpseItemList.innerHTML = '';
  corpseGrabAllBtn.hidden = currentCorpseItems.length === 0 && currentCorpseGold === 0;
  if (currentCorpseGold > 0) {
    // Bug fix: this used to be a plain, non-clickable line telling the
    // player to use Grab All instead — now clickable on its own, same as
    // any item below (see grabCorpseGold/handleLootGold).
    const goldLi = document.createElement('li');
    goldLi.className = 'inventory-item';
    goldLi.textContent = `${currentCorpseGold} gold`;
    goldLi.title = 'Click to grab';
    goldLi.addEventListener('click', () => grabCorpseGold());
    corpseItemList.appendChild(goldLi);
  }
  if (currentCorpseItems.length === 0) {
    if (currentCorpseGold === 0) {
      const li = document.createElement('li');
      li.className = 'inventory-empty';
      li.textContent = 'Nothing left to grab.';
      corpseItemList.appendChild(li);
    }
    return;
  }
  currentCorpseItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.textContent = item;
    li.className = 'inventory-item';
    li.title = 'Click to grab';
    li.addEventListener('click', () => grabCorpseItem(index));
    corpseItemList.appendChild(li);
  });
}

export function openCorpseModal(corpseId: string, items: string[], kind: string, killedBy: string | undefined, gold: number | undefined = 0): void {
  closeAllModals();
  currentCorpseId = corpseId;
  currentCorpseItems = [...items];
  currentCorpseKind = kind;
  currentCorpseKilledBy = killedBy;
  currentCorpseGold = gold ?? 0;
  corpseModalTitle.textContent = `${kind} corpse`;
  corpseModal.hidden = false;
  updateInputCaptured();
  updateEatBrainsButton();
  updateSacrificeButton();
  renderCorpseModal();
}

corpseSacrificeBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .sacrificeCorpse(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile && ack.gold !== undefined) {
        setMyProfile({ ...myProfile, gold: ack.gold });
        updateStatusBar();
      }
      if (ack.message) logCombatMessage(ack.message);
      hideModal(corpseModal);
      updateInputCaptured();
    })
    .catch(() => {
      /* nothing to show */
    });
});

corpseEatBrainsBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .eatBrains(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (myProfile) {
        setMyProfile({
          ...myProfile,
          hp: ack.hp ?? myProfile.hp,
          maxHp: ack.maxHp ?? myProfile.maxHp,
          mana: ack.mana ?? myProfile.mana,
          maxMana: ack.maxMana ?? myProfile.maxMana,
          eatBrainsReadyAtTick: ack.eatBrainsReadyAtTick ?? myProfile.eatBrainsReadyAtTick,
        });
        updateStatusBar();
        activeScene?.updateOwnBars();
        updateEatBrainsButton();
      }
      if (ack.message) logCombatMessage(ack.message);
    })
    .catch(() => {
      /* nothing to show */
    });
});

function grabCorpseItem(index: number): void {
  if (!currentCorpseId) return;
  network
    .lootItem(currentCorpseId, index)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      const [item] = currentCorpseItems.splice(index, 1);
      if (myProfile && ack.inventory) {
        setMyProfile({ ...myProfile, inventory: ack.inventory });
        refreshOpenModals();
      }
      if (item) logCombatMessage(`You pick up the ${item}.`);
      renderCorpseModal();
    })
    .catch(() => {
      /* corpse likely already looted by someone else — nothing to show */
    });
}

// Bug fix: grabs just the corpse's gold, same "one thing at a time" shape
// as grabCorpseItem — the gold line used to be a plain, non-clickable
// notice pointing at Grab All instead.
function grabCorpseGold(): void {
  if (!currentCorpseId) return;
  network
    .lootGold(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      const gold = currentCorpseGold;
      currentCorpseGold = 0;
      if (myProfile && ack.gold !== undefined) {
        setMyProfile({ ...myProfile, gold: ack.gold });
        updateStatusBar();
      }
      logCombatMessage(`You pick up ${gold} gold.`);
      renderCorpseModal();
    })
    .catch(() => {
      /* nothing to show */
    });
}

corpseGrabAllBtn.addEventListener('click', () => {
  if (!currentCorpseId) return;
  network
    .loot(currentCorpseId)
    .then((ack) => {
      if (!ack.ok) {
        if (ack.message) logCombatMessage(ack.message);
        return;
      }
      if (currentCorpseItems.length > 0) logCombatMessage(`You pick up the ${stackedItemsLabel(currentCorpseItems)}.`);
      if (ack.gold !== undefined && currentCorpseGold > 0) logCombatMessage(`You pick up ${currentCorpseGold} gold.`);
      currentCorpseItems = [];
      currentCorpseGold = 0;
      if (myProfile && (ack.inventory || ack.gold !== undefined)) {
        setMyProfile({ ...myProfile, inventory: ack.inventory ?? myProfile.inventory, gold: ack.gold ?? myProfile.gold });
        refreshOpenModals();
        updateStatusBar();
      }
      // The corpse itself now sticks around empty — keep the modal open
      // in case a monster corpse is about to be sacrificed instead.
      renderCorpseModal();
    })
    .catch(() => {
      /* nothing to show */
    });
});
