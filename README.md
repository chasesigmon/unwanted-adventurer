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

New characters start with `hp: 100`, `mana: 100`, `movement: 100`,
`exp: 0`, `level: 1` (`players/player.schema.ts`, schema defaults —
`PlayersService.create()` doesn't need to set them explicitly). Only
`hp`/`exp`/`level` currently change (via combat, see below);
`mana`/`movement` still aren't consumed by anything. All five are
displayed in the client's Score box (top-left). They're loaded once into
`socket.data` at connection time (`GameGateway.handleConnection`) rather
than re-read from Mongo on every command; combat writes them back to both
`socket.data` and Mongo (`PlayersService.updateStats`) as it happens,
fire-and-forget like position saves, plus a final awaited write on
disconnect.

#### Leveling

`players/leveling.ts` is the whole rule, kept as two small pure functions
independent of Mongo/sockets/anything stateful:

- `maxTnlForLevel(level)` — experience needed to reach the next level,
  simply `level x 100` (100 at level 1, 200 at level 2, ...).
- `applyExpGain({ level, exp }, gained)` — adds the gain, then rolls over
  into as many level-ups as it warrants in a loop (so one big gain that
  happens to cross more than one threshold is handled correctly, not just
  the common case of one kill's worth of progress), returning the new
  `{ level, exp }`. `exp` resets to the (possibly nonzero) remainder on
  each level-up rather than accumulating forever — it always represents
  *progress toward the next level*, which is what the client's XP bar
  renders.

`GameGateway.resolveAttackExchange` calls this on a kill and appends a
`"You leveled up! You are now level 2!"` line whenever it fires.
`maxTnl` itself is never stored — `PlayerSnapshot.maxTnl` is computed
fresh from `level` every time a snapshot is built, so it can never drift
out of sync with the stored level the way a cached/duplicated value
could.

### Monsters

`src/server/monsters/` holds the game's first autonomous NPCs: skeletons.
`MonsterManagerService` is a plain in-memory singleton (no Mongo
persistence — the population resets on restart) that, on boot
(`onModuleInit`):

- Spawns 10 skeletons at random cells in the Labyrinth (never on the exit
  tile), each with `hp: 20`, `mana: Infinity`, `movement: Infinity`, an
  `expReward: 10` awarded to whoever lands the killing blow, and
  `undead: true` — the classification anti-undead mechanics (currently
  just "lesser undead resistance", see below) check against.
- Starts a timer (`SKELETON_WANDER_INTERVAL_MS`, default 60s = 1 minute)
  that moves every skeleton one random cardinal step per tick. A step
  that would leave the Labyrinth's bounds or land on its exit tile is
  refused — the skeleton just stays put that tick instead. This is how
  they're "locked" to the map: there's no transition logic for monsters
  at all, only a bounds/exit check on candidate moves.
- Starts a second timer (`SKELETON_RESPAWN_INTERVAL_MS`, default 60s)
  that spawns exactly one more skeleton if the population is below the
  max of 10 — which combat (below) can now actually cause.

When a player's current cell has a monster in it, the gateway computes a
`monsterMessage` (e.g. `"A skeleton is here!"`) and includes it alongside
`room` in the `sync` event and in command acks — always sent together, so
the client can tell "no monster here" (room present, message omitted)
apart from "this ack didn't touch location info at all" (room absent,
e.g. a rate-limited command), and only overwrites its last-known monster
state in the former case. The client renders it as a highlighted line in
the action log, above the room name/description. `/health` also reports
each live monster's id/kind/hp/position for diagnostics.

### Combat

`attack <mob>` (`GameGateway.handleAttack`) starts an auto-attack loop
against a monster in the player's current room.
`MonsterManagerService.findMonsterByNameAt` does a case-insensitive
substring match against the monster's kind, so `attack skel` and
`attack skeleton` both find a skeleton (`"Attack what?"` if no mob name
is given, `There is no "<query>" here to attack.` if nothing matches).

Each exchange (`GameGateway.resolveAttackExchange`) is the same basic
hit: the player swings first for a flat 6 damage
(`MonsterManagerService.applyDamage`), producing its own log line —
`"You hit the skeleton for 6 damage!"` — separate from whatever happens
next. If that hit kills it, the monster is removed immediately, the
player's `exp`/`level` are updated via `leveling.ts`, it drops loot (see
"Dropped items and skills" below), and `"You killed the skeleton!"`
(plus `"You leveled up! ..."` and a drop line, as they apply) is appended,
each as its own line. If it survives, it swings back — 2 damage, or 1 if
the monster is `undead` and the player knows "lesser undead resistance"
(`players/skills.ts`'s `undeadDamageReduction`) — clamped so the player's
`hp` never goes below 0, appending `"The skeleton hits you for 2
damage."` (or `1`) as its own line. `CommandAck.messages` and
`CombatUpdatePayload.messages` are both `string[]` for exactly this
reason — the client appends each element as a separate line rather than
rendering one concatenated sentence.

The first exchange happens synchronously, in the `attack` command's own
ack (which also carries a `combat: { monsterName, hpPercent }` status for
the client to display). If the target survives, `GameGateway` starts a
per-connection `setInterval` (`ATTACK_INTERVAL_MS`, 4s) that repeats the
same exchange automatically — `tickCombat` — pushing a `combat:update`
Socket.io event after every hit (there's no ack to piggyback on, since
the player isn't sending anything) with the updated message lines, player
snapshot, and hp percent, until the monster dies (`ended: true`, monster
omitted, kill message) or it wanders out of the player's cell before the
next tick (skeletons keep wandering during a fight — nothing pauses
them).

Re-attacking the same target while already fighting it is a no-op (just
reports current status, doesn't land a bonus hit or reset the 4s clock);
attacking a different target cancels the old loop and starts a new one.
`CommandAck.combat` is tri-state (`CombatStatus` object / explicit `null`
for "just ended" / omitted for "not applicable, don't touch the client's
existing display") for the same reason `monsterMessage` is tied to
`room`'s presence — see `game-gateway/types.ts`.

**A fight blocks ordinary movement.** While `activeCombats` has an entry
for a connection, every w/a/s/d/up/down command is refused outright
(`"You're in a fight! Type \"flee\" to escape, or keep attacking."`) —
the move is never even attempted. The only way out is the `flee`
command (`GameGateway.handleFlee`): it ends the fight (`combat: null`)
and then moves the player one step in a random direction that actually
leads somewhere, chosen from whichever of the 4 cardinal directions
`resolveMove` reports as in-bounds from the current cell
(`GameGateway.fleeableDirections`) — the same move pipeline as ordinary
movement, so fleeing can cross a map exit exactly like a normal step
would. If somehow boxed in on all four sides, the fight still ends but
the player just stays put. `flee` outside of combat is a no-op
(`"You aren't in a fight to flee from."`).

### Dropped items and skills

Killing a monster leaves something behind, resolved by
`MonsterManagerService.getDeathDrop(kind)` — keyed by kind rather than the
`undead` flag, since future undead kinds could have a different loot
table or none at all. Skeletons always drop one random body part (`leg`,
`arm`, `hand`, `skull`, `rib`) via `ItemManagerService.dropItem`, another
in-memory-only, per-cell registry exactly like `MonsterManagerService`
(no Mongo persistence — dropped items reset on restart). While one sits
in a room, `itemMessage` (e.g. `"A leg lies here."` / `"An arm lies
here."`) is computed and threaded through every event alongside
`monsterMessage`, the same "always sent together with `room`" convention
(see `game-gateway/types.ts`).

`consume <item>` (`GameGateway.handleConsume`) does a case-insensitive
substring match against dropped items in the current room
(`ItemManagerService.findItemByNameAt`) and always removes the item once
found, regardless of outcome. A skeleton part's `skillReward` is
`"lesser undead resistance"` (`players/skills.ts`): if the player already
has it, consuming does nothing further (`"...but you already know this
secret."`); otherwise there's a `SKILL_GAIN_CHANCE` (20%) chance of
learning it (`"You have gained lesser undead resistance!"`), added to
`Player.skills` (a permanent, never-removed string array) and persisted
immediately. That skill is checked in `resolveAttackExchange` (above) via
`undeadDamageReduction`, currently the only thing skills affect.

### Layout: three columns

`GameScreen` is a fixed-proportion three-column row (`#game-columns`)
spanning the full height above the command input: `#left-column` (20%,
the Score box), `#center-column` (60%, the message box), `#right-column`
(20%, position readout + Minimap box). The three widths are `flex: 0 0
20% / 60% / 20%` — fixed flex-basis percentages that sum to 100%, so the
columns can never overlap regardless of content or viewport size (no
absolute positioning to get wrong). The Score and Minimap boxes fill
their column's width (`.side-box { width: 100% }`) rather than being
sized independently, so they can't drift out of alignment with it. The
message box itself (`#message-box`) fills `#center-column` top to
bottom, giving the append-only log room to actually scroll instead of
being capped to a short strip.

### Message log and XP bar

The action area is a persistent, append-only log (`useGameConnection`'s
`messages: string[]`), not a single line that gets overwritten — every
sync/command/combat-tick event appends its line(s) rather than replacing
what's there, and the client auto-scrolls to the newest line
(`GameScreen`'s `messageListRef` effect). It's capped at `MAX_MESSAGES`
(200) client-side so a long session doesn't grow the array (and the DOM
it renders) without bound.

Typing `clear` empties the log. This never reaches the server —
`useGameConnection.sendCommand` intercepts it before calling
`NetworkManager.sendCommand`, since it's a pure display action with no
game state to change. It only clears `messages`; room name/description,
the minimap, and everything else in `GameState` are untouched.

Below the command input, a small full-width bar (`#xp-bar-track` /
`#xp-bar-fill`) shows `player.exp / player.maxTnl` as a percentage, filled
with a purple-to-pink gradient.

Inside the message box, the scrolling log comes first (`flex: 1`, so it
fills whatever space the fixed-size elements below it don't need), then
`monsterMessage`/`itemMessage`, then combat status, then room
name/description — in that order so "a skeleton is here" reads
immediately after whatever action (e.g. `"<player> moved north."`) just
revealed it, rather than as a banner sitting above the newest log line.
The Score box's stats (`LVL`/`HP`/`MP`/`MV`/`XP`) are stacked one per
line rather than in a row.

### Skills

`skills` (`GameGateway.handleSkills`) lists everything in `Player.skills`
— `"Your skills: lesser undead resistance."`, or `"You haven't learned
any skills yet."` if empty. Purely informational, no state change, so
it's the one command handler that isn't `async`.

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
