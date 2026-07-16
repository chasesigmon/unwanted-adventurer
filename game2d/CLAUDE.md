# game2d — Grimoak Academy

Phaser3 (client, `src/`) + NestJS/Socket.io (server, `server/`) 2D wizarding-school
MMO. Shared code importable from both sides lives in `shared/`.

## Working in this repo

- **cwd resets between conversation turns.** Every fresh shell command in a new
  turn starts at the repo root (`/Users/chasesigmon/Projects/unwanted-adventurer`),
  not `game2d/` — `cd` into `game2d/` explicitly (or prefix every command) rather
  than assuming the previous turn's `cd` persisted. A quick sanity check:
  `npm run typecheck` should print `game2d@1.0.0`, not `text-arena-mmo@1.0.0`.
- Run `npm run typecheck` (tsc over both `tsconfig.server.json` and
  `tsconfig.json`) after every meaningful edit, and `npx vite build --mode
  development` to confirm the client bundles cleanly.
- `npm run dev` runs the tsx backend (`:3001`) + Vite dev server (`:5173`)
  together, auto-killing anything already bound to those ports first.
- This is a **Phaser + vanilla TypeScript** frontend, not React — don't reach
  for React patterns/libraries here.

## Assets

- New sprites are generated as real spritesheets (PIL/python3 inline scripts
  via `python3 - <<'EOF' ... EOF`), never procedural canvas-draw `.ts` files —
  loaded through Phaser's own asset loader like every other sprite.
- Verify every generated sprite visually via the Read tool at both native
  resolution and a zoomed (`Image.NEAREST` upscale) preview before considering
  it done.
- Keep any one-off verification scripts (`verify-*.mjs`) in `tests/` at the
  repo root instead of deleting them after use.

## Code conventions

- `kind: 'open'` on a `MapExit` suppresses the generic door sprite client-side
  — use it for any door-less walk-through (open archways, shop-street doors,
  portal-dungeon exits).
- **Circular-import constraint**: `shared/lighting.ts` imports from
  `shared/maps.ts`. `maps.ts` must never import from `lighting.ts` — if a
  position formula is needed in both, duplicate it (computed from the same
  exported constants so the two can't numerically drift) rather than
  introducing the cycle.
- The `EquipmentSlot` / `EQUIPMENT_SLOT_FOR_ITEM` system in
  `server/combat/formulas.ts` is the one place armor/stat bonuses are wired in
  — new equipment items get an entry there (AC bonus, stat bonus) rather than
  a bespoke special case elsewhere.
- Monster loot/species data (`server/monsters/monster.ts`) uses
  `carriedItemRolls: [{label, chance}]`, independently rolled per entry — even
  "always drops N of this" is just N entries with `chance: 1`.

## Database

- **Live CHECK constraints on the `players` table (`players_map_check`,
  `players_race_check`, etc.) are NOT tracked in any repo file** — they exist
  only in the running Postgres container. Before assuming "no migration
  needed" when adding a new map name, race, house, or specialization value,
  check the live constraint directly:
  `docker exec game2d-postgres psql -U game2d -d game2d -c "\d players"` and
  look at its `Check constraints:` section. Confirm no existing row would
  violate the new constraint, then `ALTER TABLE players DROP CONSTRAINT
  ...; ALTER TABLE players ADD CONSTRAINT ... CHECK (...)`. This has already
  bitten this project twice (a stale `Bramwick Wands` map entry, and this note
  existing at all) — always re-check live rather than trusting the absence of
  a tracked `.sql` file.
- `server/players/player.entity.ts`'s `players` table is a real Postgres table
  (`synchronize: false`) — TypeORM doesn't auto-migrate; new columns need a
  live `ALTER TABLE` the same way.

## Working style

- Track multi-item batches with TodoWrite, one in-progress item at a time.
- Run `afplay /System/Library/Sounds/Ping.aiff` 5x when finishing a batch of
  changes (not `osascript beep` — it produces no audible sound in this
  environment).
- At the end of a batch, walk through each numbered item individually in the
  summary rather than a terse wrap-up.
- Never delete player/account data unless it was created by the current
  session itself for testing — "looks like test data" is not sufficient
  justification on its own.
