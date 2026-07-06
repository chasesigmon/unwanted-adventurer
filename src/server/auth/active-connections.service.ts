import { Injectable } from '@nestjs/common';
import type { GameServer } from '../game-gateway/types.js';

// Tracks which socket is currently live for each logged-in username, so a
// new login can actively disconnect an old session's socket (rather than
// just relying on the old token failing revalidation on its own). The
// gateway hands us its Server instance once at startup (see
// GameGateway.afterInit) so this service — otherwise gateway-agnostic —
// can reach into it when a login/logout needs to kick a live connection.
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

  // Only clears the mapping if it still points at this exact socket, so a
  // disconnect from an old session can't clobber a newer one that already
  // took over.
  clearActiveSocketIfCurrent(username: string, socketId: string): void {
    const k = this.key(username);
    if (this.connections.get(k) === socketId) {
      this.connections.delete(k);
    }
  }

  // Used when a newer login supersedes an existing session: notifies the
  // old socket why, then disconnects it.
  kickIfConnected(username: string, message: string): void {
    const socketId = this.getActiveSocketId(username);
    if (!socketId || !this.server) return;
    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('session:kicked', { message });
      socket.disconnect(true);
    }
  }

  // Used for an explicit logout: no notice needed, the client already
  // knows it asked to log out.
  disconnectIfConnected(username: string): void {
    const socketId = this.getActiveSocketId(username);
    if (!socketId || !this.server) return;
    this.server.sockets.sockets.get(socketId)?.disconnect(true);
    this.clearActiveSocketIfCurrent(username, socketId);
  }
}
