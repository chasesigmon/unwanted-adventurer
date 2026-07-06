// In-memory authoritative state for one connected player. The server is
// the only thing that ever mutates row/col here — clients only ever submit
// a text command and receive back the resulting, server-decided position.
export class PlayerState {
  constructor({ id, username, row, col }) {
    this.id = id; // socket id
    this.username = username;
    this.row = row;
    this.col = col;
  }

  toSnapshot() {
    return {
      id: this.id,
      username: this.username,
      row: this.row,
      col: this.col,
    };
  }
}
