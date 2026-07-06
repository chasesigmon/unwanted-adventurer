# Text Arena — Real-Time Multiplayer Grid Game (Socket.io + MongoDB + Redis)

A small authoritative-server multiplayer text game: players register/log in
with a username and password, then navigate named map instances (currently
"Labyrinth", a 15x15 starting area, and "World", a 60x60 open map) by typing
commands into a text box. There is no graphical rendering — the whole client
is DOM/text: a position readout, a one-line action log, a 3x3 minimap, and a
full-width command input.

## Architecture

```
/src
  /shared    Map sizes + direction-alias constants shared by client and server
  /server    Auth, sessions, rate limiting, rooms/workers, maps (Node + Socket.io + MongoDB + Redis)
  /client    Plain DOM/CSS UI, input capture only
```

**The server is the only source of truth.** `GameMap` (`game/GameMap.js`)
is a single grid instance with its own bounds and list of exits; the
registry of actual instances lives in `game/maps.js`. Movement/minimap
resolution is a pure function (`game/resolveMove.js`) shared by the main
thread and room workers (see "Rooms and worker threads" below) — the same
logic runs identically wherever a given player's room happens to be
processed.

Movement is turn-based and request/response rather than continuously
simulated: a client sends a command string, the server resolves it to a
direction via `DIRECTION_ALIASES` (`w`/`up` → north, `s`/`down` → south,
`a` → west, `d` → east), and either moves the player, blocks them at the
map's edge, or — if the target cell is a registered exit — transitions them
onto a different map at that exit's destination coordinates (and
reassigns them to a room for the new map). The ack always carries back the
resulting `{map, row, col}`, a message, and a 3x3 minimap view. The client
never decides its own position — it only renders whatever the ack (or a
`sync` event) contains.

### Maps and exits

Currently defined in `src/server/game/maps.js`:

| Map       | Size  | Exits                                |
|-----------|-------|----------------------------------------|
| Labyrinth | 15x15 | `(14, 7)` → World `(0, 10)`            |
| World     | 60x60 | `(0, 10)` → Labyrinth `(14, 7)`         |

New players spawn in the center of `STARTING_MAP` (`Labyrinth`, `(7, 7)`);
returning players resume wherever they last were. The minimap renders `@`
for the player's own cell, `*` for an exit tile within view, `.` for a
normal in-bounds cell, and `#` for out of bounds. Adding another map/exit is
just another `GameMap` entry in `maps.js`.

## Auth: bcrypt + JWT + Redis session tracking

Registration/login are plain HTTP endpoints (`POST /auth/register`,
`POST /auth/login`), not Socket.io events, since a JWT has to exist before
the authenticated socket connection is even opened.

- **Passwords** are hashed with `bcryptjs` (`auth/password.js`) — a
  pure-JS implementation of the same bcrypt algorithm as the native
  `bcrypt` package, chosen so installing this repo never depends on a
  native build step. Salt rounds are configurable (`BCRYPT_SALT_ROUNDS`,
  default 12).
- **Login issues a stateless JWT** (`auth/jwt.js`) containing
  `{ username, sessionId }`, where `sessionId` is a fresh UUID minted on
  every successful login.
- **Redis tracks the one active `sessionId` per username**
  (`auth/sessionStore.js`, key `session:{username}`, TTL matching the JWT's
  expiry). A Socket.io connection is only accepted if the JWT's
  `sessionId` still matches what's in Redis — so logging in again
  immediately invalidates any previously issued token for that user, even
  before it expires.
- **Duplicate logins actively kick the old session**: `POST /auth/login`
  looks up whether the user already has a live socket
  (`state/activeConnections.js`, an in-memory `username → socket.id` map),
  and if so emits `session:kicked` to it and force-disconnects it before
  installing the new session. The client treats being kicked the same as
  an explicit logout — back to the login screen, no auto-reconnect (see
  below).
- **Logout** — type `logout` in the command box. The server clears the
  Redis session and disconnects the socket from its end; a
  `POST /auth/logout` HTTP route also exists for completeness (e.g. an
  admin "sign out everywhere" action), though the in-game command is the
  primary path.

## Rate limiting and payload validation

- **HTTP**: `express-rate-limit` throttles `/auth/register` and
  `/auth/login` per IP (`middleware/httpAuthRateLimiter.js`).
- **Socket.io connections**: a per-IP fixed-window counter
  (`middleware/socketConnectionLimiter.js`) runs inside the `io.use()`
  handshake middleware, before JWT verification, so a connection flood is
  rejected cheaply.
- **Commands**: a per-socket token bucket
  (`middleware/CommandRateLimiter.js`) caps how many `command` events one
  connected client can issue per second, independent of the connection
  limiter above (an already-connected client can't just flood events
  instead).
