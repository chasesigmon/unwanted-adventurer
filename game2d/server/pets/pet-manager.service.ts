import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName } from '../../shared/constants.js';
import type { PetKind, PetCommand, PetSnapshot } from '../../shared/pets.js';
import { PET_KIND_LABELS, PET_STARTING_HP } from '../../shared/pets.js';
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

  grantExp(ownerUsername: string, gained: number): Pet | undefined {
    const pet = this.pets.get(ownerUsername);
    if (!pet || !pet.alive) return undefined;
    const { level, exp } = applyExpGain({ level: pet.level, exp: pet.exp }, gained);
    if (level > pet.level) {
      pet.hp = pet.maxHp + (level - pet.level) * 10;
      pet.maxHp = pet.hp;
    }
    pet.level = level;
    pet.exp = exp;
    return pet;
  }

  // Called every wander tick (see MonsterManagerService.wanderAll's own
  // sibling call in game.gateway.ts) — 'follow' steps one tile toward its
  // own owner's CURRENT position (looked up fresh from WorldManagerService
  // every tick, not cached) when not already adjacent; 'attack' (a later
  // follow-up ask's 'z' hotkey) steps toward its assigned target instead,
  // reporting a "contact" for any tick it's already adjacent so the
  // caller (GameGateway) can resolve the actual damage/player-auto-attack
  // hookup — this method only ever moves things, it doesn't deal damage
  // itself (see PetManagerService's own file-level doc comment: that's
  // still resolved alongside the ordinary player combat tick). 'stay'/
  // 'sleep' hold still, same as before.
  tickAll(): { changedMaps: Set<MapName>; contacts: Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> } {
    const changedMaps = new Set<MapName>();
    const contacts: Array<{ ownerUsername: string; targetKind: 'monster' | 'player'; targetId: string }> = [];
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
        if (Math.abs(dRow) + Math.abs(dCol) <= 1) {
          contacts.push({ ownerUsername: pet.ownerUsername, targetKind: pet.attackTargetKind, targetId: pet.attackTargetId });
          continue;
        }
        if (Math.abs(dRow) >= Math.abs(dCol)) {
          pet.row += Math.sign(dRow);
        } else {
          pet.col += Math.sign(dCol);
        }
        changedMaps.add(pet.map);
        continue;
      }

      if (pet.command !== 'follow') continue;
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
    return { changedMaps, contacts };
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
