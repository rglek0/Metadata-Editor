const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// DB file lives alongside server by default
const dbPath = path.resolve('./db/auth.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// Migrate old DB location if found
try {
  const oldDbPath = path.resolve('./temp/auth.db');
  if (fs.existsSync(oldDbPath) && !fs.existsSync(dbPath)) {
    fs.renameSync(oldDbPath, dbPath);
  }
} catch (e) {
  // Non-fatal: log once if migration fails
  console.warn('Auth DB migration warning:', e.message || e);
}
const db = new Database(dbPath);

// Ensure users table
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
`);

const getUserByUsernameStmt = db.prepare('SELECT * FROM users WHERE username = ?');
const insertUserStmt = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
const updateLastLoginStmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?');

async function hashPassword(password) {
  // bcrypt v6 defaults to 10 salt rounds if not specified; make it explicit
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

async function createUser(username, password, role = 'user') {
  if (!username || !password) throw new Error('username and password required');
  const password_hash = await hashPassword(password);
  try {
    const info = insertUserStmt.run(username, password_hash, role);
    return { id: info.lastInsertRowid, username, role };
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('username already exists');
    }
    throw err;
  }
}

function getUserByUsername(username) {
  return getUserByUsernameStmt.get(username);
}

async function verifyPassword(username, password) {
  const user = getUserByUsername(username);
  if (!user) return { ok: false };
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return { ok: false };
  updateLastLoginStmt.run(user.id);
  return { ok: true, user: { id: user.id, username: user.username, role: user.role } };
}

module.exports = {
  db,
  createUser,
  getUserByUsername,
  verifyPassword,
  updatePassword: async (username, newPassword) => {
    if (!username || !newPassword) throw new Error('username and newPassword required');
    const hash = await hashPassword(newPassword);
    const res = updatePasswordStmt.run(hash, username);
    if (res.changes === 0) throw new Error('user not found');
    return true;
  },
};
