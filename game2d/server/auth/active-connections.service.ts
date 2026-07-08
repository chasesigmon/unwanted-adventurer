import { Injectable } from '@nestjs/common';
import type { GameServer } from '../../shared/types.js';

// Tracks which socket is currently live for each logged-in username, so a
// new login can actively disconnect an old session's socket. The gateway
// hands us its Server instance once at startup (see GameGateway.afterInit).
@Injectable()
export class ActiveConnectionsService {
  private connections = new Map<string, string>(); // username (lowercase) -> socketId
  private server: GameServer | null = null;

  private key(username: string): string {
    return username.toLowerCase();
  }

  setServer(server: GameServer): void {
    this.server = server;
  }

  setActiveSocket(username: string, socketId: string): void {
    this.connections.set(this.key(username), socketId);
  }

  getActiveSocketId(username: string): string | undefined {
    return this.connections.get(this.key(username));
  }

  clearActiveSocketIfCurrent(username: string, socketId: string): void {
    const k = this.key(username);
    if (this.connections.get(k) === socketId) {
      this.connections.delete(k);
    }
  }

  kickIfConnected(username: string, message: string): void {
    const socketId = this.getActiveSocketId(username);
    if (!socketId || !this.server) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('session:kicked', { message });
      socket.disconnect(true);
    }
  }

  disconnectIfConnected(username: string): void {
    const socketId = this.getActiveSocketId(username);
    if (!socketId || !this.server) return;
    this.server.sockets.sockets.get(socketId)?.disconnect(true);
    this.clearActiveSocketIfCurrent(username, socketId);
  }
}
