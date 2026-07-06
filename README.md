# Text Arena — Real-Time Multiplayer (Phaser 3 + Socket.io + MongoDB)

A small authoritative-server multiplayer arena: players move around a shared
2D world, collect orbs for score, and chat. It exists as a reference
architecture for real-time multiplayer with Phaser — the interesting part is
the client/server split, not the game design.

## Architecture

```
/src
  /shared    Physics/constants shared verbatim by client and server
  /server    Authoritative simulation (Node + Socket.io + MongoDB)
  /client    Phaser 3 rendering, input capture, prediction/interpolation
```

**The server is the only source of truth.** It runs a fixed-timestep game
loop (`GameLoop`, default 20Hz) that steps every connected player's position,
resolves orb collisions, and updates scores. Clients never set their own
position or score — they only ever send `{up, down, left, right, seq}` input
and receive read-only world snapshots.

**The client never trusts itself.** `GameScene` predicts the local player's
movement immediately on input (via `Predictor`, using the exact same
`stepPosition()` function from `/src/shared/movement.js` that the server
uses) so movement feels instant despite network latency. When a snapshot
arrives, `Predictor.reconcile()` snaps to the server's authoritative
position, discards acknowledged inputs, and replays anything still in
flight. Remote players are never predicted — they're interpolated between
the last two snapshots at a fixed render delay (`InterpolationBuffer`,
~100ms) since we don't have their future input.

Data flow per frame:
1. Client reads keyboard → predicts locally → emits `input` (with `seq`).
2. Server's tick loop applies the latest known input for each player,
   independent of how often input messages arrive.
3. Server broadcasts a `snapshot` (positions, scores, orbs) ~15x/sec.
4. Client reconciles its own player against the snapshot, interpolates
   everyone else, and renders.

## Getting started

```bash
npm install
cp .env.example .env       # adjust MONGODB_URI etc. if needed
docker compose up -d mongo # starts MongoDB (see below)
npm run dev                # runs server (nodemon, :3000) + client (Vite, :5173)
```

Open http://localhost:5173. MongoDB is optional in development — if it's
unreachable, the server logs a warning and runs with in-memory-only state
(no cross-session persistence of score/position).

### MongoDB via Docker

`docker-compose.yml` builds a Mongo 7 image from `docker/mongo/Dockerfile`,
which seeds the `text-arena` database with the `players` collection and a
unique index on `username` on first start (via
`docker/mongo/init-mongo.js`), and persists data in the `mongo-data` volume.

```bash
docker compose up -d mongo     # start (rebuilds on init script changes)
docker compose logs -f mongo   # tail logs
docker compose down            # stop (add -v to also wipe the data volume)
```

The default `MONGODB_URI` in `.env.example` already points at
`mongodb://127.0.0.1:27017/text-arena`, matching this container.

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
  broadcasts fan out across instances.
- **Sharding**: split `World` into multiple rooms/instances (e.g. per
  region or per N players) instead of one global arena, so no single tick
  loop has to simulate everyone.
- **Bandwidth**: inputs are currently sent every render frame and snapshots
  contain full world state. At larger player counts, switch to delta-compressed
  snapshots (only changed entities) and/or a binary wire format instead of JSON.
- **Persistence**: player state is upserted on join/disconnect only. For
  crash resilience, add periodic autosave and a write-behind queue instead of
  writing to MongoDB directly from the socket handler.
