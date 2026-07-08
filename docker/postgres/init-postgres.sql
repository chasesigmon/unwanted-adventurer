-- game2d's players table. Deliberately minimal (username, password hash,
-- race) plus the position fields the game gateway needs to place a
-- character back where it left off — no stats/skills/equipment/inventory,
-- none of that exists in this project. A real relational schema (not just
-- Mongo-style documents) since game2d expects to grow joined tables later
-- (e.g. inventory, guilds).
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  race VARCHAR(16) NOT NULL DEFAULT 'goblin' CHECK (race IN ('goblin', 'skeleton')),
  map VARCHAR(32) NOT NULL DEFAULT 'Great Plains' CHECK (map IN ('Great Plains', 'Labyrinth')),
  "row" INTEGER NOT NULL,
  col INTEGER NOT NULL,
  last_login TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive username lookups (login/register) hit this instead of
-- scanning the table.
CREATE INDEX IF NOT EXISTS players_username_lower_idx ON players (lower(username));

-- Keeps updated_at current on every UPDATE, the traditional-SQL
-- counterpart to Mongoose's { timestamps: true } schema option.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_set_updated_at ON players;
CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
