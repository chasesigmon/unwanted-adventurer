import { Controller, Get } from '@nestjs/common';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MonsterManagerService } from '../monsters/monster-manager.service.js';
import { ItemManagerService } from '../items/item-manager.service.js';
import { MAPS } from '../game/maps.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly worldManager: WorldManagerService,
    private readonly monsterManager: MonsterManagerService,
    private readonly itemManager: ItemManagerService
  ) {}

  @Get()
  getHealth() {
    const stats = this.worldManager.getStats();
    return {
      ok: true,
      players: stats.totalPlayers,
      worlds: stats.worlds,
      maps: Array.from(MAPS.values()).map((m) => ({ name: m.name, rows: m.rows, cols: m.cols })),
      monsters: this.monsterManager
        .getAll()
        .map((m) => ({ id: m.id, kind: m.kind, hp: m.hp, mapName: m.mapName, row: m.row, col: m.col })),
      items: this.itemManager.getAll().map((i) => ({ id: i.id, name: i.name, mapName: i.mapName, row: i.row, col: i.col })),
    };
  }
}