- **Payload validation**: `zod` schemas (`validation/schemas.js`) validate
  register/login bodies and the command string's shape before any of it
  reaches a DB query or the game logic.

All of the above are tunable via env vars — see `.env.example`.

## Heartbeat and reconnection

- **Heartbeat**: Socket.io's built-in engine.io ping/pong is configured
  explicitly (`pingInterval` / `pingTimeout` in `server/index.js`) rather
  than reimplemented — it already does exactly this at the transport
  layer, so a dead connection (no pong within the timeout) is dropped
  automatically.
- **Reconnection**: the client enables Socket.io's automatic
  reconnection (`net/NetworkManager.js`) with a bounded retry count and
  backoff. On every successful (re)connection the server immediately
  emits `sync` with the player's current authoritative `{map, row, col}`
  and minimap, so the UI is always correct after a drop — there's nothing
  to reconcile locally. A disconnect reason of `"io server disconnect"` or
  `"io client disconnect"` (kicked or logged out) is treated as final and
  does not attempt to reconnect; anything else (`"transport close"`,
  `"ping timeout"`, etc.) does.

## Rooms and worker threads

Players are grouped into rooms per map, capped at `ROOM_CAPACITY` (default
50, `rooms/RoomManager.js`). The **first** room created for a given map is
processed inline on the main thread — spinning up a worker for a handful
of players isn't worth it. **Every room after that** is backed by its own
real `worker_thread` (`rooms/roomWorker.js`), which owns that room's player
positions and runs `resolveMove`/exit resolution entirely off the main
thread; the main thread only relays `command` messages to it and awaits
the reply via `postMessage`. When a player transitions maps (via an exit),
`RoomManager` detaches them from their current room and reassigns them to
a room for the destination map — which may move them onto a different
worker, or back onto the main thread.

This is real, working `worker_threads` usage, not just a documented
design — you can lower `ROOM_CAPACITY` in `.env` to see it spawn a worker
with a handful of test connections rather than needing 51 real players.

Splitting further into separate deployable microservices (rather than
worker_threads within one process) is not implemented — that would need
service discovery and cross-process routing of a given room's socket
connections, which is out of scope for a docker-compose demo. The
`RoomManager`/worker boundary is deliberately the seam where that split
would happen: swap `new Worker(...)` for a connection to a separate
process/service speaking the same `{type, ...}` message protocol.

## Getting started

```bash
npm install
cp .env.example .env             # set a real JWT_SECRET etc. before deploying anywhere real
docker compose up -d mongo redis # starts MongoDB + Redis (see below)
npm run dev                      # runs server (nodemon, :3000) + client (Vite, :5173)
```

Open http://localhost:5173, register a username/password, and play.
MongoDB and Redis are both required for this version (accounts and
sessions live there) — if either is unreachable the server logs a warning,
but registration/login will fail without them.

### MongoDB + Redis via Docker

`docker-compose.yml` builds two images:

- `mongo`, from `docker/mongo/Dockerfile.mongo` — seeds the `text-arena`
  database with the `players` collection and a unique index on `username`
  on first start (`docker/mongo/init-mongo.js`), and persists data in the
  `mongo-data` volume.
- `redis`, from `docker/redis/Dockerfile.redis` — a stock `redis:7-alpine`
  with append-only persistence enabled (`docker/redis/redis.conf`) so
  active sessions survive a container restart, persisted in the
  `redis-data` volume.

```bash
docker compose up -d mongo redis   # start both
docker compose logs -f mongo redis # tail logs
docker compose down                # stop (add -v to also wipe both data volumes)
```

The defaults in `.env.example` (`MONGODB_URI`, `REDIS_URL`) already point
at these containers.

### Production build

```bash
npm run build:client        # bundles the client into /dist/client
npm start                   # serves /dist/client and hosts the API/sockets from one process
```

## Scaling notes

This repo is a single-process reference implementation. To take it further:

- **Horizontal scaling**: run multiple server instances behind a load
  balancer with sticky sessions, and add the
  [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/) so
  broadcasts fan out across instances. Redis is already in the stack for
  session tracking, so this is a natural next step, not a new dependency.
- **Rooms past worker_threads**: see "Rooms and worker threads" above —
  the `RoomManager` → worker boundary is where a real microservice split
  would happen.
- **Visibility of other players**: the current command ack only tells a
  player about themselves. A shared world at scale would want a
  room-scoped broadcast (e.g. "Bob moved into view") rather than every
  client polling.
- **Persistence**: player state is upserted on connect/disconnect only.
  For crash resilience, add periodic autosave and a write-behind queue
  instead of writing to MongoDB directly from the socket handler.
