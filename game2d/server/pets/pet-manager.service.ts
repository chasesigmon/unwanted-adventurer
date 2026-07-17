import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import type { PetKind, PetCommand, PetSnapshot } from '../../shared/pets.js';
import {
  PET_KIND_LABELS,
  PET_STARTING_HP,
  PET_AWAKE_HEAL_PERCENT,
  PET_SLEEP_HEAL_PERCENT,
  PET_EVOLUTION_LEVEL,
  PET_EVOLVED_NAME,
  PET_EVOLUTION_HP_BONUS,
  PET_EVOLUTION_ATTACK_BONUS,
  type FollowerEquipmentSlot,
} from '../../shared/pets.js';
import { applyExpGain } from '../combat/formulas.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';

interface Pet extends PetSnapshot {}

// One pet per owner, entirely in-memory (same tradeoff MonsterManagerService/
// CorpseManagerService already make — resets on server restart). Keyed by
// owner username since "a player should only be allowed to have 1 pet at
// a time" makes username -> Pet a natural 1:1 map, unlike monsters/corpses.
@Injectable()
export class PetManagerService {
  private pets = new Map<string, Pet>();

  constructor(private readonly worldManager: WorldManagerService) {}

  // Injected by GameGateway (same "manager owns state, gateway owns the
  // interesting logic" shape as MonsterManagerService's own
  // setDemonImpCallbacks/setBarrierZoneChecker) — lets tickAll below
  // locate a monster/player target without PetManagerService needing a
  // direct dependency on MonsterManagerService.
  private targetLocator?: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined;

  setTargetLocator(locator: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined): void {
    this.targetLocator = locator;
  }

  hasPet(ownerUsername: string): boolean {
    return this.pets.has(ownerUsername);
  }

  getPet(ownerUsername: string): Pet | undefined {
    return this.pets.get(ownerUsername);
  }

  buy(ownerUsername: string, kind: PetKind, map: MapName, row: number, col: number): Pet | undefined {
    if (this.pets.has(ownerUsername)) return undefined;
    const pet: Pet = {
      id: randomUUID(),
      ownerUsername,
      kind,
      name: PET_KIND_LABELS[kind],
      level: 1,
      exp: 0,
      hp: PET_STARTING_HP,
      maxHp: PET_STARTING_HP,
      map,
      row,
      col,
      command: 'follow',
      inventory: [],
      equipment: {},
      alive: true,
    };
    this.pets.set(ownerUsername, pet);
    return pet;
  }

