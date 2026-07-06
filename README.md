# Text Arena — Real-Time Multiplayer Grid Game (Socket.io + MongoDB)

A small authoritative-server multiplayer text game: players navigate a
shared 15x15 grid by typing commands into a text box. There is no graphical
rendering — the whole client is DOM/text: a position readout, a one-line
action log, a 3x3 minimap, and a full-width command input.

## Architecture

```
/src
  /shared    Grid size + direction-alias constants shared by client and server
  /server    Authoritative grid + command handling (Node + Socket.io + MongoDB)
  /client    Plain DOM/CSS UI, input capture only
```

**The server is the only source of truth.** `World` owns the 15x15 grid
and every connected player's `{row, col}`. Movement is turn-based and
request/response rather than continuously simulated: a client sends a
command string, the server (`sockets/index.js`) resolves it to a direction
via `DIRECTION_ALIASES` (`w`/`up` → north, `s`/`down` → south, `a` → west,
`d` → east), validates it against the grid bounds in `World.movePlayer()`,
and acks back the resulting position, a message ("Alice moved north." /
"Alice can't move north — that's the edge of the world."), and a 3x3
minimap view. The client never decides its own position — it only renders
whatever the ack contains.

Because movement is discrete and each command is confirmed synchronously,
there's no client-side prediction or interpolation to reconcile — the UI
simply waits for the server's ack before updating the position readout,
minimap, and action log.

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
- **Sharding**: split `World` into multiple grid instances/rooms (e.g. per
  region or per N players) instead of one shared 15x15 grid, so a single
  process isn't holding every connected player.
- **Visibility of other players**: the current command ack only tells a
  player about themselves. A shared world at scale would want a room-scoped
  broadcast (e.g. "Bob moved into view") rather than every client polling.
- **Persistence**: player state is upserted on join/disconnect only. For
  crash resilience, add periodic autosave and a write-behind queue instead of
  writing to MongoDB directly from the socket handler.
