# Text Arena — Real-Time Multiplayer Grid Game (NestJS + Fastify + React + Socket.io + MongoDB + Redis)

A small authoritative-server multiplayer text game: players register/log in
with a username and password, then navigate named map instances (currently
"Labyrinth", a 15x15 starting area, and "World", a 60x60 open map) by typing
commands into a text box. There is no graphical rendering — the whole client
is DOM/text (React): a position readout, a one-line action log, a 4x4
minimap, and a full-width command input.

The whole codebase — client, server, and shared modules — is TypeScript.

## Architecture

```
/src
  /shared    Map sizes + direction-alias constants + wire-contract types, shared by client and server
  /server    NestJS app (Fastify HTTP adapter, Socket.io gateway, MongoDB, Redis) — see module list below
  /client    React UI, input capture only
```

The server is a standard NestJS module tree, one directory per module:

| Module | Responsibility |
|---|---|
| `config/` | `@nestjs/config` factory — the one place env vars are parsed |
| `redis/` | `ioredis` client, provided under the `REDIS_CLIENT` token |
| `database/` | `@nestjs/mongoose` connection |
| `players/` | `Player` schema + `PlayersService` (Mongo queries) |
| `auth/` | register/login/logout controller + service, JWT, Redis session tracking |
| `worlds/` | `WorldManagerService` — per-map world-instance/worker_thread sharding (see below) |
| `rate-limit/` | Socket.io connection + per-socket command rate limiting |
| `game-gateway/` | `@WebSocketGateway` — the Socket.io protocol handler |
| `health/` | `GET /health` |
| `game/` | `GameMap`, the map registry, and pure move/minimap resolution — **not** Nest-managed (see below) |

### Why NestJS forced a real `tsc` build (not `tsx`)

Nest's dependency injection resolves constructor parameter types via
TypeScript's `emitDecoratorMetadata` — real compiler-emitted metadata that
`tsx`/esbuild cannot produce (esbuild strips types without full type
resolution, so it has nothing to compute that metadata from). So the server
now runs through the Nest CLI (`nest build` / `nest start --watch`), which
wraps a real `tsc` compile, instead of `tsx`.

This conveniently also resolves a problem the previous `tsx`-based setup
avoided rather than solved: a `worker_thread` spawned via `new Worker(...)`
gets a fresh module-loading context that doesn't inherit whatever hook made
the main thread understand `.ts` files, so a `tsx`-run app has to do extra
work to make worker files transpile too. With a real compiled build, the
worker (`worlds/world-worker.ts` → `dist/server/worlds/world-worker.js`) is
just plain JavaScript by the time it's spawned — no TypeScript in the
runtime path at all, so the problem doesn't exist.

`tsconfig.server.json` (`noEmit: true`) is used for editor/typecheck; a
separate `tsconfig.build.json` (`rootDir: "src"`, `outDir: "dist"`, mirrors
the source tree so `dist/server/...` and `dist/shared/...` sit as siblings)
is what `nest build` actually compiles with. `npm run typecheck` still
checks both the client and server configs without emitting anything.

### Two things kept deliberately outside Nest's DI

- **`game/*` (`GameMap`, `maps.ts`, `resolveMove.ts`, `types.ts`)** are
  plain, dependency-free modules — not `@Injectable()` services. They have
  to be importable from `worlds/world-worker.ts`, which runs in a
  `worker_thread` with no access to Nest's DI container at all (it's a
  separate script, not part of the Nest application). Wrapping them in a
  Nest service would make them unusable from the one place that most needs
  them.
- **`rate-limit/command-rate-limiter.ts`** is a plain class, not a
  singleton provider — the gateway creates one instance per connection
  (`new CommandRateLimiter(...)`, seeded with config values it already
  has), since there's no natural per-connection DI scope to reach for here.

**The server is the only source of truth.** `GameMap` (`game/GameMap.ts`)
is a single grid instance with its own bounds and list of exits; the
registry of actual instances lives in `game/maps.ts`. Movement/minimap
resolution is a pure function (`game/resolveMove.ts`) shared by the main
thread and world workers (see "World instances and worker threads" below)
— the same logic runs identically wherever a given player's world instance
happens to be processed.

Note: "room" (`game/room.ts`, `RoomInfo`, see "Rooms" under "Maps and
exits") means a single grid space — a different concept from the
world-instance sharding described here. The two are unrelated; the shared
word is coincidental.

Movement is turn-based and request/response rather than continuously
simulated: a client sends a command string, the server resolves it to a
direction via `DIRECTION_ALIASES` (`w`/`up` → north, `s`/`down` → south,
`a` → west, `d` → east), and either moves the player, blocks them at the
map's edge, or — if the target cell is a registered exit — transitions them
onto a different map at that exit's destination coordinates (and
reassigns them to a world instance for the new map). The ack always
carries back the resulting `{map, row, col}`, a message, and a 4x4 minimap
view. The client never decides its own position — it only renders whatever
the ack (or a `sync` event) contains.

### Maps and exits

Currently defined in `src/server/game/maps.ts`:

