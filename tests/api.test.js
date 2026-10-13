// End-to-end API tests against a real server process with a throwaway database.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}/api`;
let proc;
let dataDir;

async function startServer(extraEnv = {}) {
  proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), CADENCE_DATA_DIR: dataDir, DATABASE_URL: process.env.TEST_DATABASE_URL || '', ANTHROPIC_API_KEY: '', INVITE_CODE: '', SESSION_SECRET: 'test-secret-test-secret-test-secret-123', ...extraEnv },
    stdio: 'pipe',
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
}
async function stopServer() {
  proc.kill();
  await new Promise((r) => proc.once('exit', r));
}

/** A tiny client that keeps its own session cookie. */
function client() {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const r = await fetch(BASE + p, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await r.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* csv or text */
    }
    return { status: r.status, body };
  };
  return { call, raw: () => cookie };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-test-'));
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' });
  await startServer();
});
after(async () => {
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const alice = client();
const bob = client();

test('accounts: data requires sign-in; weak passwords and duplicates are rejected', async () => {
  assert.equal((await alice.call('/state')).status, 401);
  assert.equal((await alice.call('/auth/signup', { method: 'POST', body: { email: 'alice@example.com', password: 'short' } })).status, 400);
  const ok = await alice.call('/auth/signup', { method: 'POST', body: { email: 'Alice@Example.com', password: 'a-long-password-1', name: 'Alice' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.adoptedExistingData, false);
  assert.equal((await bob.call('/auth/signup', { method: 'POST', body: { email: 'alice@example.com', password: 'another-password' } })).status, 409);
  await bob.call('/auth/signup', { method: 'POST', body: { email: 'bob@example.com', password: 'bobs-password-123' } });
});

test('a new account starts empty and un-onboarded — nobody else’s setup', async () => {
  const s = (await alice.call('/state')).body;
  assert.equal(s.user.email, 'alice@example.com');
  assert.equal(s.data.profile[0].onboarded, false);
  assert.equal(s.data.profile[0].name, 'Alice');
  assert.equal(s.data.challenges.length, 0);
  assert.equal(s.data.activities.length, 0);
  assert.equal(s.data.profile[0].personal.runFromPlace, 'work');
  assert.equal(s.data.profile[0].personal.commuteWalkMi, 0);
});

test('6. manual entry works; duplicates are caught; edits persist', async () => {
  const st = (await alice.call('/state')).body;
  assert.equal(st.integrations.ai.enabled, false);
  assert.equal((await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'run', distanceMi: 0 } })).status, 400);
  const km = await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'run', distanceKm: 5, durationMin: 30 } });
  assert.equal(km.body.distanceMi, 3.11);
  assert.equal((await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'run', distanceMi: 3.1 } })).status, 409);
  const forced = await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'run', distanceMi: 3.1, force: true } });
  assert.equal(forced.status, 200);
  await alice.call(`/activities/${forced.body.id}`, { method: 'DELETE' });
  const edited = await alice.call(`/activities/${km.body.id}`, { method: 'PUT', body: { distanceMi: 3.5, excluded: true } });
  assert.equal(edited.body.distanceMi, 3.5);
  assert.equal(edited.body.excluded, true);
});

test('users cannot see or change each other’s data', async () => {
  const aliceActs = (await alice.call('/state')).body.data.activities;
  assert.equal(aliceActs.length, 1);
  const bobState = (await bob.call('/state')).body.data;
  assert.equal(bobState.activities.length, 0);
  // Bob guessing Alice's activity id only ever touches his own (empty) data
  assert.equal((await bob.call(`/activities/${aliceActs[0].id}`, { method: 'PUT', body: { distanceMi: 99 } })).status, 404);
  await bob.call(`/activities/${aliceActs[0].id}`, { method: 'DELETE' });
  assert.equal((await alice.call('/state')).body.data.activities[0].distanceMi, 3.5);
});

test('7. food, energy and wellbeing persist across a server restart; sessions survive too', async () => {
  await alice.call('/foods', { method: 'POST', body: { date: '2026-10-13', time: '08:00', meal: 'breakfast', text: 'Porridge with banana' } });
  await alice.call('/energyLogs', { method: 'POST', body: { date: '2026-10-13', time: '08:05', energy: 6, sleepHours: 7, cycle: 'day 1' } });
  const est = await alice.call('/food/estimate', { method: 'POST', body: { text: 'Protein yoghurt and an apple' } });
  assert.equal(est.body.source, 'library');
  await stopServer();
  await startServer();
  const s = (await alice.call('/state')).body.data;
  assert.equal(s.foods[0].text, 'Porridge with banana');
  assert.equal(s.energyLogs[0].cycle, 'day 1');
});

test('8 & 13. calendar edits are independent; new challenges keep history', async () => {
  await alice.call('/dayOverrides', { method: 'POST', body: { id: '2026-10-16', date: '2026-10-16', status: 'unavailable' } });
  await alice.call('/challenges', { method: 'POST', body: { id: 'ch-oct', name: 'October 100', targetMiles: 100, startDate: '2026-10-01', endDate: '2026-10-31', activityTypes: ['run', 'walk'] } });
  await alice.call('/challenges', { method: 'POST', body: { id: 'ch-nov', name: 'November 80', targetMiles: 80, startDate: '2026-11-01', endDate: '2026-11-30', activityTypes: ['run', 'walk'] } });
  await alice.call('/profile/me', { method: 'PUT', body: { activeChallengeId: 'ch-nov', onboarded: true } });
  const s = (await alice.call('/state')).body.data;
  assert.equal(s.challenges.length, 2);
  assert.equal(s.dayOverrides.length, 1);
  assert.equal(s.activities.length, 1);
});

