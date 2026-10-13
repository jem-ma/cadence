// Cadence API. Every route below /api (except auth and health) is scoped to the signed-in user.
import express from 'express';
import crypto from 'node:crypto';
import { forUser, users, assertCollection, initialiseUser, COLLECTIONS, storageInfo } from './db.js';
import { requireUser, setSession, clearSession, hashPassword, verifyPassword, validateCredentials, attemptLogin } from './auth.js';
import { aiStatus, coachNote, parseFood } from './ai.js';
import { buildCoaching, aiContext, contextFingerprint } from '../src/shared/coach.js';
import { estimateFromText } from '../src/shared/nutrition.js';
import { findPossibleDuplicate, validateActivity } from '../src/shared/calc.js';
import { newUserData, upgradeLegacyProfile } from '../src/shared/seed.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const isoDaysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- AI usage limits (per person, per day) ----------
const LIMITS = { notes: Number(process.env.AI_DAILY_NOTES || 6), foods: Number(process.env.AI_DAILY_FOOD_ESTIMATES || 40) };

/** Reserves one use of an AI feature for today; false when the daily limit has been reached. */
async function takeAiAllowance(store, kind) {
  const today = isoDaysAgo(0);
  const u = await store.meta.get('aiUsage');
  const usage = u?.date === today ? u : { date: today, notes: 0, foods: 0 };
  if ((usage[kind] || 0) >= LIMITS[kind]) return false;
  usage[kind] = (usage[kind] || 0) + 1;
  await store.meta.set('aiUsage', usage);
  return true;
}

// ---------- health ----------
app.get('/api/health', wrap(async (req, res) => {
  const hosted = Boolean(process.env.VERCEL);
  const problems = [];
  if (hosted && !process.env.DATABASE_URL) problems.push('DATABASE_URL is not set — connect a Postgres database (e.g. Neon) to this project.');
  if ((hosted || process.env.DATABASE_URL) && !(process.env.SESSION_SECRET?.length >= 32)) problems.push('SESSION_SECRET is missing or shorter than 32 characters.');
  const storage = problems.length ? null : (await storageInfo()).kind;
  res.status(problems.length ? 500 : 200).json({ ok: !problems.length, storage, problems });
}));

// ---------- auth ----------
app.get('/api/auth/config', (req, res) => res.json({ inviteRequired: Boolean(process.env.INVITE_CODE) }));

app.post('/api/auth/signup', wrap(async (req, res) => {
  const { email, password, name = '', invite = '' } = req.body || {};
  const problem = validateCredentials(email, password);
  if (problem) return res.status(400).json({ error: problem });
  if (process.env.INVITE_CODE && invite.trim() !== process.env.INVITE_CODE) return res.status(403).json({ error: 'That invite code isn’t right.' });
  if (await users.byEmail(email)) return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
  const user = await users.create({ id: newId('u'), email, passwordHash: await hashPassword(password) });
  const r = await initialiseUser(user.id, { name: String(name).slice(0, 60) });
  setSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email }, adoptedExistingData: r.adopted });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const r = await attemptLogin(req.body?.email, req.body?.password);
  if (r.error) return res.status(r.status).json({ error: r.error });
  setSession(res, r.user.id);
  res.json({ user: { id: r.user.id, email: r.user.email } });
}));

