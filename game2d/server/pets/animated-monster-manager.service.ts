import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { MapName, MonsterKind, Race } from '../../shared/constants.js';
import type { PetCommand, AnimatedMonsterSnapshot, FollowerEquipmentSlot } from '../../shared/pets.js';
import { FOLLOWER_ATTACK_COOLDOWN_MS, computeFollowerStep } from '../../shared/pets.js';
import { animatedMonsterCapFor } from '../../shared/skills.js';
import { WorldManagerService } from '../worlds/world-manager.service.js';

interface AnimatedMonster extends AnimatedMonsterSnapshot {
  // Server-only — a later follow-up bug fix (see checkContacts below and
  // FOLLOWER_ATTACK_COOLDOWN_MS's own doc comment). Not part of the
  // client-visible AnimatedMonsterSnapshot shape.
  nextAttackAt?: number;
}

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
    col: number,
    isRare?: boolean
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
      isRare,
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

  // Same shape as PetManagerService's own syncAttackTarget/
  // clearAttackTarget — see that method's own doc comment — applied to
  // EVERY animated monster this owner has that's currently in 'attack'
  // mode (unlike a pet, there can be more than one at once).
  syncAttackTarget(ownerUsername: string, targetKind: 'monster' | 'player', targetId: string): void {
    for (const monster of this.monsters.get(ownerUsername) ?? []) {
      if (monster.alive && monster.command === 'attack') {
        monster.attackTargetKind = targetKind;
        monster.attackTargetId = targetId;
      }
    }
  }

  clearAttackTargetForOwner(ownerUsername: string): void {
    for (const monster of this.monsters.get(ownerUsername) ?? []) {
      if (monster.command === 'attack') {
        monster.attackTargetKind = undefined;
        monster.attackTargetId = undefined;
      }
    }
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
    const owned = this.monsters.get(ownerUsername);
    const monster = owned?.find((m) => m.id === id);
    if (!monster || !monster.alive) return undefined;
    monster.hp = Math.max(0, monster.hp - amount);
    const died = monster.hp <= 0;
    if (died) {
      monster.alive = false;
      // A later follow-up ask: "once a summon/animated dead are killed,
      // then they should be removed from the group entirely. Only a pet
      // should remain as 'fallen'... remove the body... don't leave it
      // there" — unlike a pet (which stays shown, alive: false, as
      // "— fallen"), a dead animated monster/summon is dropped from the
      // array outright, same as the player's own manual "Remove" button
      // (see remove() above). The now-detached `monster` object is still
      // returned below so the caller can still report its final hp/name.
      const index = owned!.findIndex((m) => m.id === id);
      if (index !== -1) owned!.splice(index, 1);
    }
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

        // A later follow-up ask: "pets/animated dead/summons cannot
        // travel over water" unless the OWNER is flying (item 4) — an
        // animated monster/summon, unlike a pet, only fits on the LARGE
        // raft, never the small canoe (see shared/boats.ts's own doc
        // comment on canoe capacity).
        const owner = this.worldManager.getLocation(monster.ownerUsername);
        const canCrossWater = owner?.flightActive === true || owner?.inBoat === 'large';

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
          const step = computeFollowerStep(monster, target, monster.map, canCrossWater);
          if (!step) continue; // already adjacent, or blocked by water on both axes
          monster.row = step.row;
          monster.col = step.col;
          changedMaps.add(monster.map);
          continue;
        }

        // A follow-up bug fix — see PetManagerService.tickAll's own doc
        // comment on why 'attack' with no current target falls through
        // to plain following instead of standing frozen.
        if (monster.command !== 'follow' && monster.command !== 'attack') continue;
        if (!owner) continue;
        if (monster.map !== owner.mapName) {
          changedMaps.add(monster.map);
          monster.map = owner.mapName;
          monster.row = owner.row;
          monster.col = owner.col;
          changedMaps.add(monster.map);
          continue;
        }
        const step = computeFollowerStep(monster, owner, monster.map, canCrossWater);
        if (!step) continue;
        monster.row = step.row;
        monster.col = step.col;
        changedMaps.add(monster.map);
      }
    }
    return changedMaps;
  }

  // A later follow-up bug fix moved this onto the SAME fast per-tile
  // movement tick as tickAll (see game.gateway.ts's own doc comment on
  // ATTACK_COOLDOWN_MS/PetManagerService.checkContacts) — each animated
  // monster's own nextAttackAt cooldown (set right here) keeps hit
  // FREQUENCY unchanged at FOLLOWER_ATTACK_COOLDOWN_MS regardless of how
  // often this itself is now called. Each reported contact also carries
  // the specific animated monster's own id, unlike a pet, since an owner
  // can have more than one, so the caller knows which one to credit/update.
  checkContacts(): Array<{ ownerUsername: string; id: string; targetKind: 'monster' | 'player'; targetId: string }> {
    const contacts: Array<{ ownerUsername: string; id: string; targetKind: 'monster' | 'player'; targetId: string }> = [];
    const now = Date.now();
    for (const owned of this.monsters.values()) {
      for (const monster of owned) {
        if (!monster.alive || monster.command !== 'attack' || !monster.attackTargetKind || !monster.attackTargetId) continue;
        if (now < (monster.nextAttackAt ?? 0)) continue;
        const target = this.targetLocator?.(monster.attackTargetKind, monster.attackTargetId);
        if (!target || target.mapName !== monster.map) continue;
        const dRow = target.row - monster.row;
        const dCol = target.col - monster.col;
        if (Math.abs(dRow) + Math.abs(dCol) <= 1) {
          monster.nextAttackAt = now + FOLLOWER_ATTACK_COOLDOWN_MS;
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
