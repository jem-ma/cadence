// User-scoped document store.
// - Hosted (Vercel): Postgres via DATABASE_URL (e.g. Neon).
// - Local: SQLite file via Node's built-in node:sqlite.
// Each user's data is a set of JSON documents per collection. Per-user settings that aren't documents
// (e.g. daily AI usage) live in a separate key/value table that the general API never returns.
import fs from 'node:fs';
import path from 'node:path';
import { newUserData, upgradeLegacyProfile } from '../src/shared/seed.js';

export const COLLECTIONS = [
  'profile',
  'challenges',
  'activities',
  'calendar',
  'dayOverrides',
  'events',
  'cycle',
  'plannedSessions',
  'dayPlans',
  'energyLogs',
  'foods',
  'recommendations',
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS user_docs (
    user_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, collection, id)
  )`,
  `CREATE TABLE IF NOT EXISTS user_kv (
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (user_id, kind, key)
  )`,
];

// ---------------- drivers ----------------
function sqliteDriver() {
  // imported lazily so Vercel never loads node:sqlite
  return import('node:sqlite').then(({ DatabaseSync }) => {
    const dir = process.env.CADENCE_DATA_DIR || path.resolve(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, process.env.CADENCE_DB || 'cadence.db');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL;');
    const cache = new Map();
    const stmt = (sql) => {
      if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
      return cache.get(sql);
    };
    return {
      kind: 'sqlite',
      file,
      async query(sql, params = []) {
        const s = stmt(sql);
        return /^\s*(SELECT|WITH)/i.test(sql) ? s.all(...params) : (s.run(...params), []);
      },
      async exec(sql) {
        db.exec(sql);
      },
      async tx(fn) {
        db.exec('BEGIN');
        try {
          const r = await fn(this);
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      },
      raw: db,
    };
  });
}

async function pgDriver(url) {
  const { default: pg } = await import('pg');
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: local ? false : { rejectUnauthorized: false } });
  const toPg = (sql) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const run = async (client, sql, params) => (await client.query(toPg(sql), params)).rows;
  return {
    kind: 'postgres',
    async query(sql, params = []) {
      return run(pool, sql, params);
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const r = await fn({ query: (sql, params = []) => run(client, sql, params) });
        await client.query('COMMIT');
        return r;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

let driverPromise = null;
export function driver() {
  if (!driverPromise) {
    driverPromise = (async () => {
      const d = process.env.DATABASE_URL ? await pgDriver(process.env.DATABASE_URL) : await sqliteDriver();
      if (d.kind === 'sqlite') await renameLegacyTables(d);
      for (const sql of SCHEMA) await d.exec(sql);
      return d;
    })();
  }
  return driverPromise;
}

// The single-user version stored data in tables without a user. Keep it aside so the first
// account created on this machine can adopt it.
async function renameLegacyTables(d) {
  const t = d.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('docs','secrets','meta')").all().map((r) => r.name);
  if (t.includes('docs')) d.raw.exec('ALTER TABLE docs RENAME TO legacy_docs');
  if (t.includes('secrets')) d.raw.exec('ALTER TABLE secrets RENAME TO legacy_secrets');
  if (t.includes('meta')) d.raw.exec('ALTER TABLE meta RENAME TO legacy_meta');
}

// ---------------- users ----------------
export const users = {
  async byEmail(email) {
    const d = await driver();
    return (await d.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]))[0] || null;
  },
  async byId(id) {
    const d = await driver();
    return (await d.query('SELECT * FROM users WHERE id = ?', [id]))[0] || null;
  },
  async count() {
    const d = await driver();
    return Number((await d.query('SELECT COUNT(*) AS n FROM users'))[0].n);
  },
  async create({ id, email, passwordHash }) {
    const d = await driver();
    await d.query('INSERT INTO users (id, email, password_hash, created_at, failed_logins) VALUES (?, ?, ?, ?, 0)', [id, email.toLowerCase().trim(), passwordHash, new Date().toISOString()]);
    return this.byId(id);
  },
  async recordFailure(id, lockedUntil) {
    const d = await driver();
    await d.query('UPDATE users SET failed_logins = failed_logins + 1, locked_until = ? WHERE id = ?', [lockedUntil, id]);
  },
  async clearFailures(id) {
    const d = await driver();
    await d.query('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [id]);
  },
  async setPassword(id, passwordHash) {
    const d = await driver();
    await d.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  },
  async remove(id) {
    const d = await driver();
    await d.tx(async (t) => {
      await t.query('DELETE FROM user_docs WHERE user_id = ?', [id]);
      await t.query('DELETE FROM user_kv WHERE user_id = ?', [id]);
      await t.query('DELETE FROM users WHERE id = ?', [id]);
    });
  },
};

// ---------------- per-user store ----------------
export function assertCollection(c) {
  if (!COLLECTIONS.includes(c)) {
    const err = new Error(`Unknown collection: ${c}`);
    err.status = 404;
    throw err;
  }
}

export function forUser(userId) {
  const parse = (rows) => rows.map((r) => JSON.parse(r.data));
  const kv = (kind) => ({
    async get(key) {
      const d = await driver();
      const r = (await d.query('SELECT value FROM user_kv WHERE user_id = ? AND kind = ? AND key = ?', [userId, kind, key]))[0];
      return r ? JSON.parse(r.value) : null;
    },
    async set(key, value) {
      const d = await driver();
      await d.query(
        'INSERT INTO user_kv (user_id, kind, key, value) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, kind, key) DO UPDATE SET value = excluded.value',
        [userId, kind, key, JSON.stringify(value)]
      );
    },
    async del(key) {
      const d = await driver();
      await d.query('DELETE FROM user_kv WHERE user_id = ? AND kind = ? AND key = ?', [userId, kind, key]);
    },
  });

  const putWith = async (q, collection, doc) => {
    if (!doc.id) throw new Error('Document needs an id');
    const now = new Date().toISOString();
    const data = { ...doc, updatedAt: now };
    await q(
      'INSERT INTO user_docs (user_id, collection, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
      [userId, collection, String(doc.id), JSON.stringify(data), now]
    );
    return data;
  };

  const store = {
    userId,
    async all(collection) {
      const d = await driver();
      return parse(await d.query('SELECT data FROM user_docs WHERE user_id = ? AND collection = ? ORDER BY id', [userId, collection]));
    },
    async get(collection, id) {
      const d = await driver();
      const r = (await d.query('SELECT data FROM user_docs WHERE user_id = ? AND collection = ? AND id = ?', [userId, collection, String(id)]))[0];
      return r ? JSON.parse(r.data) : null;
    },
    async put(collection, doc) {
      const d = await driver();
      return putWith((sql, p) => d.query(sql, p), collection, doc);
    },
    async putMany(collection, docs) {
      const d = await driver();
      return d.tx(async (t) => {
        const out = [];
        for (const doc of docs) out.push(await putWith((sql, p) => t.query(sql, p), collection, doc));
        return out;
      });
    },
    async remove(collection, id) {
      const d = await driver();
      await d.query('DELETE FROM user_docs WHERE user_id = ? AND collection = ? AND id = ?', [userId, collection, String(id)]);
    },
    async snapshot() {
      const d = await driver();
      const rows = await d.query('SELECT collection, data FROM user_docs WHERE user_id = ?', [userId]);
      const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
      for (const r of rows) if (out[r.collection]) out[r.collection].push(JSON.parse(r.data));
      for (const c of COLLECTIONS) out[c].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return out;
    },
    /** Replace all of this user's documents (used by import and reset). */
    async replaceAll(data) {
      const d = await driver();
      await d.tx(async (t) => {
        await t.query('DELETE FROM user_docs WHERE user_id = ?', [userId]);
        for (const c of COLLECTIONS) for (const doc of data[c] || []) if (doc?.id != null) await putWith((sql, p) => t.query(sql, p), c, doc);
      });
    },
    secrets: kv('secret'),
    meta: kv('meta'),
  };
  return store;
}

/** Fresh data for a new account. On a machine that ran the single-user version, the first account adopts that data. */
export async function initialiseUser(userId, { name } = {}) {
  const store = forUser(userId);
  const legacy = await legacyData();
  if (legacy && (await users.count()) === 1) {
    legacy.profile = legacy.profile.map((p) => upgradeLegacyProfile(p));
    await store.replaceAll(legacy);
    return { adopted: true };
  }
  await store.replaceAll(newUserData({ name }));
  return { adopted: false };
}

async function legacyData() {
  const d = await driver();
  if (d.kind !== 'sqlite') return null;
  const has = d.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_docs'").get();
  if (!has) return null;
  const rows = d.raw.prepare('SELECT collection, data FROM legacy_docs').all();
  if (!rows.length) return null;
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  for (const r of rows) if (out[r.collection]) out[r.collection].push(JSON.parse(r.data));
  d.raw.exec('ALTER TABLE legacy_docs RENAME TO legacy_docs_adopted');
  return out;
}

export async function storageInfo() {
  const d = await driver();
  return { kind: d.kind, file: d.file || null };
}
