import { Controller, Get } from '@nestjs/common';
import { WorldManagerService } from '../worlds/world-manager.service.js';
import { MAPS } from '../game/maps.js';

@Controller('health')
export class HealthController {
  constructor(private readonly worldManager: WorldManagerService) {}

  @Get()
  getHealth() {
    const stats = this.worldManager.getStats();
    return {
      ok: true,
      players: stats.totalPlayers,
      worlds: stats.worlds,
      maps: Array.from(MAPS.values()).map((m) => ({ name: m.name, rows: m.rows, cols: m.cols })),
    };
  }
}
