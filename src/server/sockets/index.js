import { PlayerState } from '../game/PlayerState.js';
import { PlayerModel } from '../models/Player.js';
import { config } from '../config.js';
import { DIRECTION_ALIASES } from '../../shared/directions.js';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/;

export function registerSocketHandlers(io, world) {
  io.on('connection', (socket) => {
    socket.on('join', async ({ username }, ack) => {
      try {
        username = String(username || '').trim();
        if (!USERNAME_REGEX.test(username)) {
          ack?.({ ok: false, error: 'Username must be 2-16 letters, numbers, or underscores.' });
          return;
        }
        const taken = [...world.players.values()].some(
          (p) => p.username.toLowerCase() === username.toLowerCase()
        );
        if (taken) {
          ack?.({ ok: false, error: 'That username is already in the arena.' });
          return;
        }

        const spawnRow = Math.floor(config.gridRows / 2);
        const spawnCol = Math.floor(config.gridCols / 2);

        let doc = null;
        try {
          doc = await PlayerModel.findOneAndUpdate(
            { username },
            {
              $set: { lastLogin: new Date() },
              $setOnInsert: { row: spawnRow, col: spawnCol },
            },
            { upsert: true, new: true }
          );
        } catch (err) {
          console.warn('[db] could not load/create player doc:', err.message);
        }

        const player = new PlayerState({
          id: socket.id,
          username,
          row: doc?.row ?? spawnRow,
          col: doc?.col ?? spawnCol,
        });

        world.addPlayer(player);
        socket.data.username = username;

        ack?.({
          ok: true,
          self: player.toSnapshot(),
          grid: { rows: config.gridRows, cols: config.gridCols },
          minimap: world.getMinimap(socket.id),
        });
      } catch (err) {
        console.error('[socket] join error:', err);
        ack?.({ ok: false, error: 'Server error while joining.' });
      }
    });

    socket.on('command', (rawText, ack) => {
      const player = world.getPlayer(socket.id);
      if (!player) {
        ack?.({ ok: false, message: 'You must join before issuing commands.' });
        return;
      }

      const text = String(rawText || '').trim().toLowerCase();
      const direction = DIRECTION_ALIASES[text];

      if (!direction) {
        ack?.({
          ok: false,
          message: `Unknown command: "${rawText}".`,
          player: player.toSnapshot(),
          minimap: world.getMinimap(socket.id),
        });
        return;
      }

      const result = world.movePlayer(socket.id, direction);
      const message = result.ok
        ? `${player.username} moved ${direction}.`
        : `${player.username} can't move ${direction} — that's the edge of the world.`;

      ack?.({
        ok: result.ok,
        message,
        player: result.player.toSnapshot(),
        minimap: world.getMinimap(socket.id),
      });
    });

    socket.on('disconnect', async () => {
      const player = world.players.get(socket.id);
      world.removePlayer(socket.id);
      if (player) {
        try {
          await PlayerModel.updateOne(
            { username: player.username },
            { $set: { row: player.row, col: player.col } }
          );
        } catch (err) {
          console.warn('[db] could not persist player on disconnect:', err.message);
        }
      }
    });
  });
}