| Map       | Size  | Exits                                |
|-----------|-------|----------------------------------------|
| Labyrinth | 15x15 | `(14, 7)` → World `(0, 10)`            |
| World     | 60x60 | `(0, 10)` → Labyrinth `(14, 7)`         |

New players spawn in the center of `STARTING_MAP` (`Labyrinth`, `(7, 7)`);
returning players resume wherever they last were. The minimap is a 4x4
view (there's no exact center on an even grid, so the player sits one cell
in from the top-left — 1 cell of context behind/left, 2 ahead/right on
each axis) and renders `@` for the player's own cell, `*` for an exit tile
within view, `.` for a normal in-bounds cell, and `#` for out of bounds.
Adding another map/exit is just another `GameMap` entry in `maps.ts`.

### Rooms

Every grid space is also a "room" (`game/room.ts`) with its own `id`
(`"Labyrinth:7:7"`), `name`, and `description` — for now the name is just
the map name (`"Labyrinth"`) and the description adds the position
(`"Labyrinth (7, 7)"`), which is the seam where real authored per-room
content would plug in later. The server includes the current room in the
`sync` event and in command acks; the client shows the name and then the
description as two lines beneath the "entered"/"moved" message. This is
unrelated to the world-instance sharding described below — the shared word
is coincidental.

### Character stats

