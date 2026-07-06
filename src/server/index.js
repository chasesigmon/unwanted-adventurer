import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';

import { config } from './config.js';
import { connectDB } from './db/connection.js';
import { World } from './game/World.js';
import { registerSocketHandlers } from './sockets/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../dist/client');

async function main() {
  await connectDB();

  const world = new World();

  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.static(clientDist));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, players: world.players.size, grid: { rows: world.rows, cols: world.cols } });
  });

  // SPA fallback for the built client (dev mode serves the client separately via Vite).
  app.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) {
        res
          .status(404)
          .send('Client build not found. Run "npm run build:client" first, or use "npm run dev" for development.');
      }
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: config.clientOrigin, methods: ['GET', 'POST'] },
  });

  registerSocketHandlers(io, world);

  server.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal error:', err);
  process.exit(1);
});
