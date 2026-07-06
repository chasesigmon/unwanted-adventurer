import { PlayerState } from '../game/PlayerState.js';
import { PlayerModel } from '../models/Player.js';
import { config } from '../config.js';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/;
const randomColor = () => Math.floor(Math.random() * 0xffffff);

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

        let doc = null;
        try {
          doc = await PlayerModel.findOneAndUpdate(
            { username },
            { $set: { lastLogin: new Date() }, $setOnInsert: { color: randomColor() } },
            { upsert: true, new: true }
          );
        } catch (err) {
          console.warn('[db] could not load/create player doc:', err.message);
        }

        const player = new PlayerState({
          id: socket.id,
          username,
          color: doc?.color ?? randomColor(),
          x: doc?.x ?? config.worldWidth / 2,
          y: doc?.y ?? config.worldHeight / 2,
          score: doc?.score ?? 0,
        });

        world.addPlayer(player);
        socket.data.username = username;

        ack?.({
          ok: true,
          self: player.toSnapshot(),
          world: { width: config.worldWidth, height: config.worldHeight },
        });
      } catch (err) {
        console.error('[socket] join error:', err);
        ack?.({ ok: false, error: 'Server error while joining.' });
      }
    });

    socket.on('input', (input) => {
      if (!input || typeof input.seq !== 'number') return;
      world.applyInput(socket.id, {
        up: !!input.up,
        down: !!input.down,
        left: !!input.left,
        right: !!input.right,
        seq: input.seq,
      });
    });

    socket.on('chat', (text) => {
      if (typeof text !== 'string' || !text.trim() || !socket.data.username) return;
      const clean = text.trim().slice(0, 140);
      world.say(socket.id, clean);
      io.emit('chat', { id: socket.id, username: socket.data.username, text: clean });
    });

    socket.on('disconnect', async () => {
      const player = world.players.get(socket.id);
      world.removePlayer(socket.id);
      if (player) {
        try {
          await PlayerModel.updateOne(
            { username: player.username },
            { $set: { x: player.x, y: player.y, score: player.score } }
          );
        } catch (err) {
          console.warn('[db] could not persist player on disconnect:', err.message);
        }
      }
    });
  });
}
