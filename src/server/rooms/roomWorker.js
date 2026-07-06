import { parentPort } from 'worker_threads';
import { resolveMove } from '../game/resolveMove.js';

// Entry point for a room's dedicated worker_thread. Owns the live
// {mapName, row, col} for every player currently assigned to this room and
// processes their movement here, off the main thread. Communication with
// the main thread (RoomManager) is message-passing only — no shared
// memory, by design.
const players = new Map(); // username -> { mapName, row, col }

parentPort.on('message', (msg) => {
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
        parentPort.postMessage({
          reqId: msg.reqId,
          result: { ok: false, transitioned: false, mapName: null, row: null, col: null },
        });
        break;
      }

      const result = resolveMove(location, msg.direction);
      if (result.ok) {
        location.mapName = result.mapName;
        location.row = result.row;
        location.col = result.col;
      }
      parentPort.postMessage({ reqId: msg.reqId, result });
      break;
    }
    default:
      break;
  }
});
