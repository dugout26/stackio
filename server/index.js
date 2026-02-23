// Express + Socket.io server entry point
// Serves static files and manages WebSocket connections
// Delegates game logic to ServerGame

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerGame } from './game.js';
import { initRedis, Leaderboard } from './leaderboard.js';
import { initDB, getUserById } from './db.js';
import { createAuthRouter, getSessionUser } from './auth.js';

// Payment system: planned for future (in-game currency)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);  // Render reverse proxy: req.protocol returns 'https'
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? 'https://stack.mound.run'
      : '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 4000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));

// JSON body parsing for API routes
app.use(express.json());

// Auth routes
app.use('/api', createAuthRouter());

// Skin shop: coming soon (in-game currency planned)

// Initialize databases
initDB().catch(err => console.error('[DB] Init failed:', err.message));
initRedis().catch(() => {});

// Persistent leaderboard (best scores across sessions)
const persistentLeaderboard = new Leaderboard();

// GET leaderboard for menu display
app.get('/api/leaderboard', async (req, res) => {
  try {
    const top = await persistentLeaderboard.getTop(10);
    res.json({ top });
  } catch (err) {
    res.status(500).json({ top: [] });
  }
});

// Create game instance
const game = new ServerGame(io);
game.onPlayerDeath = (name, score, level) => {
  persistentLeaderboard.update(name, score, level).catch(() => {});
};
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

  // --- LINK ACCOUNT (guest → registered user) ---
  socket.on('linkAccount', (data) => {
    try {
      if (data && typeof data.userId === 'number') {
        const user = getUserById(data.userId);
        if (user) {
          game.linkPlayerToAccount(socket.id, user.id);
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] LinkAccount error:`, err);
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
