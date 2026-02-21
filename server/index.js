// Express + Socket.io server entry point
// Serves static files and manages WebSocket connections
// Delegates game logic to ServerGame

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerGame } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// Create game instance
const game = new ServerGame(io);
game.start();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Socket connected: ${socket.id}`);

  // Send current player count
  socket.emit('playerCount', { count: game.getPlayerCount() });

  // --- JOIN ---
  socket.on('join', (data) => {
    try {
      const name = (data && typeof data.name === 'string')
        ? data.name.trim().substring(0, 16) || 'Player'
        : 'Player';

      const player = game.addPlayer(socket.id, name);

      // Send player their own ID
      socket.emit('joined', { id: player.id });

      // Broadcast updated player count
      io.emit('playerCount', { count: game.getPlayerCount() });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Join error:`, err);
    }
  });

  // --- INPUT ---
  socket.on('input', (data) => {
    try {
      game.handleInput(socket.id, data);
    } catch (err) {
      // Silently handle bad input
    }
  });

  // --- LEVEL UP ---
  socket.on('levelUp', (data) => {
    try {
      game.handleLevelUp(socket.id, data);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] LevelUp error:`, err);
    }
  });

  // --- RESPAWN ---
  socket.on('respawn', () => {
    try {
      game.handleRespawn(socket.id);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Respawn error:`, err);
    }
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    try {
      game.removePlayer(socket.id);
      io.emit('playerCount', { count: game.getPlayerCount() });
      console.log(`[${new Date().toISOString()}] Socket disconnected: ${socket.id}`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Disconnect error:`, err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] STACK.io server running on port ${PORT}`);
});
