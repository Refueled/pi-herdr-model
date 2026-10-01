import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayText, modelMetadata, vendorFor } from '../src/model.js';

const cases = [
  ['gpt-5.6-sol', 'openai-codex', 'gpt'], ['o3', 'openrouter', 'gpt'],
  ['openai/gpt-oss-120b', 'custom', 'gpt'], ['anthropic/claude-sonnet-4', 'openrouter', 'claude'],
  ['deepseek/deepseek-v4', 'openai', 'deepseek'], ['gemini-3.8-flash', 'proxy', 'gemini'],
  ['Qwen/Qwen2.5-Coder-32B', 'openrouter', 'qwen'], ['grok-4', 'custom', 'grok'],
  ['z-ai/glm-5', 'openai-compatible', 'glm'], ['moonshotai/kimi-k2', 'openrouter', 'kimi'],
  ['custom-alias', 'anthropic', 'claude'], ['custom-alias', 'google-vertex', 'gemini'],
  ['mystery-model', 'openrouter', 'pi'], ['mystery-model', 'openai', 'pi'],
  ['notgpt-notgemini', 'custom', 'pi'],
] as const;
for (const [id, provider, expected] of cases) test(`${id} via ${provider} → ${expected}`, () => {
  assert.equal(vendorFor({ id, provider }), expected);
});
test('metadata keeps the true agent Pi and reports a separate display vendor', () => {
  const data = modelMetadata({ id: 'gpt-5.6-sol', provider: 'openai-codex' });
  assert.equal(data.agent, 'pi');
  assert.equal(data.display_agent, 'gpt');
  assert.deepEqual(data.tokens, { pi_model: 'gpt-5.6-sol', pi_model_provider: 'openai-codex', pi_model_vendor: 'gpt' });
});
test('missing model clears only package-owned tokens', () => {
  assert.deepEqual(modelMetadata(undefined), {
    agent: 'pi', display_agent: 'pi', tokens: { pi_model: null, pi_model_provider: null, pi_model_vendor: null },
  });
});
test('display labels remove terminal controls and respect Unicode boundaries', () => {
  assert.equal(displayText(' hello\nworld\u001b\u009b '), 'hello world');
  assert.equal(displayText('😀'.repeat(200)).length, 320);
  assert.equal(modelMetadata({ id: ' \u0000 ', provider: 'google' }).tokens.pi_model, null);
});
