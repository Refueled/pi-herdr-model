import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelReporter, LEASE_MS, SOURCE } from '../src/reporter.js';
import type { MetadataRequest, Send } from '../src/transport.js';

const model = { id: 'gpt-5.6-sol', provider: 'openai-codex' };
test('deduplicates successful updates; heartbeat renews the lease', async () => {
  const requests: MetadataRequest[] = [];
  const reporter = new ModelReporter('pane:test', async request => { requests.push(request); return { ok: true }; });
  await reporter.update(model);
  await reporter.update(model);
  assert.equal(requests.length, 1);
  await reporter.refresh();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].params.ttl_ms, LEASE_MS);
  assert.equal(requests[1].params.source, SOURCE);
  assert.ok(requests[1].params.seq > requests[0].params.seq);
  await reporter.stop();
  assert.equal(requests.at(-1)!.params.clear_display_agent, true);
  assert.deepEqual(Object.values(requests.at(-1)!.params.tokens), [null, null, null]);
  await reporter.update(model);
  await reporter.stop();
  assert.equal(requests.length, 3);
});
test('coalesces rapid model changes and delivers the latest selection last', async () => {
  const requests: MetadataRequest[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const reporter = new ModelReporter('pane:test', async request => {
    requests.push(request); if (requests.length === 1) await gate; return { ok: true };
  });
  const initial = reporter.update(model);
  void reporter.update({ id: 'claude-sonnet-4', provider: 'anthropic' });
  void reporter.update({ id: 'deepseek-v4', provider: 'custom' });
  release();
  await initial;
  assert.equal(requests.length, 2);
  assert.equal(requests[1].params.display_agent, 'deepseek');
  assert.equal(requests[1].params.tokens.pi_model, 'deepseek-v4');
  await reporter.stop();
});
test('a failed request is retried rather than cached as delivered', async () => {
  let count = 0;
  const send: Send = async () => (++count === 1 ? { ok: false, error: 'offline' } : { ok: true });
  const reporter = new ModelReporter('pane:test', send);
  await reporter.update(model);
  assert.equal(reporter.lastError, 'offline');
  await reporter.update(model);
  assert.equal(count, 2);
  assert.equal(reporter.lastError, undefined);
  await reporter.stop();
});
test('transport exceptions do not fail Pi lifecycle handlers', async () => {
  const reporter = new ModelReporter('pane:test', async () => { throw new Error('offline'); });
  await reporter.update(model);
  assert.equal(reporter.lastError, 'Delivery failed');
  await reporter.stop();
});
test('shutdown cancels the pending send before issuing source-owned cleanup', async () => {
  const requests: MetadataRequest[] = [];
  const reporter = new ModelReporter('pane:test', (request, signal) => {
    requests.push(request);
    if (!signal) return Promise.resolve({ ok: true });
    return new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: false, error: 'cancelled' }), { once: true }));
  });
  void reporter.update(model);
  await reporter.stop();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].params.clear_display_agent, true);
});
