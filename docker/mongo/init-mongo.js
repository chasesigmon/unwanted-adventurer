// Runs automatically on first container start (via
// docker-entrypoint-initdb.d). Creates the game database with the
// collection and indexes the app expects, so a fresh container is
// immediately correct rather than relying on mongoose to lazily create them.
const gameDb = db.getSiblingDB('text-arena');

gameDb.createCollection('players');
gameDb.players.createIndex({ username: 1 }, { unique: true });
