import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

import { resolveMove, resolveMinimap } from '../game/resolveMove.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'roomWorker.js');

// Groups connected players into rooms of at most `config.roomCapacity`,
// per map. The first room created for a given map is processed inline on
// the main thread (cheap — no point spinning up a worker for a handful of
// players); every room after that is backed by its own worker_thread,
// which owns that room's player positions and movement resolution
// entirely off the main thread. Players are reassigned rooms (and
// therefore possibly threads) automatically when they transition maps.
export class RoomManager {
  constructor() {
    this.rooms = new Map(); // roomId -> { id, mapName, worker: Worker|null, size }
    this.roomsByMap = new Map(); // mapName -> roomId[] (creation order)
    this.playerLocation = new Map(); // username -> { roomId, mapName, row, col }
    this._reqCounter = 0;
  }

  _ensureRoomForMap(mapName) {
    const roomIds = this.roomsByMap.get(mapName) || [];
    for (const roomId of roomIds) {
      if (this.rooms.get(roomId).size < config.roomCapacity) return roomId;
    }

    const roomId = `${mapName}#${roomIds.length + 1}`;
    const isOverflowRoom = roomIds.length > 0;
    const worker = isOverflowRoom ? new Worker(WORKER_PATH) : null;

    if (worker) {
      worker.on('error', (err) => console.error(`[rooms] worker error in ${roomId}:`, err));
      console.log(`[rooms] player count exceeded ${config.roomCapacity} for "${mapName}" — spawned worker_thread for room ${roomId}`);
    } else {
      console.log(`[rooms] created room ${roomId} (main thread)`);
    }

    this.rooms.set(roomId, { id: roomId, mapName, worker, size: 0 });
    this.roomsByMap.set(mapName, [...roomIds, roomId]);
    return roomId;
  }

  _askWorker(worker, message) {
    return new Promise((resolve) => {
      const reqId = ++this._reqCounter;
      const onMessage = (msg) => {
        if (msg.reqId === reqId) {
          worker.off('message', onMessage);
          resolve(msg.result);
        }
      };
      worker.on('message', onMessage);
      worker.postMessage({ ...message, reqId });
    });
  }

  async addPlayer(username, mapName, row, col) {
    const roomId = this._ensureRoomForMap(mapName);
    const room = this.rooms.get(roomId);
    this.playerLocation.set(username, { roomId, mapName, row, col });
    room.size += 1;
    if (room.worker) {
      room.worker.postMessage({ type: 'add', username, mapName, row, col });
    }
    return roomId;
  }

  removePlayer(username) {
    const loc = this.playerLocation.get(username);
    if (!loc) return;
    const room = this.rooms.get(loc.roomId);
    if (room) {
      room.size = Math.max(0, room.size - 1);
      if (room.worker) room.worker.postMessage({ type: 'remove', username });
    }
    this.playerLocation.delete(username);
  }

  getLocation(username) {
    return this.playerLocation.get(username);
  }

  getMinimap(username) {
    const loc = this.playerLocation.get(username);
    return loc ? resolveMinimap(loc) : null;
  }

  getStats() {
    const rooms = Array.from(this.rooms.values()).map((r) => ({
      id: r.id,
      mapName: r.mapName,
      size: r.size,
      worker: Boolean(r.worker),
    }));
    return { totalPlayers: rooms.reduce((sum, r) => sum + r.size, 0), rooms };
  }

  async processCommand(username, direction) {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;
    const room = this.rooms.get(loc.roomId);

    const result = room.worker
      ? await this._askWorker(room.worker, { type: 'move', username, direction })
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
