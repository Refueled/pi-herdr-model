import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test, type TestContext } from 'node:test';
import { cacheFile, title } from '../radar/model-title.cjs';
import { withTitleCache } from '../src/cache.js';
import type { MetadataRequest } from '../src/transport.js';

const request = (seq: number, model: string | null, clear = false): MetadataRequest => ({
  id: `test:${seq}`, method: 'pane.report_metadata', params: {
    pane_id: 'test:p1', source: 'pi-herdr-model', agent: 'pi', seq,
    ...(clear ? { clear_display_agent: true } : { display_agent: 'gpt' }),
    tokens: { pi_model: model }, ttl_ms: 60_000,
  },
});
async function scope(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-herdr-model-cache-test-'));
  const env = { XDG_STATE_HOME: root, HERDR_SOCKET_PATH: 'test-socket:' + root };
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return env;
}
test('cache path is pane/session-scoped and cannot traverse directories', () => {
  const env = { XDG_STATE_HOME: '/state', HERDR_SOCKET_PATH: '/socket' };
  const file = cacheFile('../../escape', env, 'linux', '/home/test')!;
  assert.match(path.basename(file), /^[a-f0-9]{64}\.json$/);
  assert.notEqual(file, cacheFile('test:p1', env, 'linux', '/home/test'));
  assert.notEqual(file, cacheFile('../../escape', { ...env, HERDR_SOCKET_PATH: '/other' }, 'linux', '/home/test'));
  assert.equal(cacheFile('test:p1', {}, 'linux', '/home/test'), undefined);
});
test('Windows raw and prefixed pipe names map to the same cache file', () => {
  const env = { LOCALAPPDATA: '/state', HERDR_SOCKET_PATH: 'C:\\Herdr.sock' };
  assert.equal(cacheFile('p', env, 'win32'), cacheFile('p', { ...env, HERDR_SOCKET_PATH: '\\\\.\\pipe\\c:\\herdr.sock' }, 'win32'));
});
test('success writes an atomic model lease; orderly cleanup removes it', async t => {
  const env = await scope(t);
  const send = withTitleCache(async () => ({ ok: true }), env);
  const file = cacheFile('test:p1', env)!;
  await send(request(1, 'gpt-test'));
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(record.model, 'gpt-test');
  assert.ok(record.expiresAt > Date.now());
  assert.deepEqual((await fs.readdir(path.dirname(file))).filter(name => name.endsWith('.tmp')), []);
  await send(request(2, null, true));
  await assert.rejects(fs.access(file));
});
test('failed delivery does not publish a new title cache', async t => {
  const env = await scope(t);
  await withTitleCache(async () => ({ ok: false }), env)(request(1, 'gpt-test'));
  await assert.rejects(fs.access(cacheFile('test:p1', env)!));
});
test('old runtime cleanup cannot delete a newer runtime lease', async t => {
  const env = await scope(t);
  const old = withTitleCache(async () => ({ ok: true }), env);
  const current = withTitleCache(async () => ({ ok: true }), env);
  await old(request(1, 'gpt-old'));
  await current(request(3, 'deepseek-new'));
  await old(request(2, 'gpt-old'));
  await old(request(4, null, true));
  assert.equal(JSON.parse(await fs.readFile(cacheFile('test:p1', env)!, 'utf8')).model, 'deepseek-new');
});
test('title hook changes only the title body; Radar can still prepend every spinner frame', async t => {
  const env = await scope(t);
  const old = { XDG_STATE_HOME: process.env.XDG_STATE_HOME, HERDR_SOCKET_PATH: process.env.HERDR_SOCKET_PATH };
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  await withTitleCache(async () => ({ ok: true }), env)(request(1, 'deepseek-v4'));
  assert.equal(title('Pi', 'test:p1'), 'deepseek-v4');
  for (const spinner of ['⣷', '⣯', '⣟', '⡿']) assert.equal(`${spinner} ${title('Pi', 'test:p1')}`, `${spinner} deepseek-v4`);
  assert.equal(title('Other agent task', 'test:p2'), 'Other agent task');
});
test('expired or malformed cache falls back to the original Radar title', async t => {
  const env = await scope(t);
  const old = { XDG_STATE_HOME: process.env.XDG_STATE_HOME, HERDR_SOCKET_PATH: process.env.HERDR_SOCKET_PATH };
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  const file = cacheFile('test:p1', env)!;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ model: 'expired', expiresAt: Date.now() - 1 }));
  assert.equal(title('Pi', 'test:p1'), 'Pi');
  await fs.writeFile(cacheFile('test:p2', env)!, 'invalid json');
  assert.equal(title('Original task', 'test:p2'), 'Original task');
});