app.post('/api/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// everything below requires a signed-in user
app.use('/api', requireUser);
app.use('/api', (req, res, next) => {
  req.store = forUser(req.user.id);
  next();
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));

app.put('/api/account/password', wrap(async (req, res) => {
  const { current, next } = req.body || {};
  const user = await users.byId(req.user.id);
  if (!(await verifyPassword(String(current || ''), user.password_hash))) return res.status(401).json({ error: 'Your current password is incorrect.' });
  const problem = validateCredentials(user.email, next);
  if (problem) return res.status(400).json({ error: problem });
  await users.setPassword(user.id, await hashPassword(next));
  res.json({ ok: true });
}));

app.delete('/api/account', wrap(async (req, res) => {
  const user = await users.byId(req.user.id);
  if (!(await verifyPassword(String(req.body?.password || ''), user.password_hash))) return res.status(401).json({ error: 'Password is incorrect.' });
  await users.remove(user.id);
  clearSession(res);
  res.json({ ok: true });
}));

// ---------- state ----------
app.get('/api/state', wrap(async (req, res) => {
  const data = await req.store.snapshot();
  res.json({ data, user: req.user, integrations: await integrations(req) });
}));

async function integrations(req) {
  return { ai: aiStatus() };
}

// ---------- activities (duplicates and imported entries) ----------
function normaliseActivity(b) {
  const a = { ...b };
  if (a.distanceKm != null && a.distanceKm !== '' && (a.distanceMi == null || a.distanceMi === '')) a.distanceMi = Number(a.distanceKm) / 1.609344;
  delete a.distanceKm;
  a.distanceMi = Math.round(Number(a.distanceMi) * 100) / 100;
  a.durationMin = a.durationMin === '' || a.durationMin == null ? null : Math.round(Number(a.durationMin));
  a.effort = a.effort === '' || a.effort == null ? null : Number(a.effort);
  return a;
}

app.post('/api/activities', wrap(async (req, res) => {
  const a = normaliseActivity(req.body);
  const errors = validateActivity(a);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields', fields: errors });
  if (!req.body.force) {
    const dup = findPossibleDuplicate(a, (await req.store.all('activities')).filter((x) => !x.excluded));
    if (dup) return res.status(409).json({ error: 'possible-duplicate', duplicate: dup });
  }
  delete a.force;
  res.json(await req.store.put('activities', { ...a, id: a.id || newId('act'), source: a.source || 'manual', createdAt: new Date().toISOString() }));
}));

app.put('/api/activities/:id', wrap(async (req, res) => {
  const prev = await req.store.get('activities', req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });
  const a = normaliseActivity({ ...prev, ...req.body, id: prev.id });
  const errors = validateActivity(a);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the highlighted fields', fields: errors });
  if (req.body.excluded === false) delete a.reviewNote;
  res.json(await req.store.put('activities', a));
}));

app.delete('/api/activities/:id', wrap(async (req, res) => {
  const prev = await req.store.get('activities', req.params.id);
  if (!prev) return res.status(404).json({ error: 'Not found' });
  await req.store.remove('activities', prev.id);
  res.json({ ok: true });
}));

// ---------- nutrition estimate ----------
app.post('/api/food/estimate', wrap(async (req, res) => {
  const { text = '', portion = '', notes = '', photo = null } = req.body || {};
  if (!text.trim() && !photo) return res.status(400).json({ error: 'Describe the food or add a photo' });
  if (aiStatus().enabled) {
    if (!(await takeAiAllowance(req.store, 'foods'))) return res.json({ ...estimateFromText(`${text} ${portion}`), aiError: 'Daily AI estimate limit reached' });
    try {
      return res.json({ ...(await parseFood({ text, portion, notes, photo })), unmatched: [], source: 'ai' });
    } catch (e) {
      return res.json({ ...estimateFromText(`${text} ${portion}`), aiError: e.message });
    }
  }
  res.json(estimateFromText(`${text} ${portion}`));
}));

// ---------- coach ----------
async function coachData(store, challengeId) {
  const s = await store.snapshot();
  const profile = s.profile[0] || {};
  const challenge = s.challenges.find((c) => c.id === (challengeId || profile.activeChallengeId)) || s.challenges[0];
  return {
    challenge,
    activities: s.activities,
    energyLogs: s.energyLogs,
    foods: s.foods,
    profile,
    recommendations: s.recommendations,
    cal: {
      weekTemplate: s.calendar.find((c) => c.id === 'weekTemplate')?.template,
      dayOverrides: s.dayOverrides,
      events: s.events,
      cycle: s.cycle,
      plannedSessions: s.plannedSessions,
      dayPlans: s.dayPlans,
      personal: profile.personal,
    },
  };
}

/**
 * Today's AI coach's note. Generated once a day automatically; "refresh" regenerates it
 * (up to the daily limit). Cached on the day's recommendation record.
 */
