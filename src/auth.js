import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const SESSION_DAYS = 30;
export const COOKIE_NAME = 'hh_session';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function newInviteCode() {
  // Short, unambiguous code that is easy to read out to a partner.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, maxAge: SESSION_DAYS * 86400_000 };
}

export function destroySession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Accepts the session cookie (web) or an `Authorization: Bearer` token (future native app).
export function sessionToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return readCookie(req, COOKIE_NAME);
}

export function loadUser(db) {
  return (req, _res, next) => {
    const token = sessionToken(req);
    if (token) {
      const row = db.prepare(`
        SELECT u.id, u.email, u.name, u.household_id
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?`).get(token, new Date().toISOString());
      if (row) req.user = { ...row };
    }
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

export function requireHousehold(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (!req.user.household_id) return res.status(409).json({ error: 'Join or create a household first' });
  next();
}
