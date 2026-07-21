import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import { canFollowerCrossWater } from '../../shared/constants.js';
import type { PetCommand, TamedBeastSnapshot } from '../../shared/pets.js';
import { computeFollowerStep, FOLLOWER_ATTACK_COOLDOWN_MS } from '../../shared/pets.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { stepsForOwnerSpeed } from './followerSpeed.js';

// One tamed beast per owner (same "1 pet at a time" simplicity
// PetManagerService uses) — see shared/pets.ts's own doc comment on
// TamedBeastSnapshot for why this is a separate manager, not a PetKind or
// AnimatedMonsterSnapshot variant.
interface TamedBeast extends TamedBeastSnapshot {
  nextAttackAt?: number;
}

@Injectable()
export class TamedBeastManagerService {
  private beasts = new Map<string, TamedBeast>();

  constructor(private readonly worldManager: WorldManagerService) {}

  private targetLocator?: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined;
  setTargetLocator(locator: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined): void {
    this.targetLocator = locator;
  }

  has(ownerUsername: string): boolean {
    return this.beasts.has(ownerUsername);
  }

  tame(beast: TamedBeastSnapshot): void {
    this.beasts.set(beast.ownerUsername, { ...beast });
  }

  // Re-seeds this owner's in-memory entry from what was last persisted
  // (see player.entity.ts's own tamedBeast column) — called once from
  // game.gateway.ts's handleConnection, same "don't disappear after
  // logins" restore pattern PetManagerService.restore uses.
  restore(snapshot: TamedBeastSnapshot, map: MapName, row: number, col: number): void {
    if (this.beasts.has(snapshot.ownerUsername)) return;
    this.beasts.set(snapshot.ownerUsername, { ...snapshot, map, row, col });
  }

  getSnapshotForOwner(ownerUsername: string): TamedBeastSnapshot | undefined {
    const beast = this.beasts.get(ownerUsername);
    return beast ? { ...beast } : undefined;
  }

  getSnapshotsForMap(mapName: MapName): TamedBeastSnapshot[] {
    const snapshots: TamedBeastSnapshot[] = [];
    for (const beast of this.beasts.values()) {
      if (beast.map !== mapName) continue;
      snapshots.push({ ...beast });
    }
    return snapshots;
  }

  setCommand(ownerUsername: string, command: PetCommand): TamedBeast | undefined {
    const beast = this.beasts.get(ownerUsername);
    if (!beast) return undefined;
    beast.command = command;
    if (command !== 'attack') {
      beast.attackTargetKind = undefined;
      beast.attackTargetId = undefined;
    }
    return beast;
  }

  commandAttack(ownerUsername: string, targetKind: 'monster' | 'player', targetId: string): TamedBeast | undefined {
    const beast = this.beasts.get(ownerUsername);
    if (!beast) return undefined;
    beast.command = 'attack';
    beast.attackTargetKind = targetKind;
    beast.attackTargetId = targetId;
    return beast;
  }

  syncAttackTarget(ownerUsername: string, targetKind: 'monster' | 'player', targetId: string): void {
    const beast = this.beasts.get(ownerUsername);
    if (!beast || beast.command !== 'attack') return;
    beast.attackTargetKind = targetKind;
    beast.attackTargetId = targetId;
  }

  clearAttackTarget(ownerUsername: string): void {
    const beast = this.beasts.get(ownerUsername);
    if (!beast || beast.command !== 'attack') return;
    beast.attackTargetKind = undefined;
    beast.attackTargetId = undefined;
  }

  // "Until it is killed" — unlike a pet (which stays in the group,
  // marked fallen, forever), a dead tamed beast is removed OUTRIGHT, so
  // it really does "disappear from the group forever."
  applyDamage(ownerUsername: string, amount: number): { died: boolean } | undefined {
    const beast = this.beasts.get(ownerUsername);
    if (!beast) return undefined;
    beast.hp = Math.max(0, beast.hp - amount);
    const died = beast.hp <= 0;
    if (died) this.beasts.delete(ownerUsername);
    return { died };
  }

  // "Until... the player removes it" — a plain voluntary release, same
  // permanent-gone shape as a death.
  remove(ownerUsername: string): void {
    this.beasts.delete(ownerUsername);
  }