app.post('/api/coach/note', wrap(async (req, res) => {
  if (!aiStatus().enabled) return res.json({ enabled: false });
  const now = req.body?.localNow ? new Date(req.body.localNow) : new Date();
  const data = await coachData(req.store, req.body?.challengeId);
  if (!data.challenge) return res.status(400).json({ error: 'No active challenge' });
  const ctx = buildCoaching(data, now);
  const id = `${ctx.today}-${data.challenge.id}`;
  const prev = (await req.store.get('recommendations', id)) || { id, date: ctx.today, challengeId: data.challenge.id, status: 'open' };
  if (prev.aiNote && !req.body?.refresh) return res.json({ enabled: true, note: prev.aiNote });
  if (!(await takeAiAllowance(req.store, 'notes'))) {
    return res.status(429).json({ error: `You’ve reached today’s limit of ${LIMITS.notes} AI notes. It resets tomorrow.`, note: prev.aiNote || null });
  }
  try {
    const out = await coachNote(aiContext(ctx, data));
    const aiNote = { note: out.note, focus: out.focus, generatedAt: new Date().toISOString(), fingerprint: contextFingerprint(ctx), model: aiStatus().model };
    await req.store.put('recommendations', { ...prev, aiNote });
    res.json({ enabled: true, note: aiNote });
  } catch (e) {
    res.status(503).json({ error: e.message, note: prev.aiNote || null });
  }
}));

// ---------- export / import / reset ----------
app.get('/api/export.json', wrap(async (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="cadence-export-${isoDaysAgo(0)}.json"`);
  res.json({ exportedAt: new Date().toISOString(), app: 'Cadence', version: 2, data: await req.store.snapshot() });
}));

app.get('/api/export/:name.csv', wrap(async (req, res) => {
  const s = await req.store.snapshot();
  const tables = {
    activities: [s.activities, ['id', 'date', 'startTime', 'type', 'distanceMi', 'durationMin', 'effort', 'source', 'excluded', 'deleted', 'notes']],
    foods: [s.foods, ['id', 'date', 'time', 'meal', 'text', 'portion', 'notes', 'kcal', 'protein', 'carbs', 'fat', 'estimateSource']],
    energy: [s.energyLogs, ['id', 'date', 'time', 'energy', 'sleepHours', 'sleepQuality', 'mood', 'soreness', 'fatigue', 'motivation', 'recovery', 'cycle', 'notes']],
  };
  const t = tables[req.params.name];
  if (!t) return res.status(404).send('Unknown export');
  const [rows, cols] = t;
  const flat = rows.map((r) => (req.params.name === 'foods' ? { ...r, ...(r.estimate?.totals || {}), estimateSource: r.estimate?.source || '' } : r));
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cadence-${req.params.name}-${isoDaysAgo(0)}.csv"`);
  res.send([cols.join(','), ...flat.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
}));

/** Replace this account's data with a Cadence JSON export (e.g. moving from a local copy). */
app.post('/api/import', wrap(async (req, res) => {
  if (req.body?.confirm !== 'REPLACE') return res.status(400).json({ error: 'Confirmation missing' });
  const data = req.body?.export?.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.profile)) return res.status(400).json({ error: 'That doesn’t look like a Cadence export file.' });
  const clean = Object.fromEntries(COLLECTIONS.map((c) => [c, Array.isArray(data[c]) ? data[c].filter((d) => d && d.id != null) : []]));
  if (!clean.profile.length) clean.profile = newUserData().profile;
  clean.profile = clean.profile.map((p) => upgradeLegacyProfile(p));
  await req.store.replaceAll(clean);
  const counts = Object.fromEntries(COLLECTIONS.map((c) => [c, clean[c].length]));
  res.json({ ok: true, counts });
}));

app.post('/api/reset', wrap(async (req, res) => {
  if (req.body?.confirm !== 'RESET') return res.status(400).json({ error: 'Type RESET to confirm' });
  const profile = (await req.store.all('profile'))[0];
  await req.store.replaceAll(newUserData({ name: profile?.name || '' }));
  res.json({ ok: true });
}));

// ---------- generic collections ----------
app.post('/api/:collection', wrap(async (req, res) => {
  assertCollection(req.params.collection);
  const doc = { ...req.body, id: req.body.id || newId(req.params.collection.slice(0, 3)) };
  if (!doc.createdAt) doc.createdAt = new Date().toISOString();
  res.json(await req.store.put(req.params.collection, doc));
}));
app.put('/api/:collection/:id', wrap(async (req, res) => {
  assertCollection(req.params.collection);
  const prev = (await req.store.get(req.params.collection, req.params.id)) || {};
  res.json(await req.store.put(req.params.collection, { ...prev, ...req.body, id: req.params.id }));
}));
app.delete('/api/:collection/:id', wrap(async (req, res) => {
  assertCollection(req.params.collection);
  await req.store.remove(req.params.collection, req.params.id);
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', (err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong on the server.' });
});

export default app;
