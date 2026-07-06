// In-memory authoritative state for one connected player. The server is
// the only thing that ever mutates mapName/row/col here — clients only
// ever submit a text command and receive back the resulting, server-decided
// position (and current map).
export class PlayerState {
  constructor({ id, username, mapName, row, col }) {
    this.id = id; // socket id
    this.username = username;
    this.mapName = mapName;
    this.row = row;
    this.col = col;
  }

  toSnapshot() {
    return {
      id: this.id,
      username: this.username,
      map: this.mapName,
      row: this.row,
      col: this.col,
    };
  }
}
