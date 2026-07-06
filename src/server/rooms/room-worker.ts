import { parentPort } from 'worker_threads';
import { resolveMove } from '../game/resolveMove.js';
import type { Location } from '../game/types.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

if (!parentPort) {
  throw new Error('room-worker.ts must be run as a worker_thread, not imported directly.');
}
const port = parentPort;

// Entry point for a room's dedicated worker_thread. Owns the live
// {mapName, row, col} for every player currently assigned to this room and
// processes their movement here, off the main thread. Communication with
// the main thread (RoomManager) is message-passing only — no shared
// memory, by design.
const players = new Map<string, Location>();

port.on('message', (msg: WorkerRequest) => {
  switch (msg.type) {
    case 'add': {
      players.set(msg.username, { mapName: msg.mapName, row: msg.row, col: msg.col });
      break;
    }
    case 'remove': {
      players.delete(msg.username);
      break;
    }
    case 'move': {
      const location = players.get(msg.username);
      if (!location) {
        const response: WorkerResponse = {
          reqId: msg.reqId,
          result: { ok: false, transitioned: false, error: 'not-found' },
        };
        port.postMessage(response);
        break;
      }

      const result = resolveMove(location, msg.direction);
      if (result.ok) {
        location.mapName = result.mapName;
        location.row = result.row;
        location.col = result.col;
      }
      const response: WorkerResponse = { reqId: msg.reqId, result };
      port.postMessage(response);
      break;
    }
    default:
      break;
  }
});
