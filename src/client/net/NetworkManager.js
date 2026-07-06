import { io } from 'socket.io-client';

// Thin transport layer only: owns the socket connection. No game logic
// lives here — every command is a request/ack round trip to the
// authoritative server, which decides the resulting position.
export class NetworkManager {
  constructor(url) {
    this.socket = io(url, { transports: ['websocket'] });
  }

  join(username) {
    return new Promise((resolve, reject) => {
      this.socket.emit('join', { username }, (res) => {
        if (res?.ok) resolve(res);
        else reject(new Error(res?.error || 'Unable to join'));
      });
    });
  }

  sendCommand(text) {
    return new Promise((resolve, reject) => {
      this.socket.emit('command', text, (res) => {
        if (res) resolve(res);
        else reject(new Error('No response from server.'));
      });
    });
  }

  get id() {
    return this.socket.id;
  }
}
