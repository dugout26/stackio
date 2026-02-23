// SQLite database via sql.js (in-memory with file persistence)
// Stores user accounts, sessions, and skin ownership

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'stackio.db');
let db = null;

const SESSION_DURATION_DAYS = 30;

/** Initialize SQLite database */
export async function initDB() {
  const SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    skins_owned TEXT DEFAULT '["default","hexagon","none","dots"]',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  saveDB();
  console.log('[DB] SQLite initialized');
}

/** Write in-memory database to disk */
export function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

/** Create a new user */
export function createUser(email, passwordHash, existingSkins) {
  const defaultSkins = ['default', 'hexagon', 'none', 'dots'];
  const merged = [...new Set([...defaultSkins, ...(existingSkins || [])])];

  db.run(
    'INSERT INTO users (email, password_hash, skins_owned) VALUES (?, ?, ?)',
    [email, passwordHash, JSON.stringify(merged)]
  );

  const row = db.exec('SELECT last_insert_rowid() as id')[0];
  const id = row.values[0][0];
  saveDB();

  return { id, email, skins: merged };
}

/** Look up user by email */
export function getUserByEmail(email) {
  const stmt = db.prepare('SELECT id, email, password_hash, skins_owned FROM users WHERE email = ?');
  stmt.bind([email]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id,
      email: row.email,
      password_hash: row.password_hash,
      skins: JSON.parse(row.skins_owned),
    };
  }
  stmt.free();
  return null;
}

/** Look up user by ID */
export function getUserById(id) {
  const stmt = db.prepare('SELECT id, email, skins_owned FROM users WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      id: row.id,
      email: row.email,
      skins: JSON.parse(row.skins_owned),
    };
  }
  stmt.free();
  return null;
}

/** Create a session for a user, returns token */
export function createSession(userId) {
  const token = uuidv4();
  const expires = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const expiresStr = expires.toISOString();

  db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresStr]);
  saveDB();
  return token;
}

/** Validate a session token, returns { token, user_id } or null */
export function getSession(token) {
  if (!token) return null;
  const stmt = db.prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?');
  stmt.bind([token]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    if (new Date(row.expires_at) < new Date()) {
      deleteSession(token);
      return null;
    }
    return { token: row.token, user_id: row.user_id };
  }
  stmt.free();
  return null;
}

/** Delete a session */
export function deleteSession(token) {
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
  saveDB();
}

/** Add a skin to a user's owned skins */
export function addSkinToUser(userId, skinId) {
  const user = getUserById(userId);
  if (!user) return null;

  const skins = new Set(user.skins);
  skins.add(skinId);
  const arr = [...skins];

  db.run('UPDATE users SET skins_owned = ? WHERE id = ?', [JSON.stringify(arr), userId]);
  saveDB();
  return arr;
}
