'use strict';

// Radar's supported synchronous title hook. Radar still adds its spinner,
// done tick, blocked pulse, indentation, and lifecycle colors afterward.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const recent = new Map();

function cacheFile(paneId, env = process.env, platform = process.platform, home = os.homedir()) {
  if (!env.HERDR_SOCKET_PATH || !paneId) return undefined;
  const root = env.XDG_STATE_HOME || (platform === 'win32'
    ? (env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'))
    : path.join(home, '.local', 'state'));
  const socket = platform === 'win32'
    ? env.HERDR_SOCKET_PATH.replace(/^\\\\\.\\pipe\\/, '').toLowerCase()
    : env.HERDR_SOCKET_PATH;
  const key = createHash('sha256').update(socket + '\0' + paneId).digest('hex');
  return path.join(root, 'pi-herdr-model', key + '.json');
}
function title(text, paneId) {
  const file = cacheFile(paneId);
  if (!file) return text;
  const now = Date.now();
  let record = recent.get(file);
  if (!record || now - record.readAt >= 250) {
    record = { readAt: now, data: undefined };
    try {
      if (fs.statSync(file).size <= 8192) record.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch { /* Missing, partially written, or invalid: keep Radar's original title. */ }
    // Bound memory even if a long-lived Radar sees thousands of old pane IDs.
    if (recent.size >= 512) recent.delete(recent.keys().next().value);
    recent.set(file, record);
  }
  const data = record.data;
  if (!data || typeof data.model !== 'string' || !Number.isFinite(data.expiresAt) || data.expiresAt <= now) return text;
  const model = Array.from(data.model.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim()).slice(0, 160).join('');
  return model || text;
}
module.exports = { title, cacheFile };
