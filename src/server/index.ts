import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';

import { config } from './config.js';
import { connectDB } from './db/connection.js';
import { RoomManager } from './rooms/RoomManager.js';
import { MAPS } from './game/maps.js';
import { registerSocketHandlers } from './sockets/index.js';
import { createAuthRouter } from './auth/routes.js';
import { httpAuthRateLimiter } from './middleware/httpAuthRateLimiter.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './sockets/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../dist/client');

async function main(): Promise<void> {
  await connectDB();

  const roomManager = new RoomManager();

  const app = express();
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json());
  app.use(express.static(clientDist));

  const server = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
    cors: { origin: config.clientOrigin, methods: ['GET', 'POST'] },
    // Ping/pong heartbeat: how often the server probes each client, and how
    // long it waits for a pong before treating the connection as dead.
    pingInterval: config.heartbeatPingIntervalMs,
    pingTimeout: config.heartbeatPingTimeoutMs,
  });

  app.use('/auth', httpAuthRateLimiter, createAuthRouter(io));

  app.get('/health', (_req, res) => {
    const stats = roomManager.getStats();
    res.json({
      ok: true,
      players: stats.totalPlayers,
      rooms: stats.rooms,
      maps: Array.from(MAPS.values()).map((m) => ({ name: m.name, rows: m.rows, cols: m.cols })),
    });
  });

  // SPA fallback for the built client (dev mode serves the client separately via Vite).
  // Must stay last — it's a catch-all.
  app.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) {
        res
          .status(404)
          .send('Client build not found. Run "npm run build:client" first, or use "npm run dev" for development.');
      }
    });
  });

  registerSocketHandlers(io, roomManager);

  server.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
}

main().catch((err: unknown) => {
  console.error('[server] fatal error:', err);
  process.exit(1);
});
