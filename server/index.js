// Local runner: serves the API plus the front end (Vite in development, built files in production).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv();

const { default: app } = await import('./app.js');
const { driver } = await import('./db.js');
const { aiStatus } = await import('./ai.js');
const express = (await import('express')).default;

const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

const d = await driver();
app.listen(PORT, HOST, () => {
  console.log(`Cadence running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Storage: ${d.kind === 'postgres' ? 'Postgres (DATABASE_URL)' : d.file}`);
  console.log(`AI coach: ${aiStatus().enabled ? 'enabled (' + aiStatus().model + ')' : 'not configured — rule-based coach active'}`);
});

function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
