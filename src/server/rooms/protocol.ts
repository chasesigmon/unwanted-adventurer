import type { MapName } from '../../shared/constants.js';
import type { Direction } from '../../shared/directions.js';
import type { MoveResult } from '../game/types.js';

// Message protocol between RoomManager (main thread) and a room's
// worker_thread. Message-passing only, deliberately — no shared memory.
export interface AddMessage {
  type: 'add';
  username: string;
  mapName: MapName;
  row: number;
  col: number;
}

export interface RemoveMessage {
  type: 'remove';
  username: string;
}

export interface MoveRequest {
  type: 'move';
  username: string;
  direction: Direction;
}

// What RoomManager constructs when it wants to ask a worker to resolve a
// move — reqId isn't part of this because the caller doesn't pick it;
// `RoomManager.askWorker` assigns it before the message actually goes over
// the wire (see MoveMessage below).
export type MoveMessage = MoveRequest & { reqId: number };

export type WorkerRequest = AddMessage | RemoveMessage | MoveMessage;

// A worker can additionally report "not-found" (the room's local player
// record is missing) — this should never happen in practice since
// RoomManager always sends 'add' before any 'move' for a given player, but
// the protocol still has to account for it rather than fake up coordinates.
export type WorkerMoveResult = MoveResult | { ok: false; transitioned: false; error: 'not-found' };

export interface WorkerResponse {
  reqId: number;
  result: WorkerMoveResult;
}
