import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { herdrEnvironment, socketSender, type MetadataRequest } from '../src/transport.js';

const request: MetadataRequest = {
  id: 'test:1', method: 'pane.report_metadata',
  params: { pane_id: 'test:p1', source: 'pi-herdr-model', agent: 'pi', seq: 1, display_agent: 'gpt', tokens: { pi_model: 'gpt-test' }, ttl_ms: 60_000 },
};
async function server(t: TestContext, handler: (socket: net.Socket) => void): Promise<string> {
  const name = `pi-herdr-model-test-${randomUUID()}`;
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), name + '.sock');
  const clients = new Set<net.Socket>();
  const s = net.createServer(socket => { clients.add(socket); socket.on('close', () => clients.delete(socket)); handler(socket); });
  await new Promise<void>((resolve, reject) => { s.once('error', reject); s.listen(endpoint, resolve); });
  t.after(async () => { for (const socket of clients) socket.destroy(); await new Promise<void>(resolve => s.close(() => resolve())); });
  return endpoint;
}
test('environment is inert without all three Herdr fields', () => {
  assert.equal(herdrEnvironment({}), undefined);
  assert.equal(herdrEnvironment({ HERDR_ENV: '1', HERDR_PANE_ID: 'p' }), undefined);
  assert.equal(herdrEnvironment({ HERDR_ENV: '0', HERDR_PANE_ID: 'p', HERDR_SOCKET_PATH: '/socket' }), undefined);
});
test('Windows pipe endpoints are prefixed exactly once', () => {
  assert.equal(herdrEnvironment({ HERDR_ENV: '1', HERDR_PANE_ID: 'p', HERDR_SOCKET_PATH: 'C:\\herdr.sock' }, 'win32')?.endpoint, '\\\\.\\pipe\\C:\\herdr.sock');
  const pipe = '\\\\.\\pipe\\herdr';
  assert.equal(herdrEnvironment({ HERDR_ENV: '1', HERDR_PANE_ID: 'p', HERDR_SOCKET_PATH: pipe }, 'win32')?.endpoint, pipe);
});
test('one JSON-line request accepts a fragmented matching response', async t => {
  let sent: unknown;
  const endpoint = await server(t, socket => socket.once('data', chunk => {
    sent = JSON.parse(chunk.toString());
    socket.write('{"id":"test:1",');
    setTimeout(() => socket.end('"result":{"ok":true}}\n'), 10);
  }));
  assert.deepEqual(await socketSender(endpoint)(request), { ok: true });
  assert.deepEqual(sent, request);
});
for (const reply of [
  '{"id":"test:1","error":{"code":"rejected"}}\n',
  '{"id":"wrong","result":{}}\n', 'not json\n', '{"id":"test:1"}\n',
]) test('rejects malformed/error/mismatched reply: ' + reply.trim(), async t => {
  const endpoint = await server(t, socket => socket.once('data', () => socket.end(reply)));
  assert.equal((await socketSender(endpoint)(request)).ok, false);
});
test('silent sockets time out and are released', async t => {
  const endpoint = await server(t, () => {});
  const result = await socketSender(endpoint, 30)(request);
  assert.equal(result.ok, false);
  assert.match(result.error!, /timed out/);
});
test('reload cancellation aborts an in-flight socket', async t => {
  const endpoint = await server(t, () => {});
  const controller = new AbortController();
  const promise = socketSender(endpoint)(request, controller.signal);
  controller.abort();
  assert.deepEqual(await promise, { ok: false, error: 'cancelled' });
});
test('unavailable socket fails quietly', async () => {
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\missing-${randomUUID()}` : path.join(os.tmpdir(), 'missing-' + randomUUID());
  assert.equal((await socketSender(endpoint)(request)).ok, false);
});
