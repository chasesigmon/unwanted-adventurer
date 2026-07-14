-- game2d's accounts table — the login layer in FRONT of players/
-- characters (see game2d/server/accounts/account.entity.ts and
-- game2d/server/auth/auth.service.ts). An account authenticates with
-- email/username/password; each of its characters is a row in `players`
-- below, linked via players.account_id.
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  username VARCHAR(16) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts (lower(username));
CREATE INDEX IF NOT EXISTS accounts_email_lower_idx ON accounts (lower(email));

-- game2d's players table — one row per CHARACTER (an account may own
-- several, see account_id below). Position fields place a character back
-- where it left off; attribute/vital/level/skill fields back the combat
-- system (see game2d/server/combat/formulas.ts) — mirroring the text
-- game's own player.schema.ts conventions (starting attributes of 1,
-- starting hp/mana of 100, a percent-learned skills map) even
-- though this project's combat is much smaller (one skill, no
-- equipment). A real relational schema (not just Mongo-style documents)
-- since game2d expects to grow joined tables later (e.g. inventory,
-- guilds).
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  username VARCHAR(16) NOT NULL UNIQUE,
  -- Nullable so any character row created before the account layer
  -- existed stays valid, just not selectable through the new account
  -- flow. A character no longer authenticates on its own (no more
  -- password_hash here) — that happens once, at the account level.
  account_id INTEGER REFERENCES accounts (id),
  -- 'human' is the wizarding-school pivot's only playable race — see
  -- game2d/shared/constants.ts. The original 5 stay valid for existing
  -- goblin-game characters.
  race VARCHAR(16) NOT NULL DEFAULT 'goblin' CHECK (race IN ('goblin', 'skeleton', 'hobgoblin', 'zombie', 'dragonborn', 'slime', 'human')),
  -- Human-only appearance (item 4) — null for every non-'human' race.
  gender VARCHAR(8) CHECK (gender IN ('male', 'female')),
  hair_color VARCHAR(16) CHECK (hair_color IN ('brown', 'blonde', 'black')),
  skin_tone VARCHAR(16) CHECK (skin_tone IN ('white', 'tan', 'dark')),
  -- Floro's 7 shop interiors and Grimoak Academy's castle rooms (see
  -- game2d/shared/constants.ts's FLORO_SHOP_MAPS/GRIMOAK_CASTLE_MAPS) are
  -- each their own map value too — "worlds of their own" a player can be
  -- standing in, not just the top-level outer areas.
  map VARCHAR(32) NOT NULL DEFAULT 'Grimoak Grounds' CHECK (map IN (
    'Great Plains', 'Labyrinth', 'Floro', 'Kortho',
    'Floro Blacksmith', 'Floro General Store', 'Floro Inn', 'Floro Bank',
    'Floro Armorer', 'Floro Pet Salesman', 'Floro Jobs Office',
    'Bramwick', 'Bramwick General Shop', 'Bramwick Wands', 'Bramwick Armor', 'Bramwick Potions',
    'Grimoak Grounds', 'Grimoak Entrance Hall', 'Great Hall',
    'Thistledown Common Room', 'Duskwing Common Room', 'Emberclaw Common Room',
    'Starfall Common Room', 'Specialization', 'Defense Classroom', 'Summoning Classroom',
    'Utility Classroom', 'Offense Classroom', 'Caverna Secretissima',
    'Thistledown Dorms', 'Duskwing Dorms', 'Emberclaw Dorms', 'Starfall Dorms',
    'Grimoak Castle 2nd Floor', 'Grimoak Castle 3rd Floor', 'Grimoak Castle 4th Floor',
    'Necromancer Chamber', 'Enhancer Chamber', 'Elementalist Chamber', 'Summoner Chamber', 'Illusionist Chamber',
    'Battlemage Chamber', 'Cleric Chamber', 'Druid Chamber', 'Diabolist Chamber', 'Hemomancer Chamber'
  )),
  "row" INTEGER NOT NULL,
  col INTEGER NOT NULL,
  strength INTEGER NOT NULL DEFAULT 1,
  intelligence INTEGER NOT NULL DEFAULT 1,
  wisdom INTEGER NOT NULL DEFAULT 1,
  dexterity INTEGER NOT NULL DEFAULT 1,
  constitution INTEGER NOT NULL DEFAULT 1,
  luck INTEGER NOT NULL DEFAULT 1,
  canteen_drinks INTEGER NOT NULL DEFAULT 6,
  hp INTEGER NOT NULL DEFAULT 100,
  max_hp INTEGER NOT NULL DEFAULT 100,
  mana INTEGER NOT NULL DEFAULT 100,
  max_mana INTEGER NOT NULL DEFAULT 100,
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  skills JSONB NOT NULL DEFAULT '{"punch": 1}',
  inventory JSONB NOT NULL DEFAULT '[]',
  equipment JSONB NOT NULL DEFAULT '{}',
  consume_exp INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 20,
  mimicable_races JSONB NOT NULL DEFAULT '[]',
  mimic_form VARCHAR(32),
  -- Condeath tracking (see game2d/server/game-gateway/game.gateway.ts's
  -- applyCondeathPenalty) — every 5th death costs 1 constitution;
  -- condemned=true at CONDEATH_LIMIT total deaths means this character
  -- can never log in again, but the row (and its account) is never
  -- deleted outright.
  death_count INTEGER NOT NULL DEFAULT 0,
  -- Leveling up grants stat points here (stacking if unspent) instead of
  -- an automatic per-level attribute bonus — spent one at a time via the
  -- character sheet (see game2d/server/game-gateway/game.gateway.ts's
  -- handleAllocateStatPoint).
  stat_points_available INTEGER NOT NULL DEFAULT 0,
  condemned BOOLEAN NOT NULL DEFAULT false,
  -- The secret room system (a follow-up ask) — each per-player, persisted
  -- forever once true, never re-locked. secret_door_unlocked/
  -- secret_chest_unlocked are resera'd open independently by each player
  -- (unlocking for one player never unlocks it for anyone else);
  -- map_unlocked is set the moment a player takes the map out of the
  -- chest, and is what actually gates the map corner button/'m' hotkey/
  -- modal (see game2d/shared/types.ts's PlayerSnapshot.mapUnlocked).
  secret_door_unlocked BOOLEAN NOT NULL DEFAULT false,
  secret_chest_unlocked BOOLEAN NOT NULL DEFAULT false,
  map_unlocked BOOLEAN NOT NULL DEFAULT false,
  -- Eating & drinking (a follow-up ask) — both start at 100 (a brand new
  -- character has just eaten/drunk their fill) and drop by 0.4 points per
  -- world-clock hour (originally a flat 1, slowed by a later follow-up
  -- ask — see game2d/server/game-gateway/game.gateway.ts's
  -- globalStatTick/applyStatTick); recovered 20 points at a time by
  -- drinking (canteen or a cup of water) or eating jerky. REAL (not
  -- INTEGER) so the 0.4 decrements actually accumulate — only ever
  -- rounded down for display client-side.
  hunger REAL NOT NULL DEFAULT 100,
  thirst REAL NOT NULL DEFAULT 100,
  -- Quest progress (a follow-up ask) — quest id -> array of completed
  -- objective ids; a quest id present as a key (even with an empty array)
  -- means it's been started. See game2d/shared/quests.ts for the quest/
  -- objective definitions themselves, which live in code, not the DB.
  quests JSONB NOT NULL DEFAULT '{}',
  -- The house/specialization system (a follow-up ask) — both null until
  -- chosen, permanent afterward (see game2d/server/game-gateway/
  -- game.gateway.ts's handleChooseHouse/handleChooseSpecialization).
  -- house gates which house's own Common Room/Dorms this player may
  -- enter (see game2d/shared/constants.ts's houseForMap).
  house VARCHAR(16) CHECK (house IS NULL OR house IN ('Thistledown', 'Duskwing', 'Emberclaw', 'Starfall')),
  specialization VARCHAR(16) CHECK (
    specialization IS NULL
    OR specialization IN (
      'necromancer', 'enhancer', 'elementalist', 'summoner', 'illusionist',
      'battlemage', 'cleric', 'druid', 'diabolist', 'hemomancer'
    )
  ),
  last_login TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive username lookups (login/register) hit this instead of
-- scanning the table.
CREATE INDEX IF NOT EXISTS players_username_lower_idx ON players (lower(username));
-- "List my characters" (see PlayersService.findByAccountId).
CREATE INDEX IF NOT EXISTS players_account_id_idx ON players (account_id);

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
