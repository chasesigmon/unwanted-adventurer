# Text Arena — Real-Time Multiplayer Grid Game (Socket.io + MongoDB)

A small authoritative-server multiplayer text game: players navigate named
map instances (currently "Labyrinth", a 15x15 starting area, and "World", a
60x60 open map) by typing commands into a text box. There is no graphical
rendering — the whole client is DOM/text: a position readout (which map
you're on plus your row/col), a one-line action log, a 3x3 minimap, and a
full-width command input.

## Architecture

```
/src
  /shared    Map sizes + direction-alias constants shared by client and server
  /server    Authoritative maps + command handling (Node + Socket.io + MongoDB)
  /client    Plain DOM/CSS UI, input capture only
```

**The server is the only source of truth.** `GameMap` (`game/GameMap.js`)
is a single grid instance with its own bounds and list of exits; the
registry of actual instances lives in `game/maps.js`. `GameWorld`
(`game/GameWorld.js`) owns every connected player's `{mapName, row, col}`
and resolves movement against whichever map that player currently occupies.

Movement is turn-based and request/response rather than continuously
simulated: a client sends a command string, the server (`sockets/index.js`)
resolves it to a direction via `DIRECTION_ALIASES` (`w`/`up` → north,
`s`/`down` → south, `a` → west, `d` → east), and `GameWorld.movePlayer()`
either moves the player, blocks them at the map's edge, or — if the target
cell is a registered exit — transitions them onto a different map at that
exit's destination coordinates. The ack always carries back the resulting
`{map, row, col}`, a message ("Alice moved north." / "Alice can't move
north — that's the edge of Labyrinth." / "Alice moved south and left
Labyrinth for World."), and a 3x3 minimap view. The client never decides
its own position — it only renders whatever the ack contains.

Because movement is discrete and each command is confirmed synchronously,
there's no client-side prediction or interpolation to reconcile — the UI
simply waits for the server's ack before updating the position readout,
minimap, and action log.

### Maps and exits

Currently defined in `src/server/game/maps.js`:

| Map       | Size  | Exits                                            |
|-----------|-------|---------------------------------------------------|
| Labyrinth | 15x15 | `(14, 7)` → World `(0, 10)`                       |
| World     | 60x60 | none                                               |

New players spawn in the center of `STARTING_MAP` (`Labyrinth`, so `(7,
7)`); returning players resume wherever they last were, on whichever map.
The minimap renders `@` for the player's own cell, `*` for an exit tile
within view, `.` for a normal in-bounds cell, and `#` for out of bounds.
Adding another map/exit is just another `GameMap` entry in `maps.js` — no
other code needs to change.

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
- **Sharding**: each map is already an independent `GameMap`; at scale, run
  busy maps (e.g. the 60x60 "World") on their own process/Socket.io room
  instead of every map living in one `GameWorld`, so a single process isn't
  holding every connected player.
- **Visibility of other players**: the current command ack only tells a
  player about themselves. A shared world at scale would want a room-scoped
  broadcast (e.g. "Bob moved into view") rather than every client polling.
- **Persistence**: player state is upserted on join/disconnect only. For
  crash resilience, add periodic autosave and a write-behind queue instead of
  writing to MongoDB directly from the socket handler.
