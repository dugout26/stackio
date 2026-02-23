// Authentication routes — register, login, logout, session check
// Uses Node.js built-in crypto.scrypt for password hashing (no bcrypt)

import { Router } from 'express';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import {
  createUser, getUserByEmail, getUserById,
  createSession, getSession, deleteSession,
} from './db.js';

const scryptAsync = promisify(scrypt);
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

const COOKIE_NAME = 'session_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

/** Hash a password with random salt */
async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt}:${hash.toString('hex')}`;
}

/** Verify a password against stored hash */
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return timingSafeEqual(hashBuffer, derived);
}

/** Parse cookies from header string */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}

/** Get the authenticated user from request cookies */
export async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const session = getSession(token);
  if (!session) return null;

  return getUserById(session.user_id);
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

/** Create and return Express auth router */
export function createAuthRouter() {
  const router = Router();

  // POST /api/register
  router.post('/register', async (req, res) => {
    try {
      const { email, password, existingSkins } = req.body;

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      if (!isValidPassword(password)) {
        return res.status(400).json({ error: 'Password must be 6-128 characters' });
      }

      // Check if email already exists
      const existing = getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await hashPassword(password);
      const skinsList = Array.isArray(existingSkins) ? existingSkins.filter(s => typeof s === 'string') : [];
      const user = createUser(email, passwordHash, skinsList);
      const token = createSession(user.id);

      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.json({ user: { id: user.id, email: user.email, skins: user.skins } });
    } catch (err) {
      console.error('[Auth] Register error:', err.message);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // POST /api/login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const user = getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = createSession(user.id);
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
      res.json({ user: { id: user.id, email: user.email, skins: user.skins } });
    } catch (err) {
      console.error('[Auth] Login error:', err.message);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // POST /api/logout
  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[COOKIE_NAME];
    if (token) {
      deleteSession(token);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  // GET /api/me
  router.get('/me', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) {
      return res.json({ user: null });
    }
    res.json({ user: { id: user.id, email: user.email, skins: user.skins } });
  });

  return router;
}
