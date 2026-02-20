// Express + Socket.io server entry point
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

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

const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '..', 'client')));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Player connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Player disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] STACK.io server running on port ${PORT}`);
});
