import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import extension from '../src/index.js';
import type { MetadataRequest } from '../src/transport.js';

function harness() {
  const handlers = new Map<string, (event: any, ctx: any) => unknown>();
  const commands = new Map<string, any>();
  const pi = {
    on: (name: string, handler: (event: any, ctx: any) => unknown) => { handlers.set(name, handler); return () => {}; },
    registerCommand: (name: string, command: any) => { commands.set(name, command); },
  } as unknown as ExtensionAPI;
  extension(pi);
  return { handlers, commands };
}
test('factory only registers capabilities; headless events do not connect', async () => {
  const { handlers, commands } = harness();
  assert.ok(commands.has('herdr-model'));
  for (const mode of ['rpc', 'json', 'print']) {
    await handlers.get('session_start')!({}, { mode });
    await handlers.get('model_select')!({ model: { id: 'gpt-test', provider: 'custom' } }, { mode });
  }
  await handlers.get('session_shutdown')!({}, {});
});
test('TUI reports startup and model changes without reporting agent state', async t => {
  const name = 'pi-herdr-model-extension-test-' + randomUUID();
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), name + '.sock');
  const requests: MetadataRequest[] = [];
  const server = net.createServer(socket => {
    socket.once('data', chunk => {
      const request = JSON.parse(chunk.toString()); requests.push(request);
      socket.end(JSON.stringify({ id: request.id, result: { status: 'applied' } }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(endpoint, resolve));
  const state = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-herdr-model-state-'));
  const old = Object.fromEntries(['HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_SOCKET_PATH', 'XDG_STATE_HOME'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { HERDR_ENV: '1', HERDR_PANE_ID: 'test:p1', HERDR_SOCKET_PATH: endpoint, XDG_STATE_HOME: state });
  const { handlers } = harness();
  t.after(async () => {
    await handlers.get('session_shutdown')!({}, {});
    for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>(resolve => server.close(() => resolve()));
    await fs.rm(state, { recursive: true, force: true });
  });
  const ctx = { mode: 'tui', model: { id: 'gpt-5.6-sol', provider: 'custom' } };
  await handlers.get('session_start')!({}, ctx);
  assert.equal(requests[0].params.display_agent, 'gpt');
  await handlers.get('model_select')!({ model: { id: 'deepseek-v4', provider: 'openai' } }, ctx);
  assert.equal(requests[1].params.display_agent, 'deepseek');
  assert.equal(requests[1].params.tokens.pi_model, 'deepseek-v4');
  assert.ok(requests.every(request => request.method === 'pane.report_metadata' && request.params.agent === 'pi'));
  assert.ok(requests.every(request => !('state' in request.params) && !('title' in request.params)));
});
