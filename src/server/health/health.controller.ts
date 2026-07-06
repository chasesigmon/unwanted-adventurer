import { Controller, Get } from '@nestjs/common';
import { RoomManagerService } from '../rooms/room-manager.service.js';
import { MAPS } from '../game/maps.js';

@Controller('health')
export class HealthController {
  constructor(private readonly roomManager: RoomManagerService) {}

  @Get()
  getHealth() {
    const stats = this.roomManager.getStats();
    return {
      ok: true,
      players: stats.totalPlayers,
      rooms: stats.rooms,
      maps: Array.from(MAPS.values()).map((m) => ({ name: m.name, rows: m.rows, cols: m.cols })),
    };
  }
}
