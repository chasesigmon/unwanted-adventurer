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

const WORKER_URL = new URL('./world-worker.js', import.meta.url);

interface WorldEntry {
  id: string;
  mapName: MapName;
  worker: Worker | null;
  size: number;
}

interface PlayerLocation extends Location {
  worldId: string;
}

export interface WorldStat {
  id: string;
  mapName: MapName;
  size: number;
  worker: boolean;
}

export interface WorldManagerStats {
  totalPlayers: number;
  worlds: WorldStat[];
}

// Groups connected players into world instances of at most
// `worldCapacity`, per map. The first instance created for a given map is
// processed inline on the main thread (cheap — no point spinning up a
// worker for a handful of players); every instance after that is backed by
// its own worker_thread, which owns that instance's player positions and
// movement resolution entirely off the main thread. Players are reassigned
// instances (and therefore possibly threads) automatically when they
// transition maps.
@Injectable()
export class WorldManagerService {
  private worlds = new Map<string, WorldEntry>();
  private worldsByMap = new Map<MapName, string[]>(); // creation order
  private playerLocation = new Map<string, PlayerLocation>();
  private reqCounter = 0;
  private readonly worldCapacity: number;

  constructor(configService: ConfigService<AppConfig, true>) {
    this.worldCapacity = configService.get('worldCapacity', { infer: true });
  }

  private ensureWorldForMap(mapName: MapName): string {
    const worldIds = this.worldsByMap.get(mapName) ?? [];
    for (const worldId of worldIds) {
      const world = this.worlds.get(worldId);
      if (world && world.size < this.worldCapacity) return worldId;
    }

    const worldId = `${mapName}#${worldIds.length + 1}`;
    const isOverflowWorld = worldIds.length > 0;
    const worker = isOverflowWorld ? new Worker(WORKER_URL) : null;

    if (worker) {
      worker.on('error', (err) => console.error(`[worlds] worker error in ${worldId}:`, err));
      console.log(
        `[worlds] player count exceeded ${this.worldCapacity} for "${mapName}" — spawned worker_thread for world ${worldId}`
      );
    } else {
      console.log(`[worlds] created world ${worldId} (main thread)`);
    }

    this.worlds.set(worldId, { id: worldId, mapName, worker, size: 0 });
    this.worldsByMap.set(mapName, [...worldIds, worldId]);
    return worldId;
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
    const worldId = this.ensureWorldForMap(mapName);
    const world = this.worlds.get(worldId);
    if (!world) throw new Error(`World ${worldId} vanished immediately after creation.`);

    this.playerLocation.set(username, { worldId, mapName, row, col });
    world.size += 1;
    if (world.worker) {
      world.worker.postMessage({ type: 'add', username, mapName, row, col } satisfies WorkerRequest);
    }
    return worldId;
  }

  removePlayer(username: string): void {
    const loc = this.playerLocation.get(username);
    if (!loc) return;
    const world = this.worlds.get(loc.worldId);
    if (world) {
      world.size = Math.max(0, world.size - 1);
      if (world.worker) world.worker.postMessage({ type: 'remove', username } satisfies WorkerRequest);
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

  getStats(): WorldManagerStats {
    const worlds: WorldStat[] = Array.from(this.worlds.values()).map((w) => ({
      id: w.id,
      mapName: w.mapName,
      size: w.size,
      worker: Boolean(w.worker),
    }));
    return { totalPlayers: worlds.reduce((sum, w) => sum + w.size, 0), worlds };
  }

  async processCommand(username: string, direction: Direction): Promise<WorkerMoveResult | null> {
    const loc = this.playerLocation.get(username);
    if (!loc) return null;
    const world = this.worlds.get(loc.worldId);
    if (!world) return null;

    const result: WorkerMoveResult = world.worker
      ? await this.askWorker(world.worker, { type: 'move', username, direction })
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
