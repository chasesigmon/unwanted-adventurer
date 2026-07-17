import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName, MonsterKind, Race } from '../../shared/constants.js';
import type { PetCommand, AnimatedMonsterSnapshot, FollowerEquipmentSlot } from '../../shared/pets.js';
import { animatedMonsterCapFor } from '../../shared/skills.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';

interface AnimatedMonster extends AnimatedMonsterSnapshot {}

// The Necromancer's own animate dead spell (a later follow-up ask) — up
// to 1 or 2 animated monsters per owner (see animatedMonsterCapFor),
// entirely in-memory like every other in-world manager here. Keyed by
// owner username -> an ARRAY (unlike PetManagerService's strict 1:1 map),
// since a player can hold more than one animated monster at once.
@Injectable()
export class AnimatedMonsterManagerService {
  private monsters = new Map<string, AnimatedMonster[]>();

  constructor(private readonly worldManager: WorldManagerService) {}

  // Same shape as PetManagerService's own setTargetLocator — injected by
  // GameGateway so tickAll below can locate a monster/player target
  // without a direct dependency on MonsterManagerService.
  private targetLocator?: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined;

  setTargetLocator(locator: (kind: 'monster' | 'player', id: string) => { mapName: MapName; row: number; col: number } | undefined): void {
    this.targetLocator = locator;
  }

  countFor(ownerUsername: string): number {
    return this.monsters.get(ownerUsername)?.length ?? 0;
  }

  animate(
    ownerUsername: string,
    ownerLevel: number,
    monsterKind: MonsterKind | Race,
    name: string,
    maxHp: number,
    attackDamage: number,
    map: MapName,
    row: number,
    col: number
  ): AnimatedMonster | undefined {
    const owned = this.monsters.get(ownerUsername) ?? [];
    if (owned.length >= animatedMonsterCapFor(ownerLevel)) return undefined;
    const monster: AnimatedMonster = {
      id: randomUUID(),
      ownerUsername,
      monsterKind,
      name,
      hp: maxHp,
      maxHp,
      attackDamage,
      map,
      row,
      col,
      command: 'follow',
      inventory: [],
      equipment: {},
      alive: true,
    };
    owned.push(monster);
    this.monsters.set(ownerUsername, owned);
    return monster;
  }

