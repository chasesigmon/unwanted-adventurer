import { PlayerModel } from '../models/Player.js';
import { getMap } from '../game/maps.js';
import { STARTING_MAP } from '../../shared/constants.js';
import { DIRECTION_ALIASES } from '../../shared/directions.js';
import { verifySessionToken } from '../auth/jwt.js';
import { isSessionValid, clearActiveSession } from '../auth/sessionStore.js';
import { setActiveSocket, clearActiveSocketIfCurrent } from '../state/activeConnections.js';
import { isConnectionRateLimited } from '../middleware/socketConnectionLimiter.js';
import { CommandRateLimiter } from '../middleware/CommandRateLimiter.js';
import { commandSchema } from '../validation/schemas.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { GameServer, CommandAck } from './types.js';
import type { SessionTokenPayload } from '../auth/jwt.js';

export function registerSocketHandlers(io: GameServer, roomManager: RoomManager): void {
  // Runs on every handshake, before 'connection' fires: connection-rate
  // limiting, then JWT + Redis session validation. A stale token (expired,
  // or superseded by a newer login elsewhere) is rejected here rather than
  // ever reaching game logic.
  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (isConnectionRateLimited(ip)) {
      next(new Error('Too many connection attempts. Please slow down.'));
      return;
    }

    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('Missing session token.'));
      return;
    }

    let payload: SessionTokenPayload;
    try {
      payload = verifySessionToken(token);
    } catch {
      next(new Error('Invalid or expired session.'));
      return;
    }

    const valid = await isSessionValid(payload.username, payload.sessionId);
    if (!valid) {
      next(new Error('Session expired or replaced elsewhere.'));
      return;
    }

    socket.data.username = payload.username;
    next();
  });

  io.on('connection', async (socket) => {
    const { username } = socket.data;
    const commandLimiter = new CommandRateLimiter();

    setActiveSocket(username, socket.id);

    const startingMap = getMap(STARTING_MAP);
    let doc = null;
    try {
      doc = await PlayerModel.findOne({ username });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[db] could not load player doc on connect:', message);
    }

    const mapName = doc?.map ?? STARTING_MAP;
    const row = doc?.row ?? Math.floor(startingMap.rows / 2);
    const col = doc?.col ?? Math.floor(startingMap.cols / 2);

    await roomManager.addPlayer(username, mapName, row, col);

    socket.emit('sync', {
      player: { username, map: mapName, row, col },
      minimap: roomManager.getMinimap(username) ?? [],
    });

    socket.on('command', async (rawText, ack) => {
      if (!commandLimiter.tryConsume()) {
        ack({ ok: false, message: 'Slow down — too many commands.' });
        return;
      }

      const parsed = commandSchema.safeParse(rawText);
      if (!parsed.success) {
        ack({ ok: false, message: 'Invalid command.' });
        return;
      }
      const text = parsed.data.toLowerCase();

      if (text === 'logout') {
        await clearActiveSession(username);
        clearActiveSocketIfCurrent(username, socket.id);
        ack({ ok: true, message: 'You have logged out.', loggedOut: true });
        socket.disconnect(true);
        return;
      }

      const direction = DIRECTION_ALIASES[text];
      if (!direction) {
        const loc = roomManager.getLocation(username);
        const ackPayload: CommandAck = {
          ok: false,
          message: `Unknown command: "${rawText}".`,
          minimap: roomManager.getMinimap(username),
        };
        if (loc) {
          ackPayload.player = { username, map: loc.mapName, row: loc.row, col: loc.col };
        }
        ack(ackPayload);
        return;
      }

      const fromMap = roomManager.getLocation(username)?.mapName ?? 'the world';
      const result = await roomManager.processCommand(username, direction);

      if (!result) {
        ack({ ok: false, message: 'Your session was lost. Please reconnect.' });
        return;
      }

      let message: string;
      if (!result.ok) {
        message = `${username} can't move ${direction} — that's the edge of ${fromMap}.`;
      } else if (result.transitioned) {
        message = `${username} moved ${direction} and left ${result.fromMap} for ${result.mapName}.`;
      } else {
        message = `${username} moved ${direction}.`;
      }

      const loc = roomManager.getLocation(username);
      if (!loc) {
        ack({ ok: false, message: 'Your session was lost. Please reconnect.' });
        return;
      }

      ack({
        ok: result.ok,
        message,
        player: { username, map: loc.mapName, row: loc.row, col: loc.col },
        minimap: roomManager.getMinimap(username),
      });
    });

    socket.on('disconnect', async () => {
      clearActiveSocketIfCurrent(username, socket.id);
      const loc = roomManager.getLocation(username);
      roomManager.removePlayer(username);
      if (loc) {
        try {
          await PlayerModel.updateOne(
            { username },
            { $set: { map: loc.mapName, row: loc.row, col: loc.col } }
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[db] could not persist player on disconnect:', message);
        }
      }
    });
  });
}
