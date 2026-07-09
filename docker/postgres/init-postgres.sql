-- game2d's players table. Position fields place a character back where
-- it left off; attribute/vital/level/skill fields back the combat system
-- (see game2d/server/combat/formulas.ts) — mirroring the text game's own
-- player.schema.ts conventions (starting attributes of 1, starting
-- hp/mana/movement of 100, a percent-learned skills map) even though this
-- project's combat is much smaller (one skill, no equipment). A real
-- relational schema (not just Mongo-style documents) since game2d expects
-- to grow joined tables later (e.g. inventory, guilds).
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  race VARCHAR(16) NOT NULL DEFAULT 'goblin' CHECK (race IN ('goblin', 'skeleton')),
  map VARCHAR(32) NOT NULL DEFAULT 'Great Plains' CHECK (map IN ('Great Plains', 'Labyrinth', 'Floro', 'Kortho')),
  "row" INTEGER NOT NULL,
  col INTEGER NOT NULL,
  strength INTEGER NOT NULL DEFAULT 1,
  intelligence INTEGER NOT NULL DEFAULT 1,
  wisdom INTEGER NOT NULL DEFAULT 1,
  dexterity INTEGER NOT NULL DEFAULT 1,
  constitution INTEGER NOT NULL DEFAULT 1,
  hp INTEGER NOT NULL DEFAULT 100,
  max_hp INTEGER NOT NULL DEFAULT 100,
  mana INTEGER NOT NULL DEFAULT 100,
  max_mana INTEGER NOT NULL DEFAULT 100,
  movement INTEGER NOT NULL DEFAULT 100,
  max_movement INTEGER NOT NULL DEFAULT 100,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '{"punch": 1}',
  inventory JSONB NOT NULL DEFAULT '[]',
  equipment JSONB NOT NULL DEFAULT '{}',
  consume_exp INTEGER NOT NULL DEFAULT 0,
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
