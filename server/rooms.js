// Room/arena management - auto-creates rooms when capacity is reached
// Each room runs its own ServerGame instance with independent state
// Players are automatically placed in the best available room

import { NETWORK } from '../shared/constants.js';
import { ServerGame } from './game.js';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> { game, namespace, playerCount }
    this.socketToRoom = new Map(); // socketId -> roomId
    this.nextRoomId = 1;
  }

  /** Find best room or create new one, returns roomId */
  findRoom() {
    // Find room with space and most players (for better experience)
    let bestRoom = null;
    let bestCount = -1;

    for (const [id, room] of this.rooms) {
      if (room.playerCount < NETWORK.MAX_PLAYERS_PER_ROOM && room.playerCount > bestCount) {
        bestRoom = id;
        bestCount = room.playerCount;
      }
    }

    if (bestRoom) return bestRoom;

    // Create new room
    return this._createRoom();
  }

  _createRoom() {
    const roomId = 'room_' + (this.nextRoomId++);
    const game = new ServerGame(this.io, roomId);
    game.start();

    this.rooms.set(roomId, {
      game,
      playerCount: 0,
      createdAt: Date.now(),
    });

    console.log(`[Rooms] Created ${roomId}`);
    return roomId;
  }

  /** Add player to a room */
  joinRoom(socketId, name) {
    const roomId = this.findRoom();
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.game.addPlayer(socketId, name);
    room.playerCount++;
    this.socketToRoom.set(socketId, roomId);

    return { player, roomId };
  }

  /** Handle input for a player */
  handleInput(socketId, data) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room) room.game.handleInput(socketId, data);
  }

  /** Handle level-up for a player */
  handleLevelUp(socketId, data) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room) room.game.handleLevelUp(socketId, data);
  }

  /** Handle respawn */
  handleRespawn(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room) room.game.handleRespawn(socketId);
  }

  /** Remove player from their room */
  removePlayer(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.game.removePlayer(socketId);
      room.playerCount--;

      // Clean up empty rooms (keep at least 1)
      if (room.playerCount <= 0 && this.rooms.size > 1) {
        room.game.stop();
        this.rooms.delete(roomId);
        console.log(`[Rooms] Removed empty ${roomId}`);
      }
    }

    this.socketToRoom.delete(socketId);
  }

  /** Get total player count across all rooms */
  getTotalPlayerCount() {
    let total = 0;
    for (const [, room] of this.rooms) {
      total += room.game.getPlayerCount();
    }
    return total;
  }

  /** Get room info for a socket */
  getRoomForSocket(socketId) {
    return this.socketToRoom.get(socketId);
  }

  /** Get game instance for a socket */
  getGameForSocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    return room ? room.game : null;
  }
}
