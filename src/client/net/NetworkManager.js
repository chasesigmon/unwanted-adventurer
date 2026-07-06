import { io } from 'socket.io-client';

// Thin transport layer only: owns the socket connection and re-broadcasts
// server events as DOM CustomEvents. No game logic lives here.
export class NetworkManager extends EventTarget {
  constructor(url) {
    super();
    this.socket = io(url, { transports: ['websocket'] });

    this.socket.on('snapshot', (snapshot) => {
      this.dispatchEvent(new CustomEvent('snapshot', { detail: snapshot }));
    });
    this.socket.on('leaderboard', (board) => {
      this.dispatchEvent(new CustomEvent('leaderboard', { detail: board }));
    });
    this.socket.on('chat', (msg) => {
      this.dispatchEvent(new CustomEvent('chat', { detail: msg }));
    });
  }

  join(username) {
    return new Promise((resolve, reject) => {
      this.socket.emit('join', { username }, (res) => {
        if (res?.ok) resolve(res);
        else reject(new Error(res?.error || 'Unable to join'));
      });
    });
  }

  sendInput(input) {
    this.socket.emit('input', input);
  }

  sendChat(text) {
    this.socket.emit('chat', text);
  }

  get id() {
    return this.socket.id;
  }
}