  setCommand(ownerUsername: string, command: PetCommand): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    pet.command = command;
    // Switching away from 'attack' (follow/stay/sleep) drops whatever
    // target it had — same "don't leave stale state around" reasoning as
    // clearing the other 3 mutually-exclusive selection concepts on the
    // client (see WorldScene.ts's setTarget/setLockTarget/etc.).
    if (command !== 'attack') {
      pet.attackTargetKind = undefined;
      pet.attackTargetId = undefined;
    }
    return pet;
  }

  // The 'z' hotkey (a later follow-up ask: "send the monster to auto
  // attack the target") — arms the 'attack' command with a concrete
  // target in one step, since a bare command with no target wouldn't
  // know what to walk toward (see tickAll below).
  commandAttack(ownerUsername: string, targetKind: 'monster' | 'player', targetId: string): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    pet.command = 'attack';
    pet.attackTargetKind = targetKind;
    pet.attackTargetId = targetId;
    return pet;
  }

  // A follow-up bug fix: "when the 'attack' option is selected, the
  // follower should auto attack anyone the player attacks" — 'attack' is
  // a standing MODE now, not just a one-shot target set by 'z'. Called
  // from game.gateway.ts's own engageCombat/startAutoAttackAfterSpell/
  // handleEngageRangedAttack every time the OWNER engages a (new or the
  // same) target — a pet not currently in 'attack' mode is untouched, so
  // buying a pet or leaving it on follow/stay/sleep never drags it into a
  // fight it wasn't asked to join.
  syncAttackTarget(ownerUsername: string, targetKind: 'monster' | 'player', targetId: string): void {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive || pet.command !== 'attack') return;
    pet.attackTargetKind = targetKind;
    pet.attackTargetId = targetId;
  }

  // The other half of the fix above — once the OWNER's own fight ends
  // (target died, disengaged, or simply lost), an 'attack'-mode pet's
  // stale target is cleared so tickAll's own fallback takes over: "it
  // should still continue to follow the player as normal if not
  // attacking a monster," rather than standing frozen with nothing to
  // chase (see tickAll's own attack-branch doc comment).
  clearAttackTarget(ownerUsername: string): void {
    const pet = this.pets.get(ownerUsername);
    if (!pet || pet.command !== 'attack') return;
    pet.attackTargetKind = undefined;
    pet.attackTargetId = undefined;
  }

  // Phase C's "give item" ask — moves one item INTO the pet's own
  // inventory (see game.gateway.ts's handleGiveFollowerItem, which
  // removes it from the player's own inventory first).
  giveItem(ownerUsername: string, item: string): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    pet.inventory = [...pet.inventory, item];
    return pet;
  }

  // The reverse — takes one item back OUT of the pet's own inventory (see
  // handleTakeFollowerItem, which then adds it to the player's own).
  // Returns the removed item (so the caller knows what to give back),
  // undefined if the index is invalid.
  takeItem(ownerUsername: string, itemIndex: number): { pet: Pet; item: string } | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const item = pet.inventory[itemIndex];
    if (item === undefined) return undefined;
    pet.inventory = pet.inventory.filter((_, i) => i !== itemIndex);
    return { pet, item };
  }

  // Moves an item already sitting in the pet's own inventory into its
  // equipment (weapon/torso only — see shared/pets.ts's
  // FOLLOWER_EQUIPMENT_SLOTS) — whatever was already in that slot goes
  // back into the pet's own inventory, same "swap, don't just overwrite"
  // shape the player's own handleUseItem uses.
  equipItem(ownerUsername: string, itemIndex: number, slot: FollowerEquipmentSlot): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const item = pet.inventory[itemIndex];
    if (item === undefined) return undefined;
    const inventory = pet.inventory.filter((_, i) => i !== itemIndex);
    const previous = pet.equipment[slot];
    if (previous) inventory.push(previous);
    pet.inventory = inventory;
    pet.equipment = { ...pet.equipment, [slot]: item };
    return pet;
  }

  // Takes whatever's equipped in the given slot back off, returning it to
  // the pet's own inventory (see handleUnequipFollowerItem).
  unequipItem(ownerUsername: string, slot: FollowerEquipmentSlot): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const item = pet.equipment[slot];
    if (!item) return undefined;
    const { [slot]: _removed, ...rest } = pet.equipment;
    pet.equipment = rest;
    pet.inventory = [...pet.inventory, item];
    return pet;
  }

  // Contact damage from a monster's own counter-attack, resolved the same
  // simplified "just subtract hp" way an NPC/monster counter-attack does
  // against a player — a pet has no dodge/parry/shield-block of its own.
  applyDamage(ownerUsername: string, amount: number): { pet: Pet; died: boolean } | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    pet.hp = Math.max(0, pet.hp - amount);
    const died = pet.hp <= 0;
    if (died) pet.alive = false;
    return { pet, died };
  }

  // Phase C's "pet evolution" ask piggybacks right on this level-up path
  // (see shared/pets.ts's own doc comment on PET_EVOLUTION_LEVEL for why
  // it's level-based, not consume-based) — a one-time name/stat upgrade
  // the moment level crosses the threshold, guarded by comparing the
  // pet's own name against its un-evolved label so it can never re-fire.
  grantExp(ownerUsername: string, gained: number): { pet: Pet; evolved: boolean } | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const { level, exp } = applyExpGain({ level: pet.level, exp: pet.exp }, gained);
    if (level > pet.level) {
      pet.hp = pet.maxHp + (level - pet.level) * 10;
      pet.maxHp = pet.hp;
    }
    pet.level = level;
    pet.exp = exp;

    let evolved = false;
    if (pet.level >= PET_EVOLUTION_LEVEL && pet.name === PET_KIND_LABELS[pet.kind]) {
      pet.name = PET_EVOLVED_NAME[pet.kind];
      pet.maxHp += PET_EVOLUTION_HP_BONUS;
      pet.hp += PET_EVOLUTION_HP_BONUS;
      pet.attackDamageBonus = (pet.attackDamageBonus ?? 0) + PET_EVOLUTION_ATTACK_BONUS;
      evolved = true;
    }
    return { pet, evolved };
  }

  // Called every FOLLOWER_STEP_MS (a later follow-up ask sped this up to
  // roughly match the player's own MOVE_COOLDOWN_MS — a pet used to only
  // move once per 3s combat tick, falling miles behind at ordinary
  // walking speed) — 'follow' steps one tile toward its own owner's
  // CURRENT position (looked up fresh from WorldManagerService every
  // tick, not cached) when not already adjacent; 'attack' (a later
  // follow-up ask's 'z' hotkey) steps toward its assigned target instead.
  // Movement only — doesn't deal damage or report contact itself anymore
  // (see checkContacts below, called from the slower combat tick instead,
  // so speeding up movement doesn't also speed up attack cadence). 'stay'/
  // 'sleep' hold still, same as before.
  tickAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const pet of this.pets.values()) {
      if (!pet.alive) continue;

      if (pet.command === 'attack' && pet.attackTargetKind && pet.attackTargetId) {
        const target = this.targetLocator?.(pet.attackTargetKind, pet.attackTargetId);
        if (!target) {
          // Target's gone (dead/disconnected) — fall back to just
          // following the owner again rather than standing there stuck.
          pet.command = 'follow';
          pet.attackTargetKind = undefined;
          pet.attackTargetId = undefined;
          continue;
        }
        if (pet.map !== target.mapName) {
          changedMaps.add(pet.map);
          pet.map = target.mapName;
          pet.row = target.row;
          pet.col = target.col;
          changedMaps.add(pet.map);
          continue;
        }
        const dRow = target.row - pet.row;
        const dCol = target.col - pet.col;
        if (Math.abs(dRow) + Math.abs(dCol) <= 1) continue; // already adjacent — checkContacts handles this
        if (Math.abs(dRow) >= Math.abs(dCol)) {
          pet.row += Math.sign(dRow);
        } else {
          pet.col += Math.sign(dCol);
        }
        changedMaps.add(pet.map);
        continue;
      }

      // A follow-up bug fix: "attack selected but the follower just stood
      // there" — 'attack' mode with no CURRENT target (nothing to sync
      // onto yet, see syncAttackTarget) falls through to the exact same
      // follow-the-owner behavior 'follow' itself uses, rather than being
      // excluded here and standing frozen — "it should still continue to
      // follow the player as normal if not attacking a monster."
      if (pet.command !== 'follow' && pet.command !== 'attack') continue;
      const owner = this.worldManager.getLocation(pet.ownerUsername);
      if (!owner) continue;
      if (pet.map !== owner.mapName) {
        // Snapping onto the owner's new map (a simplified first pass —
        // "the pet should follow the player," not yet an animated walk
        // through the same door transition the player just took).
        changedMaps.add(pet.map);
        pet.map = owner.mapName;
        pet.row = owner.row;
        pet.col = owner.col;
        changedMaps.add(pet.map);
        continue;
      }
      const dRow = owner.row - pet.row;
      const dCol = owner.col - pet.col;
      if (Math.abs(dRow) + Math.abs(dCol) <= 1) continue;
      if (Math.abs(dRow) >= Math.abs(dCol)) {
        pet.row += Math.sign(dRow);
      } else {
        pet.col += Math.sign(dCol);
      }
      changedMaps.add(pet.map);
    }
    return changedMaps;
  }

  // Called from the slower, original combat tick (unchanged cadence, see
  // game.gateway.ts) — a read-only adjacency check (no movement) against
  // each 'attack'-commanded pet's current position, so damage/player-
  // auto-attack keeps resolving at the ORIGINAL rate even though tickAll
  // above now moves the pet toward its target much faster.
  checkContacts(): Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> {
    const contacts: Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> = [];
    for (const pet of this.pets.values()) {
      if (!pet.alive || pet.command !== 'attack' || !pet.attackTargetKind || !pet.attackTargetId) continue;
      const target = this.targetLocator?.(pet.attackTargetKind, pet.attackTargetId);
      if (!target || target.mapName !== pet.map) continue;
      const dRow = target.row - pet.row;
      const dCol = target.col - pet.col;
      if (Math.abs(dRow) + Math.abs(dCol) <= 1) {
        contacts.push({ ownerUsername: pet.ownerUsername, targetKind: pet.attackTargetKind, targetId: pet.attackTargetId });
      }
    }
    return contacts;
  }

  // Phase C's "sleep/wake" ask — called once per global stat tick (same
  // cadence players regen on, see game.gateway.ts's globalStatTick), a
  // flat percent-of-max heal, bigger while genuinely asleep. Pets never
  // regenerated at all before this.
  regenAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const pet of this.pets.values()) {
      if (!pet.alive || pet.hp >= pet.maxHp) continue;
      const percent = pet.command === 'sleep' ? PET_SLEEP_HEAL_PERCENT : PET_AWAKE_HEAL_PERCENT;
      pet.hp = Math.min(pet.maxHp, pet.hp + Math.round((percent / 100) * pet.maxHp));
      changedMaps.add(pet.map);
    }
    return changedMaps;
  }

  removePet(ownerUsername: string): void {
    this.pets.delete(ownerUsername);
  }

  // Recall's own "bring my companions with me" behavior (a later
  // follow-up ask) — an instant snap to the caster's own destination,
  // same shape tickAll's own map-change branch already uses, just
  // triggered directly instead of discovered on the next follow tick.
  // Returns the pet's PREVIOUS map (so the caller can also re-broadcast
  // that map's own state) — undefined if this owner has no living pet.
  teleportToOwner(ownerUsername: string, map: MapName, row: number, col: number): MapName | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const previousMap = pet.map;
    pet.map = map;
    pet.row = row;
    pet.col = col;
    return previousMap;
  }

  getSnapshotsForMap(mapName: MapName): PetSnapshot[] {
    const snapshots: PetSnapshot[] = [];
    for (const pet of this.pets.values()) {
      if (pet.map !== mapName) continue;
      snapshots.push({ ...pet });
    }
    return snapshots;
  }

  getSnapshotForOwner(ownerUsername: string): PetSnapshot | undefined {
    const pet = this.pets.get(ownerUsername);
    return pet ? { ...pet } : undefined;
  }
}
