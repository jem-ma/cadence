// Email + password accounts with signed, HTTP-only session cookies (stateless — works on serverless).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { users } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'cadence_session';
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  // Hosted deployments must set their own secret; a fixed fallback is only acceptable on your own machine.
  if (process.env.VERCEL || process.env.DATABASE_URL) throw new Error('SESSION_SECRET must be set (32+ random characters).');
  return 'cadence-local-development-secret-not-for-production';
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), 64);
  const expected = Buffer.from(keyB64, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function unsign(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

const secure = () => process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

export function setSession(res, userId) {
  const token = sign({ uid: userId, exp: Date.now() + SESSION_DAYS * 86400000 });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure() ? '; Secure' : ''}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure() ? '; Secure' : ''}`);
}

/** Express middleware: attaches req.user ({ id, email }) or responds 401. */
export async function requireUser(req, res, next) {
  try {
    const p = unsign(readCookie(req, COOKIE));
    const user = p && (await users.byId(p.uid));
    if (!user) return res.status(401).json({ error: 'signed-out' });
    req.user = { id: user.id, email: user.email };
    next();
  } catch (e) {
    next(e);
  }
}

export function validateCredentials(email, password) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (typeof password !== 'string' || password.length < 10) return 'Use a password of at least 10 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

/** Returns the user on success, or { error, status } — with a temporary lock after repeated failures. */
export async function attemptLogin(email, password) {
  const user = await users.byEmail(String(email || ''));
  if (!user) {
    await hashPassword('timing-equaliser'); // similar response time whether or not the account exists
    return { error: 'Email or password is incorrect.', status: 401 };
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) return { error: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`, status: 429 };
  if (!(await verifyPassword(String(password || ''), user.password_hash))) {
    const lock = user.failed_logins + 1 >= MAX_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
    await users.recordFailure(user.id, lock);
    return { error: lock ? `Too many attempts. Try again in ${LOCK_MINUTES} minutes.` : 'Email or password is incorrect.', status: lock ? 429 : 401 };
  }
  await users.clearFailures(user.id);
  return { user };
}
