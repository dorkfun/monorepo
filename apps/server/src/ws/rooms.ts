import WebSocket from "ws";

export interface PlayerConnection {
  ws: WebSocket;
  playerId: string;
  displayName: string;
}

export interface SpectatorConnection {
  ws: WebSocket;
  displayName: string;
}

export interface MatchRoom {
  matchId: string;
  players: Map<string, PlayerConnection>;
  spectators: Set<SpectatorConnection>;
}

/**
 * Manages WebSocket rooms for matches.
 * Each match has player connections and spectator connections.
 */
export class RoomManager {
  private rooms = new Map<string, MatchRoom>();

  createRoom(matchId: string): MatchRoom {
    const room: MatchRoom = {
      matchId,
      players: new Map(),
      spectators: new Set(),
    };
    this.rooms.set(matchId, room);
    return room;
  }

  getRoom(matchId: string): MatchRoom | undefined {
    return this.rooms.get(matchId);
  }

  getOrCreateRoom(matchId: string): MatchRoom {
    return this.rooms.get(matchId) || this.createRoom(matchId);
  }

  removeRoom(matchId: string): void {
    const room = this.rooms.get(matchId);
    if (room) {
      for (const conn of room.players.values()) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.close();
        }
      }
      for (const conn of room.spectators) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.close();
        }
      }
      this.rooms.delete(matchId);
    }
  }

  addPlayer(matchId: string, conn: PlayerConnection): void {
    const room = this.getOrCreateRoom(matchId);
    room.players.set(conn.playerId, conn);
  }

  removePlayer(matchId: string, playerId: string): void {
    const room = this.rooms.get(matchId);
    if (room) {
      room.players.delete(playerId);
    }
  }

  addSpectator(matchId: string, conn: SpectatorConnection): void {
    const room = this.getOrCreateRoom(matchId);
    room.spectators.add(conn);
  }

  removeSpectator(matchId: string, conn: SpectatorConnection): void {
    const room = this.rooms.get(matchId);
    if (room) {
      room.spectators.delete(conn);
    }
  }

  /** Broadcast a message to all players in a match */
  broadcastToPlayers(matchId: string, message: unknown): void {
    const room = this.rooms.get(matchId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const conn of room.players.values()) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
    }
  }

  /** Broadcast a message to all spectators in a match */
  broadcastToSpectators(matchId: string, message: unknown): void {
    const room = this.rooms.get(matchId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const conn of room.spectators) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
    }
  }

  /** Broadcast to everyone (players + spectators) */
  broadcastToAll(matchId: string, message: unknown): void {
    this.broadcastToPlayers(matchId, message);
    this.broadcastToSpectators(matchId, message);
  }

  /** Send to a specific player */
  sendToPlayer(matchId: string, playerId: string, message: unknown): void {
    const room = this.rooms.get(matchId);
    if (!room) return;

    const conn = room.players.get(playerId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  }

  getPlayerCount(matchId: string): number {
    return this.rooms.get(matchId)?.players.size || 0;
  }

  getSpectatorCount(matchId: string): number {
    return this.rooms.get(matchId)?.spectators.size || 0;
  }

  listRooms(): string[] {
    return Array.from(this.rooms.keys());
  }
}