  setCommand(ownerUsername: string, id: string, command: PetCommand): AnimatedMonster | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    monster.command = command;
    if (command !== 'attack') {
      monster.attackTargetKind = undefined;
      monster.attackTargetId = undefined;
    }
    return monster;
  }

  // The 'z' hotkey (a later follow-up ask) — same shape as
  // PetManagerService.commandAttack, just needs the specific monster's
  // own id too since an owner can have more than one at once.
  commandAttack(ownerUsername: string, id: string, targetKind: 'monster' | 'player', targetId: string): AnimatedMonster | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    monster.command = 'attack';
    monster.attackTargetKind = targetKind;
    monster.attackTargetId = targetId;
    return monster;
  }

  // Phase C's "give/equip" ask — same shape as PetManagerService's own
  // giveItem/takeItem/equipItem/unequipItem, just keyed by id too since an
  // owner can have more than one animated monster at once.
  giveItem(ownerUsername: string, id: string, item: string): AnimatedMonster | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    monster.inventory = [...monster.inventory, item];
    return monster;
  }

  takeItem(ownerUsername: string, id: string, itemIndex: number): { monster: AnimatedMonster; item: string } | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    const item = monster.inventory[itemIndex];
    if (item === undefined) return undefined;
    monster.inventory = monster.inventory.filter((_, i) => i !== itemIndex);
    return { monster, item };
  }

  equipItem(ownerUsername: string, id: string, itemIndex: number, slot: FollowerEquipmentSlot): AnimatedMonster | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    const item = monster.inventory[itemIndex];
    if (item === undefined) return undefined;
    const inventory = monster.inventory.filter((_, i) => i !== itemIndex);
    const previous = monster.equipment[slot];
    if (previous) inventory.push(previous);
    monster.inventory = inventory;
    monster.equipment = { ...monster.equipment, [slot]: item };
    return monster;
  }

  unequipItem(ownerUsername: string, id: string, slot: FollowerEquipmentSlot): AnimatedMonster | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    const item = monster.equipment[slot];
    if (!item) return undefined;
    const { [slot]: _removed, ...rest } = monster.equipment;
    monster.equipment = rest;
    monster.inventory = [...monster.inventory, item];
    return monster;
  }

  // Same simplified "just subtract hp" contact-damage shape
  // PetManagerService.applyDamage already uses.
  applyDamage(ownerUsername: string, id: string, amount: number): { monster: AnimatedMonster; died: boolean } | undefined {
    const monster = this.monsters.get(ownerUsername)?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    monster.hp = Math.max(0, monster.hp - amount);
    const died = monster.hp <= 0;
    if (died) monster.alive = false;
    return { monster, died };
  }

  // Same follow-toward-owner/attack-toward-target stepping logic as
  // PetManagerService.tickAll — see that method's own doc comment (now on
  // a faster FOLLOWER_STEP_MS cadence, movement only, no contact
  // reporting — see checkContacts below) — just iterating every owner's
  // whole array instead of a single pet.
  tickAll(): Set<MapName> {
    const changedMaps = new Set<MapName>();
    for (const owned of this.monsters.values()) {
      for (const monster of owned) {
        if (!monster.alive) continue;

        if (monster.command === 'attack' && monster.attackTargetKind && monster.attackTargetId) {
          const target = this.targetLocator?.(monster.attackTargetKind, monster.attackTargetId);
          if (!target) {
            monster.command = 'follow';
            monster.attackTargetKind = undefined;
            monster.attackTargetId = undefined;
            continue;
          }
          if (monster.map !== target.mapName) {
            changedMaps.add(monster.map);
            monster.map = target.mapName;
            monster.row = target.row;
            monster.col = target.col;
            changedMaps.add(monster.map);
            continue;
          }
          const dRow = target.row - monster.row;
          const dCol = target.col - monster.col;
          if (Math.abs(dRow) + Math.abs(dCol) <= 1) continue; // already adjacent — checkContacts handles this
          if (Math.abs(dRow) >= Math.abs(dCol)) {
            monster.row += Math.sign(dRow);
          } else {
            monster.col += Math.sign(dCol);
          }
          changedMaps.add(monster.map);
          continue;
        }

        if (monster.command !== 'follow') continue;
        const owner = this.worldManager.getLocation(monster.ownerUsername);
        if (!owner) continue;
        if (monster.map !== owner.mapName) {
          changedMaps.add(monster.map);
          monster.map = owner.mapName;
          monster.row = owner.row;
          monster.col = owner.col;
          changedMaps.add(monster.map);
          continue;
        }
        const dRow = owner.row - monster.row;
        const dCol = owner.col - monster.col;
        if (Math.abs(dRow) + Math.abs(dCol) <= 1) continue;
        if (Math.abs(dRow) >= Math.abs(dCol)) {
          monster.row += Math.sign(dRow);
        } else {
          monster.col += Math.sign(dCol);
        }
        changedMaps.add(monster.map);
      }
    }
    return changedMaps;
  }

  // Called from the slower, original combat tick — same read-only
  // adjacency check as PetManagerService.checkContacts, just over every
  // owner's whole array (each reported contact also carries the specific
  // animated monster's own id, unlike a pet, since an owner can have more
  // than one, so the caller knows which one to credit/update).
  checkContacts(): Array<{ ownerUsername: string; id: string; targetKind: 'monster' | 'player'; targetId: string }> {
    const contacts: Array<{ ownerUsername: string; id: string; targetKind: 'monster' | 'player'; targetId: string }> = [];
    for (const owned of this.monsters.values()) {
      for (const monster of owned) {
        if (!monster.alive || monster.command !== 'attack' || !monster.attackTargetKind || !monster.attackTargetId) continue;
        const target = this.targetLocator?.(monster.attackTargetKind, monster.attackTargetId);
        if (!target || target.mapName !== monster.map) continue;
        const dRow = target.row - monster.row;
        const dCol = target.col - monster.col;
        if (Math.abs(dRow) + Math.abs(dCol) <= 1) {
          contacts.push({ ownerUsername: monster.ownerUsername, id: monster.id, targetKind: monster.attackTargetKind, targetId: monster.attackTargetId });
        }
      }
    }
    return contacts;
  }

  // "Lasts the entire time the player is logged in" — called on
  // disconnect (see game.gateway.ts's handleDisconnect).
  removeAllForOwner(ownerUsername: string): void {
    this.monsters.delete(ownerUsername);
  }

  // "There should be an option... to 'remove' and get rid of" (a later
  // follow-up ask, asked for animate dead/monster summons/demon imp/the
  // Illusionist's duplicate alike) — a deliberate player action, unlike
  // dying (hp reaching 0) or the owner disconnecting. Returns false if
  // this owner has no such monster (already gone/wrong id).
  remove(ownerUsername: string, id: string): boolean {
    const owned = this.monsters.get(ownerUsername);
    if (!owned) return false;
    const index = owned.findIndex((m) => m.id === id);
    if (index === -1) return false;
    owned.splice(index, 1);
    return true;
  }

  // Recall's own "bring my companions with me" behavior (a later
  // follow-up ask) — same instant-snap shape as PetManagerService's own
  // teleportToOwner. Returns every distinct PREVIOUS map any of this
  // owner's animated monsters were on (so the caller can re-broadcast
  // those too) — empty if this owner has none.
  teleportAllToOwner(ownerUsername: string, map: MapName, row: number, col: number): Set<MapName> {
    const previousMaps = new Set<MapName>();
    for (const monster of this.monsters.get(ownerUsername) ?? []) {
      if (!monster.alive) continue;
      previousMaps.add(monster.map);
      monster.map = map;
      monster.row = row;
      monster.col = col;
    }
    return previousMaps;
  }

  getSnapshotsForMap(mapName: MapName): AnimatedMonsterSnapshot[] {
    const snapshots: AnimatedMonsterSnapshot[] = [];
    for (const owned of this.monsters.values()) {
      for (const monster of owned) {
        if (monster.map === mapName) snapshots.push({ ...monster });
      }
    }
    return snapshots;
  }

  getSnapshotsForOwner(ownerUsername: string): AnimatedMonsterSnapshot[] {
    return (this.monsters.get(ownerUsername) ?? []).map((m) => ({ ...m }));
  }
}
