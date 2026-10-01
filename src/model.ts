export type Vendor = 'claude' | 'gpt' | 'gemini' | 'deepseek' | 'qwen' | 'grok' | 'glm' | 'kimi' | 'pi';
export interface ModelIdentity { id: string; provider: string }

// Prefer model family over transport provider: gateways serve multiple vendors.
const families: ReadonlyArray<readonly [Vendor, RegExp]> = [
  ['claude', /(?:^|[/:\s_-])claude(?=$|[/:\s_.-]|\d)/i],
  ['deepseek', /(?:^|[/:\s_-])deepseek(?=$|[/:\s_.-]|\d)/i],
  ['gemini', /(?:^|[/:\s_-])gemini(?=$|[/:\s_.-]|\d)/i],
  ['qwen', /(?:^|[/:\s_-])qwen(?=$|[/:\s_.-]|\d)/i],
  ['grok', /(?:^|[/:\s_-])grok(?=$|[/:\s_.-]|\d)/i],
  ['glm', /(?:^|[/:\s_-])glm(?=$|[/:\s_.-]|\d)/i],
  ['kimi', /(?:^|[/:\s_-])kimi(?=$|[/:\s_.-]|\d)/i],
  ['gpt', /(?:^|[/:\s_-])(?:gpt|chatgpt|o[134])(?=$|[/:\s_.-]|\d)/i],
];
const providers: Readonly<Record<string, Vendor>> = {
  anthropic: 'claude', google: 'gemini', 'google-vertex': 'gemini',
  deepseek: 'deepseek', xai: 'grok', 'z-ai': 'glm', zai: 'glm',
  moonshot: 'kimi', 'moonshotai': 'kimi',
};
export function vendorFor(model: ModelIdentity): Vendor {
  for (const [vendor, pattern] of families) if (pattern.test(model.id)) return vendor;
  // Deliberately no openai/openrouter/custom fallback: these can serve any vendor.
  return providers[model.provider.toLowerCase()] ?? 'pi';
}
export function displayText(text: string, maxCodepoints = 160): string {
  return Array.from(text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()).slice(0, maxCodepoints).join('');
}
export interface ModelMetadata {
  agent: 'pi';
  display_agent: Vendor;
  tokens: Record<string, string | null>;
}
export function modelMetadata(model: ModelIdentity | undefined): ModelMetadata {
  const id = model ? displayText(model.id) : '';
  const vendor = model && id ? vendorFor(model) : 'pi';
  return {
    agent: 'pi', display_agent: vendor,
    tokens: {
      pi_model: id || null,
      pi_model_provider: model && id ? displayText(model.provider, 80) : null,
      pi_model_vendor: id ? vendor : null,
    },
  };
}
