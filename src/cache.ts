import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { cacheFile } from '../radar/model-title.cjs';
import type { MetadataRequest, Send } from './transport.js';

interface Record { model: string; expiresAt: number; seq: number; owner: string }
/** Couple a local title lease to successfully delivered model metadata. */
export function withTitleCache(send: Send, env: NodeJS.ProcessEnv = process.env): Send {
  const owner = randomUUID();
  // Capture connection scope, rather than a later mutation of process.env.
  const scope = {
    HERDR_SOCKET_PATH: env.HERDR_SOCKET_PATH,
    XDG_STATE_HOME: env.XDG_STATE_HOME,
    LOCALAPPDATA: env.LOCALAPPDATA,
  };
  return async (request, signal) => {
    const result = await send(request, signal);
    if (result.ok || request.params.clear_display_agent) {
      try { await writeCache(request, owner, scope); } catch { /* Metadata reporting must survive cache failures. */ }
    }
    return result;
  };
}
async function writeCache(request: MetadataRequest, owner: string, env: NodeJS.ProcessEnv): Promise<void> {
  const file = cacheFile(request.params.pane_id, env);
  if (!file) return;
  let previous: Record | undefined;
  try { previous = JSON.parse(await fs.readFile(file, 'utf8')); } catch { /* No prior lease. */ }
  const model = request.params.tokens.pi_model;
  if (request.params.clear_display_agent || !model) {
    if (previous?.owner === owner) await fs.unlink(file).catch(() => {});
    return;
  }
  if (previous && previous.seq > request.params.seq) return;
  const data: Record = { model, expiresAt: Date.now() + request.params.ttl_ms, seq: request.params.seq, owner };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, JSON.stringify(data) + '\n', { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.unlink(temporary).catch(() => {}); }
}
