// Turns a database from the original single-user version into a Cadence export file
// that can be imported into an account (Settings → Your data → Import).
// Usage: node scripts/export-legacy.mjs <old-database.db> <output.json>
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { COLLECTIONS } from '../server/db.js';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Usage: node scripts/export-legacy.mjs <old-database.db> <output.json>');
  process.exit(1);
}
const db = new DatabaseSync(input, { readOnly: true });
const table = ['docs', 'legacy_docs', 'legacy_docs_adopted'].find((t) => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t));
if (!table) throw new Error('No single-user Cadence data found in that file.');
const data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
for (const r of db.prepare(`SELECT collection, data FROM ${table}`).all()) if (data[r.collection]) data[r.collection].push(JSON.parse(r.data));
fs.writeFileSync(output, JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Cadence', version: 1, data }, null, 2));
console.log(`Wrote ${output}: ${Object.entries(data).map(([c, l]) => `${l.length} ${c}`).join(', ')}`);
