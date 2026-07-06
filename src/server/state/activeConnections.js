// Tracks which socket is currently live for each logged-in username, so a
// new login can actively disconnect an old session's socket (rather than
// just relying on the old token failing revalidation on its own).
const connections = new Map(); // username (lowercase) -> socketId

function key(username) {
  return username.toLowerCase();
}

export function setActiveSocket(username, socketId) {
  connections.set(key(username), socketId);
}

export function getActiveSocketId(username) {
  return connections.get(key(username));
}

// Only clears the mapping if it still points at this exact socket, so a
// disconnect from an old session can't clobber a newer one that already
// took over.
export function clearActiveSocketIfCurrent(username, socketId) {
  const k = key(username);
  if (connections.get(k) === socketId) {
    connections.delete(k);
  }
}