New characters start with `hp: 100`, `mana: 100`, `movement: 100`
(`players/player.schema.ts`, schema defaults — `PlayersService.create()`
doesn't need to set them explicitly). Nothing consumes or regenerates
these yet; they exist to be displayed (the client's Score box, top-left)
and as the seam for future mechanics. They're loaded once into
`socket.data` at connection time (`GameGateway.handleConnection`) rather
than re-read from Mongo on every command, since nothing changes them
mid-session yet — the same reasoning as the `hp`/`mana`/`movement` cache in
`SocketData`.

## Auth: bcrypt + JWT + Redis session tracking

Registration/login are plain HTTP endpoints (`POST /auth/register`,
`POST /auth/login`, handled by `auth/auth.controller.ts`), not Socket.io
events, since a JWT has to exist before the authenticated socket connection
is even opened. Nest's exceptions (`BadRequestException`,
`UnauthorizedException`, `ConflictException`) are thrown from
`auth/auth.service.ts` and normalized by a global filter
(`common/http-exception.filter.ts`) into this project's
`{ ok: false, error }` response shape, rather than Nest/Fastify's default
`{ statusCode, message, error }` — the client only ever has to understand
one shape.

- **Passwords** are hashed with `bcryptjs` directly in `AuthService` — a
  pure-JS implementation of the same bcrypt algorithm as the native
  `bcrypt` package, chosen so installing this repo never depends on a
  native build step. Salt rounds are configurable (`BCRYPT_SALT_ROUNDS`,
  default 12).
- **Login issues a stateless JWT** via `@nestjs/jwt`'s `JwtService`
  (configured in `auth/auth.module.ts`) containing
  `{ username, sessionId }`, where `sessionId` is a fresh UUID minted on
  every successful login.
- **Redis tracks the one active `sessionId` per username**
  (`auth/session-store.service.ts`, key `session:{username}`, TTL matching
  the JWT's expiry). A Socket.io connection is only accepted if the JWT's
  `sessionId` still matches what's in Redis — so logging in again
  immediately invalidates any previously issued token for that user, even
  before it expires.
- **Duplicate logins actively kick the old session**: `AuthService.login()`
  looks up whether the user already has a live socket
  (`auth/active-connections.service.ts`, an in-memory `username → socket.id`
  map) and, if so, emits `session:kicked` to it and force-disconnects it
  before installing the new session. `ActiveConnectionsService` gets a
  reference to the live Socket.io `Server` once, from
  `GameGateway.afterInit()` — this is also what lets `AuthService` (an HTTP
  controller's dependency) and `GameGateway` (the WS layer) share socket
  state without depending on each other directly. The client treats being
  kicked the same as an explicit logout — back to the login screen, no
  auto-reconnect (see below).
- **Logout** — type `logout` in the command box; handled directly in
  `GameGateway`, not through `AuthService`. A `POST /auth/logout` route
  also exists for completeness (e.g. an admin "sign out everywhere"
  action), though the in-game command is the primary path.
- **Validation**: register/login bodies are validated with the same `zod`
  schemas as before (`auth/dto/credentials.dto.ts`), run through Nest's
  pipe system via a small `ZodValidationPipe` (`common/zod-validation.pipe.ts`)
  rather than switching to class-validator/DTO decorators — same
  validation library, now wired through Nest's request pipeline.

## Rate limiting

- **HTTP**: `@nestjs/throttler`'s `ThrottlerGuard` is applied to the whole
  `AuthController`, reusing the same window/max as the socket connection
  limiter below (`express-rate-limit` doesn't work under Fastify, since
  it's built directly on Express's req/res API).
- **Socket.io connections**: a per-IP fixed-window counter
  (`rate-limit/socket-connection-limiter.service.ts`) runs inside the
  `server.use()` handshake middleware registered in `GameGateway.afterInit()`,
  before JWT verification, so a connection flood is rejected cheaply.
- **Commands**: a per-socket token bucket
  (`rate-limit/command-rate-limiter.ts`) caps how many `command` events one
  connected client can issue per second, independent of the connection
  limiter above (an already-connected client can't just flood events
  instead).

All of the above are tunable via env vars — see `.env.example`.

## Heartbeat and reconnection

- **Heartbeat**: Socket.io's built-in engine.io ping/pong is configured
  explicitly (`pingInterval` / `pingTimeout`, merged into the underlying
  `Server`'s options by the custom `WsAdapter` in `ws-adapter.ts`) rather
  than reimplemented — it already does exactly this at the transport
  layer, so a dead connection (no pong within the timeout) is dropped
  automatically.
- **Reconnection**: the client enables Socket.io's automatic
  reconnection (`net/NetworkManager.ts`) with a bounded retry count and
  backoff. On every successful (re)connection the server immediately
  emits `sync` with the player's current authoritative `{map, row, col}`
  and minimap, so the UI is always correct after a drop — there's nothing
  to reconcile locally. A disconnect reason of `"io server disconnect"` or
  `"io client disconnect"` (kicked or logged out) is treated as final and
  does not attempt to reconnect; anything else (`"transport close"`,
  `"ping timeout"`, etc.) does.

## World instances and worker threads

Players are grouped into world instances per map, capped at
`WORLD_CAPACITY` (default 50, `worlds/world-manager.service.ts`). The
**first** instance created for a given map is processed inline on the main
thread — spinning up a worker for a handful of players isn't worth it.
**Every instance after that** is backed by its own real `worker_thread`
(`worlds/world-worker.ts`), which owns that instance's player positions and
runs `resolveMove`/exit resolution entirely off the main thread; the main
thread only relays `command` messages to it and awaits the reply via
`postMessage`. When a player transitions maps (via an exit),
`WorldManagerService` detaches them from their current instance and
reassigns them to an instance for the destination map — which may move
them onto a different worker, or back onto the main thread.

This is real, working `worker_threads` usage, not just a documented
design — you can lower `WORLD_CAPACITY` in `.env` to see it spawn a worker
with a handful of test connections rather than needing 51 real players.

Splitting further into separate deployable microservices (rather than
worker_threads within one process) is not implemented — that would need
service discovery and cross-process routing of a given instance's socket
connections, which is out of scope for a docker-compose demo. The
`WorldManagerService`/worker boundary is deliberately the seam where that
split would happen: swap `new Worker(...)` for a connection to a separate
process/service speaking the same `{type, ...}` message protocol.

## Getting started

```bash
npm install
cp .env.example .env             # set a real JWT_SECRET etc. before deploying anywhere real
docker compose up -d mongo redis # starts MongoDB + Redis — required before starting the server, see below
npm run dev                      # runs server (nest start --watch, :3000) + client (Vite, :5173)
```

Open http://localhost:5173, register a username/password, and play.

**MongoDB must be running before the server starts.** This is a behavior
change from the pre-NestJS version, which caught a failed Mongo connection
and degraded to in-memory/no-persistence mode. `@nestjs/mongoose`'s
connection lifecycle doesn't support that gracefully — a failed connection
now prevents the whole Nest app from bootstrapping (`retryAttempts: 0` and
a short `serverSelectionTimeoutMS` so it at least fails in ~2.5s rather
than hanging). Redis is unaffected — `ioredis` is fire-and-forget on
connection failure by design (auto-reconnects, emits `error` without
throwing), so it still degrades gracefully if unreachable.

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
npm start                   # builds the server (nest build -> /dist/server) and runs it, serving /dist/client too
```

`npm run build:server` (`nest build`) and `npm run dev:server`
(`nest start --watch`) both compile via `tsconfig.build.json`, whose
`rootDir`/`outDir` mirror the `src/` tree exactly (`dist/server/...`,
`dist/shared/...`) so relative imports resolve identically to source, and
so the compiled `world-worker.js` sits right next to `world-manager.service.js`
the same way it does in `src/`.

## Scaling notes

This repo is a single-process reference implementation. To take it further:

- **Horizontal scaling**: run multiple server instances behind a load
  balancer with sticky sessions, and add the
  [`@socket.io/redis-adapter`](https://socket.io/docs/v4/redis-adapter/) so
  broadcasts fan out across instances. Redis is already in the stack for
  session tracking, so this is a natural next step, not a new dependency.
- **World instances past worker_threads**: see "World instances and worker
  threads" above — the `WorldManagerService` → worker boundary is where a
  real microservice split would happen.
- **Visibility of other players**: the current command ack only tells a
  player about themselves. A shared world at scale would want a broadcast
  scoped to the player's world instance (e.g. "Bob moved into view") rather
  than every client polling.
- **Persistence**: position is saved after every successful move
  (fire-and-forget, so it doesn't add latency to the command ack) and again
  on disconnect, so a returning player always resumes at their last
  position even after a hard crash. At high move rates this means one Mongo
  write per move per player — a write-behind queue that batches/debounces
  these would be the next step if that ever becomes a bottleneck.
