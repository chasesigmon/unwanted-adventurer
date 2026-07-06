import { Worker } from 'worker_threads';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveMove, resolveMinimap } from '../game/resolveMove.js';
import type { AppConfig } from '../config/configuration.js';
import type { MapName } from '../../shared/constants.js';
import type { Direction } from '../../shared/directions.js';
import type { Location } from '../game/types.js';
import type { MinimapCell } from '../../shared/types.js';
import type { WorkerRequest, WorkerResponse, WorkerMoveResult, MoveRequest, MoveMessage } from './protocol.js';

const WORKER_URL = new URL('./room-worker.js', import.meta.url);

interface RoomEntry {
  id: string;
  mapName: MapName;
  worker: Worker | null;
  size: number;
}

interface PlayerLocation extends Location {
  roomId: string;
}

export interface RoomStat {
  id: string;
  mapName: MapName;
  size: number;
  worker: boolean;
}

export interface RoomManagerStats {
  totalPlayers: number;
  rooms: RoomStat[];
}

// Groups connected players into rooms of at most `roomCapacity`, per map.
// The first room created for a given map is processed inline on the main
// thread (cheap — no point spinning up a worker for a handful of players);
// every room after that is backed by its own worker_thread, which owns
// that room's player positions and movement resolution entirely off the
// main thread. Players are reassigned rooms (and therefore possibly
// threads) automatically when they transition maps.
@Injectable()
export class RoomManagerService {
  private rooms = new Map<string, RoomEntry>();
  private roomsByMap = new Map<MapName, string[]>(); // creation order
  private playerLocation = new Map<string, PlayerLocation>();
  private reqCounter = 0;
  private readonly roomCapacity: number;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.roomCapacity = configService.get('roomCapacity', { infer: true });
  }

  private ensureRoomForMap(mapName: MapName): string {
    const roomIds = this.roomsByMap.get(mapName) ?? [];
    for (const roomId of roomIds) {
      const room = this.rooms.get(roomId);
      if (room && room.size < this.roomCapacity) return roomId;
    }

    const roomId = `${mapName}#${roomIds.length + 1}`;
    const isOverflowRoom = roomIds.length > 0;
    const worker = isOverflowRoom ? new Worker(WORKER_URL) : null;

    if (worker) {
      worker.on('error', (err) => console.error(`[rooms] worker error in ${roomId}:`, err));
      console.log(
        `[rooms] player count exceeded ${this.roomCapacity} for "${mapName}" — spawned worker_thread for room ${roomId}`
      );
    } else {
      console.log(`[rooms] created room ${roomId} (main thread)`);
    }

    this.rooms.set(roomId, { id: roomId, mapName, worker, size: 0 });
    this.roomsByMap.set(mapName, [...roomIds, roomId]);
    return roomId;
  }

  private askWorker(worker: Worker, message: MoveRequest): Promise<WorkerMoveResult> {
    return new Promise((resolve) => {
      const reqId = ++this.reqCounter;
      const onMessage = (msg: WorkerResponse) => {
        if (msg.reqId === reqId) {
          worker.off('message', onMessage);
          resolve(msg.result);
        }
      };
      worker.on('message', onMessage);
      const wireMessage: MoveMessage = { ...message, reqId };
      worker.postMessage(wireMessage);
    });
  }

  async addPlayer(username: string, mapName: MapName, row: number, col: number): Promise<string> {
    const roomId = this.ensureRoomForMap(mapName);
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} vanished immediately after creation.`);

    this.playerLocation.set(username, { roomId, mapName, row, col });
    room.size += 1;
    if (room.worker) {
      room.worker.postMessage({ type: 'add', username, mapName, row, col } satisfies WorkerRequest);
    }
    return roomId;
  }

  removePlayer(username: string): void {
    const loc = this.playerLocation.get(username);
    if (!loc) return;
    const room = this.rooms.get(loc.roomId);
    if (room) {
      room.size = Math.max(0, room.size - 1);
      if (room.worker) room.worker.postMessage({ type: 'remove', username } satisfies WorkerRequest);
    }
    this.playerLocation.delete(username);
  }

  getLocation(username: string): PlayerLocation | undefined {
    return this.playerLocation.get(username);
  }

  getMinimap(username: string): MinimapCell[] | null {
    const loc = this.playerLocation.get(username);
    return loc ? resolveMinimap(loc) : null;
  }

  getStats(): RoomManagerStats {
    const rooms: RoomStat[] = Array.from(this.rooms.values()).map((r) => ({
      id: r.id,
      mapName: r.mapName,
      size: r.size,
      worker: Boolean(r.worker),
    }));
    return { totalPlayers: rooms.reduce((sum, r) => sum + r.size, 0), rooms };
  }

  async processCommand(username: string, direction: Direction): Promise<WorkerMoveResult | null> {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;
    const room = this.rooms.get(loc.roomId);
    if (!room) return null;

    const result: WorkerMoveResult = room.worker
      ? await this.askWorker(room.worker, { type: 'move', username, direction })
      : resolveMove(loc, direction);

    if (result.ok) {
      if (result.transitioned) {
        this.removePlayer(username);
        await this.addPlayer(username, result.mapName, result.row, result.col);
      } else {
        loc.row = result.row;
        loc.col = result.col;
      }
    }

    return result;
  }
}
