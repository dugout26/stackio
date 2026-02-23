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
import { initDB, addSkinToUser, getUserById } from './db.js';
import { createAuthRouter, getSessionUser } from './auth.js';

// Optional Stripe (only if key is configured)
let stripe = null;
try {
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log('[Stripe] Payment system initialized');
  }
} catch (e) {
  console.log('[Stripe] Not configured - shop purchases disabled');
}

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

// === Stripe webhook (MUST be before express.json() to get raw body) ===
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.sendStatus(200);

  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret || !sig) {
      console.warn('[Stripe] Webhook: missing secret or signature — ignoring');
      return res.sendStatus(200);
    }

    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const sess = event.data.object;
      const { skinId, userId } = sess.metadata || {};
      if (skinId && userId) {
        addSkinToUser(parseInt(userId), skinId);
        console.log(`[Stripe] Skin ${skinId} added to user ${userId}`);
      }
    }
  } catch (err) {
    console.error('[Stripe] Webhook error:', err.message);
  }

  res.sendStatus(200);
});

// JSON body parsing for API routes (after webhook to preserve raw body)
app.use(express.json());

// Auth routes
app.use('/api', createAuthRouter());

// Skin price mapping (cents)
const SKIN_PRICES = {
  common: 99,
  rare: 299,
  legendary: 499,
  bundle: 999,
};

// --- Stripe Checkout API ---
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { skinId, tier } = req.body;
    if (!skinId || !tier) return res.status(400).json({ error: 'Missing skinId or tier' });

    if (tier === 'free') {
      return res.json({ unlocked: true });
    }

    // Require login for paid purchases
    const user = await getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Login required to purchase skins' });
    }

    if (!stripe) {
      return res.status(503).json({ error: 'Payments not configured. Set STRIPE_SECRET_KEY in .env' });
    }

    const price = SKIN_PRICES[tier];
    if (!price) return res.status(400).json({ error: 'Invalid tier' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `STACK.io Skin: ${skinId}`,
            description: `${tier.toUpperCase()} tier cosmetic skin`,
          },
          unit_amount: price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.protocol}://${req.get('host')}/?purchased=${skinId}`,
      cancel_url: `${req.protocol}://${req.get('host')}/`,
      metadata: { skinId, tier, userId: String(user.id) },
      customer_email: user.email,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err.message);
    res.status(500).json({ error: 'Payment creation failed' });
  }
});

// (Stripe webhook route moved above express.json() for raw body access)

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