  // Same movement shape as PetManagerService.tickAll, trimmed (no
  // give/equip inventory, no evolution) — see that file's own doc
  // comments for the fuller reasoning behind each branch.
  tickAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const beast of this.beasts.values()) {
      // Item 6 of a later follow-up ask ("the tamed falcon beast should
      // have flight, so if the player flies over water, the tamed falcon
      // should be able to fly across the water with them") — a later
      // follow-up ask ("the druid transformed into falcon with a tamed
      // dire wolf — the dire wolf could walk on water, which shouldn't be
      // allowed... only flying creatures or those given flight by the
      // flight spell should cross water") narrowed this: the beast's OWN
      // kind being inherently flying (a tamed falcon/crystal wyvern) still
      // crosses water always, and the owner's REAL flight (the Flight
      // spell or Wisp Transformation) still carries any beast along — but
      // the owner's own BEAST TRANSFORM into a flying kind no longer
      // does, since that's a personal shapeshift, not something a
      // separate physical creature like a dire wolf can hitch a ride on.
      // See shared/constants.ts's canFollowerCrossWater doc comment.
      const owner = this.worldManager.getLocation(beast.ownerUsername);
      const canCrossWater = canFollowerCrossWater(beast.kind, owner, owner?.inBoat != null);
      // A later follow-up ask: "followers should move as fast as the
      // player, even with speed enhancements active" — see
      // stepsForOwnerSpeed's own doc comment and PetManagerService's
      // tickAll (the same fix, applied there first).
      const stepsThisTick = stepsForOwnerSpeed(owner);

      if (beast.command === 'attack' && beast.attackTargetKind && beast.attackTargetId) {
        const target = this.targetLocator?.(beast.attackTargetKind, beast.attackTargetId);
        if (!target) {
          beast.command = 'follow';
          beast.attackTargetKind = undefined;
          beast.attackTargetId = undefined;
          continue;
        }
        if (beast.map !== target.mapName) {
          changedMaps.add(beast.map);
          beast.map = target.mapName;
          beast.row = target.row;
          beast.col = target.col;
          changedMaps.add(beast.map);
          continue;
        }
        for (let i = 0; i < stepsThisTick; i++) {
          const step = computeFollowerStep(beast, target, beast.map, canCrossWater);
          if (!step) break;
          beast.row = step.row;
          beast.col = step.col;
          changedMaps.add(beast.map);
        }
        continue;
      }

      if (beast.command !== 'follow' && beast.command !== 'attack') continue;
      if (!owner) continue;
      if (beast.map !== owner.mapName) {
        changedMaps.add(beast.map);
        beast.map = owner.mapName;
        beast.row = owner.row;
        beast.col = owner.col;
        changedMaps.add(beast.map);
        continue;
      }
      for (let i = 0; i < stepsThisTick; i++) {
        const step = computeFollowerStep(beast, owner, beast.map, canCrossWater);
        if (!step) break;
        beast.row = step.row;
        beast.col = step.col;
        changedMaps.add(beast.map);
      }
    }
    return changedMaps;
  }

  checkContacts(): Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> {
    const contacts: Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> = [];
    const now = Date.now();
    for (const beast of this.beasts.values()) {
      if (beast.command !== 'attack' || !beast.attackTargetKind || !beast.attackTargetId) continue;
      if (now < (beast.nextAttackAt ?? 0)) continue;
      const target = this.targetLocator?.(beast.attackTargetKind, beast.attackTargetId);
      if (!target || target.mapName !== beast.map) continue;
      const dRow = target.row - beast.row;
      const dCol = target.col - beast.col;
      if (Math.abs(dRow) + Math.abs(dCol) <= 1) {
        beast.nextAttackAt = now + FOLLOWER_ATTACK_COOLDOWN_MS;
        contacts.push({ ownerUsername: beast.ownerUsername, targetKind: beast.attackTargetKind, targetId: beast.attackTargetId });
      }
    }
    return contacts;
  }

  // A modest passive regen (a pet gets one too — see PET_AWAKE_HEAL_PERCENT
  // /PET_SLEEP_HEAL_PERCENT) so a tamed beast that's taken a few counter-
  // attacks isn't permanently worn down; same cadence as every other
  // follower's own regenAll (the global stat tick).
  private static readonly AWAKE_HEAL_PERCENT = 6;
  private static readonly SLEEP_HEAL_PERCENT = 14;
  regenAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const beast of this.beasts.values()) {
      if (beast.hp >= beast.maxHp) continue;
      const percent = beast.command === 'sleep' ? TamedBeastManagerService.SLEEP_HEAL_PERCENT : TamedBeastManagerService.AWAKE_HEAL_PERCENT;
      beast.hp = Math.min(beast.maxHp, beast.hp + Math.round((percent / 100) * beast.maxHp));
      changedMaps.add(beast.map);
    }
    return changedMaps;
  }

  teleportToOwner(ownerUsername: string, map: MapName, row: number, col: number): MapName | undefined {
    const beast = this.beasts.get(ownerUsername);
    if (!beast) return undefined;
    const previousMap = beast.map;
    beast.map = map;
    beast.row = row;
    beast.col = col;
    return previousMap;
  }
}

export { randomUUID as randomTamedBeastId };
