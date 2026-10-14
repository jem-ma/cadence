// AI coach's note and AI food estimates, against a fake Anthropic API (no real calls, no cost).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4397;
const FAKE = 4396;
const BASE = `http://127.0.0.1:${PORT}/api`;
let proc;
let fake;
let dataDir;
const calls = [];
let failRemaining = 0; // the SDK retries 5xx errors twice, so an outage must outlast the retries

function reply(text) {
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } };
}

before(async () => {
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = JSON.parse(body || '{}');
      calls.push({ url: req.url, headers: req.headers, body: json });
      if (failRemaining > 0) {
        failRemaining--;
        res.writeHead(500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
      }
      const isNote = json.system.includes("coach's note");
      const isMeal = json.system.includes('coach_response');
      const out = isNote
        ? { note: 'You have a run from your place today and the plan still covers your target.', focus: 'Pack your kit tonight.' }
        : isMeal
          ? { items: [{ name: 'Porridge', portion: '1 bowl', kcal: 280, protein: 11, carbs: 42, fat: 7 }], totals: { kcal: 280, protein: 11, carbs: 42, fat: 7 }, confidence: 'medium', assumptions: ['made with milk'], note: 'Estimate.', coach_response: 'A solid carbohydrate start — it will carry you nicely into this evening’s run.' }
        : { items: [{ name: 'Banana', portion: '1 medium', kcal: 105, protein: 1, carbs: 27, fat: 0 }], totals: { kcal: 105, protein: 1, carbs: 27, fat: 0 }, confidence: 'high', assumptions: ['medium banana'], note: 'Estimate.' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply(JSON.stringify(out))));
    });
  });
  await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));

  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-ai-'));
  if (!fs.existsSync(path.join(ROOT, 'dist/index.html'))) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' });
  proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      CADENCE_DATA_DIR: dataDir,
      DATABASE_URL: process.env.TEST_DATABASE_URL || '',
      SESSION_SECRET: 'test-secret-test-secret-test-secret-123',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${FAKE}`,
      AI_DAILY_NOTES: '2',
      AI_DAILY_FOOD_ESTIMATES: '2',
      INVITE_CODE: '',
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/health`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
});

after(async () => {
  proc.kill();
  await new Promise((r) => proc.once('exit', r));
  await new Promise((r) => fake.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let cookie = '';
async function call(p, opts = {}) {
  const r = await fetch(BASE + p, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, body: await r.json() };
}

test('setup: an account with a challenge', async () => {
  await call('/auth/signup', { method: 'POST', body: { email: 'ai@example.com', password: 'a-long-password-1' } });
  await call('/challenges', { method: 'POST', body: { id: 'ch', name: 'October 100', targetMiles: 100, startDate: '2026-10-01', endDate: '2026-10-31', activityTypes: ['run', 'walk'] } });
  await call('/profile/me', { method: 'PUT', body: { activeChallengeId: 'ch', onboarded: true } });
  assert.equal((await call('/state')).body.integrations.ai.enabled, true);
});

test('the daily note is written once, then served from the cache', async () => {
  const first = await call('/coach/note', { method: 'POST', body: { localNow: '2026-10-14T09:00' } });
  assert.equal(first.status, 200);
  assert.match(first.body.note.note, /plan still covers/);
  assert.equal(first.body.note.focus, 'Pack your kit tonight.');
  const sent = calls.at(-1);
  assert.equal(sent.body.model, 'claude-opus-5-5');
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.ok(JSON.stringify(sent.body.messages).includes('October 100'), 'the AI receives the challenge summary');
  const n = calls.length;
  const again = await call('/coach/note', { method: 'POST', body: { localNow: '2026-10-14T10:00' } });
  assert.equal(again.body.note.note, first.body.note.note);
  assert.equal(calls.length, n, 'no second AI call');
  const stored = (await call('/state')).body.data.recommendations.find((r) => r.aiNote);
  assert.ok(stored, 'note saved on the day record');
});

test('logging a meal uses one AI call for the estimate and the coach response', async () => {
  const n = calls.length;
  const r = await call('/food/log', { method: 'POST', body: { text: 'Porridge', localNow: '2026-10-14T08:00' } });
  assert.equal(r.status, 200);
  assert.equal(calls.length, n + 1, 'a single AI call');
  assert.equal(r.body.estimate.source, 'ai');
  assert.equal(r.body.estimate.totals.kcal, 280);
  assert.equal(r.body.coach.source, 'ai');
  assert.match(r.body.coach.text, /carbohydrate start/);
  const sent = JSON.stringify(calls.at(-1).body.messages);
  assert.ok(sent.includes('Porridge') && sent.includes('distanceUnit'), 'the AI is told the meal and the distance unit');
  assert.ok(sent.includes('yesterday') && sent.includes('stillPlannedToday'), 'the AI sees recent intake and training');
  assert.match(calls.at(-1).body.system, /today AND yesterday/);
});

test('an AI outage on refresh is reported, and the earlier note is kept', async () => {
  failRemaining = 3;
  const r = await call('/coach/note', { method: 'POST', body: { localNow: '2026-10-14T12:00', refresh: true } });
  assert.equal(r.status, 503);
  assert.ok(r.body.error);
  assert.match(r.body.note.note, /plan still covers/);
});

test('refresh is capped by the daily limit', async () => {
  const limited = await call('/coach/note', { method: 'POST', body: { localNow: '2026-10-14T13:00', refresh: true } });
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /limit/);
  assert.ok(limited.body.note, 'the existing note is still returned');
});

test('AI food estimates are labelled AI, limited per day, and fall back to the food list', async () => {
  const ai = await call('/food/estimate', { method: 'POST', body: { text: 'Banana' } });
  assert.equal(ai.body.source, 'ai');
  assert.equal(ai.body.totals.kcal, 105);
  const limited = await call('/food/estimate', { method: 'POST', body: { text: 'Banana' } });
  assert.equal(limited.body.source, 'library');
  assert.match(limited.body.aiError, /limit/);
});
