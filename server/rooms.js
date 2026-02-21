// Room/arena management (max 50 per room)
// Placeholder for multi-room support
// Currently all players share a single game instance in server/game.js
// This module will be used when scaling to multiple arenas

import { NETWORK } from '../shared/constants.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  /** Find or create a room with available slots */
  findRoom() {
    for (const [id, room] of this.rooms) {
      if (room.playerCount < NETWORK.MAX_PLAYERS_PER_ROOM) {
        return id;
      }
    }
    // Create new room
    const id = 'room_' + (this.rooms.size + 1);
    this.rooms.set(id, { playerCount: 0 });
    return id;
  }

  /** Add player to room */
  joinRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) room.playerCount++;
  }

  /** Remove player from room */
  leaveRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.playerCount--;
      if (room.playerCount <= 0) {
        this.rooms.delete(roomId);
      }
    }
  }
}
