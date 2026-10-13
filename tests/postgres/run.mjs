// Runs the server suite against Postgres (PGlite over the Postgres wire protocol),
// i.e. the same database driver used when hosted on Vercel.
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: 5499, host: '127.0.0.1', maxConnections: 20 });
await server.start();
const url = 'postgres://postgres:postgres@127.0.0.1:5499/postgres';
// spawn (not spawnSync): this process must stay free to serve the database while the tests run
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/api.test.js', 'tests/ai.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: url },
});
const code = await new Promise((resolve) => child.on('exit', resolve));
await server.stop();
await db.close();
process.exit(code ?? 1);
