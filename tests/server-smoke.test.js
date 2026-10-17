import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Express starts, exposes its health endpoint, and protects customer routes', { timeout: 15000 }, async () => {
  const portProbe = createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      CLIENT_URL: baseUrl,
      SESSION_SECRET: randomBytes(48).toString('hex'),
      DATABASE_URL: 'mysql://ditz:ditz@127.0.0.1:1/ditz_store',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    let health;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Server exited before start.\n${output}`);
      try {
        health = await fetch(`${baseUrl}/api/health`);
        if (health.ok) break;
      } catch {
        await delay(100);
      }
    }
    assert.ok(health?.ok, `Server did not become ready.\n${output}`);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const protectedPage = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(protectedPage.status, 401);
    assert.deepEqual(await protectedPage.json(), { error: 'Please sign in to continue.' });
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(3000)]);
    }
  }
});
