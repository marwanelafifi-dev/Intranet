import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(fileURLToPath(new URL('../server.mjs', import.meta.url)));

test('Si-Voice keeps its provider credential on the server', async () => {
  const [client, server, compose, envExample] = await Promise.all([
    readFile(join(projectRoot, 'public', 'Si-Voice - Anonymous Employee Suggestion and Complaints Bot-.html'), 'utf8'),
    readFile(join(projectRoot, 'server.mjs'), 'utf8'),
    readFile(join(projectRoot, 'docker-compose.yml'), 'utf8'),
    readFile(join(projectRoot, '.env.example'), 'utf8')
  ]);

  assert.match(client, /fetch\('\/api\/si-voice\/chat'/);
  assert.doesNotMatch(client, /authorization|bearer\s+[a-z0-9._-]+/i);
  assert.match(server, /SI_VOICE_API_TOKEN/);
  assert.match(server, /url\.pathname === '\/api\/si-voice\/chat'/);
  assert.match(server, /intranet\.whistleblower/);
  assert.match(compose, /SI_VOICE_API_TOKEN/);
  assert.match(envExample, /SI_VOICE_API_TOKEN=/);
});