test('without an AI key the coach note is simply off, and food estimates use the built-in list', async () => {
  await alice.call('/profile/me', { method: 'PUT', body: { activeChallengeId: 'ch-oct' } });
  const r = await alice.call('/coach/note', { method: 'POST', body: { localNow: '2026-10-14T09:00' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
  const est = await alice.call('/food/estimate', { method: 'POST', body: { text: 'Banana' } });
  assert.equal(est.body.source, 'library');
});

test('"what did you eat" saves the meal with an estimate and a built-in coach response when AI is off', async () => {
  const r = await alice.call('/food/log', { method: 'POST', body: { text: 'Porridge with banana and peanut butter', localNow: '2026-10-14T08:10' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.entry.meal, 'breakfast', 'meal type is chosen from the time of day');
  assert.equal(r.body.entry.time, '08:10');
  assert.equal(r.body.entry.date, '2026-10-14');
  assert.equal(r.body.estimate.source, 'library');
  assert.ok(r.body.estimate.totals.kcal > 300);
  assert.equal(r.body.coach.source, 'rules');
  assert.ok(r.body.coach.text.length > 10);
  const saved = (await alice.call('/state')).body.data.foods.find((f) => f.id === r.body.entry.id);
  assert.equal(saved.coach.text, r.body.coach.text, 'the response is stored with the entry');
  assert.equal((await alice.call('/food/log', { method: 'POST', body: { text: '   ' } })).status, 400);
  // a meal right before a planned run gets run-aware advice
  const before = await alice.call('/food/log', { method: 'POST', body: { text: 'Chicken wrap and crisps', localNow: '2026-10-14T16:30' } });
  assert.equal(before.status, 200);
  assert.equal(before.body.entry.meal, 'snack');
});

test('activity types beyond run and walk can be logged; boxing needs a duration', async () => {
  assert.equal((await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'cycle', distanceKm: 20, durationMin: 55 } })).status, 200);
  assert.equal((await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'box', durationMin: '' } })).status, 400);
  const box = await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'box', durationMin: 45 } });
  assert.equal(box.status, 200);
  assert.equal(box.body.distanceMi, 0);
  assert.equal((await alice.call('/activities', { method: 'POST', body: { date: '2026-10-13', type: 'box', durationMin: 45 } })).status, 409, 'same-length session the same day is flagged as a duplicate');
});

test('export, then import into another account, round-trips the data', async () => {
  const exp = await alice.call('/export.json');
  assert.equal(exp.status, 200);
  assert.equal(exp.body.version, 2);
  const csv = await alice.call('/export/activities.csv');
  assert.match(csv.body.split('\n')[0], /^id,date,startTime,type,distanceMi/);
  assert.equal((await bob.call('/import', { method: 'POST', body: { export: exp.body } })).status, 400, 'needs confirmation');
  const imp = await bob.call('/import', { method: 'POST', body: { confirm: 'REPLACE', export: exp.body } });
  assert.equal(imp.status, 200);
  const b = (await bob.call('/state')).body.data;
  assert.equal(b.challenges.length, 2);
  assert.equal(b.foods[0].text, 'Porridge with banana');
});

test('legacy (single-user) exports are upgraded with the original personal setup', async () => {
  const legacy = { app: 'Cadence', version: 1, data: { profile: [{ id: 'me', name: 'J', activeChallengeId: 'ch' }], challenges: [], activities: [] } };
  await bob.call('/import', { method: 'POST', body: { confirm: 'REPLACE', export: legacy } });
  const p = (await bob.call('/state')).body.data.profile[0];
  assert.equal(p.onboarded, true);
  assert.equal(p.personal.runFromPlace, "Nan's");
});

test('repeated wrong passwords lock the account temporarily; sign-out ends the session', async () => {
  const eve = client();
  for (let i = 0; i < 4; i++) assert.equal((await eve.call('/auth/login', { method: 'POST', body: { email: 'bob@example.com', password: 'wrong-wrong' } })).status, 401);
  assert.equal((await eve.call('/auth/login', { method: 'POST', body: { email: 'bob@example.com', password: 'wrong-wrong' } })).status, 429);
  assert.equal((await eve.call('/auth/login', { method: 'POST', body: { email: 'bob@example.com', password: 'bobs-password-123' } })).status, 429, 'locked even with the right password');
  await alice.call('/auth/logout', { method: 'POST' });
  assert.equal((await alice.call('/state')).status, 401);
});

test('deleting an account removes its data', async () => {
  const c = client();
  await c.call('/auth/signup', { method: 'POST', body: { email: 'temp@example.com', password: 'temporary-password' } });
  assert.equal((await c.call('/account', { method: 'DELETE', body: { password: 'nope-nope-nope' } })).status, 401);
  assert.equal((await c.call('/account', { method: 'DELETE', body: { password: 'temporary-password' } })).status, 200);
  assert.equal((await c.call('/state')).status, 401);
  assert.equal((await c.call('/auth/login', { method: 'POST', body: { email: 'temp@example.com', password: 'temporary-password' } })).status, 401);
});
