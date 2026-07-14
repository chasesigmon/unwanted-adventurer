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
  // every tick, not cached) when not already adjacent; every other
  // command holds still (attack's own damage-dealing is resolved
  // separately, alongside the ordinary player combat tick, since it needs
  // the owner's current combat target). Returns which maps actually
  // changed, so the caller only needs to re-broadcast those.
  tickAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const pet of this.pets.values()) {
      if (!pet.alive || pet.command !== 'follow') continue;
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

  removePet(ownerUsername: string): void {
    this.pets.delete(ownerUsername);
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
