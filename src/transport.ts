import net from 'node:net';

export interface HerdrEnvironment { paneId: string; endpoint: string }
export function herdrEnvironment(env: NodeJS.ProcessEnv, platform = process.platform): HerdrEnvironment | undefined {
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || !env.HERDR_SOCKET_PATH) return undefined;
  const socket = env.HERDR_SOCKET_PATH;
  const endpoint = platform === 'win32' && !socket.startsWith('\\\\.\\pipe\\')
    ? `\\\\.\\pipe\\${socket}` : socket;
  return { paneId: env.HERDR_PANE_ID, endpoint };
}
export interface MetadataRequest {
  id: string;
  method: 'pane.report_metadata';
  params: {
    pane_id: string; source: string; agent: 'pi'; seq: number;
    display_agent?: string; clear_display_agent?: boolean;
    tokens: Record<string, string | null>; ttl_ms: number;
  };
}
export interface Delivery { ok: boolean; error?: string }
export type Send = (request: MetadataRequest, signal?: AbortSignal) => Promise<Delivery>;

// One bounded, newline-framed request. Never spawns a process or connects via TCP.
export function socketSender(endpoint: string, timeoutMs = 750): Send {
  return (request, signal) => new Promise(resolve => {
    if (signal?.aborted) { resolve({ ok: false, error: 'cancelled' }); return; }
    let done = false;
    let reply = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = net.createConnection({ path: endpoint });
    const finish = (result: Delivery) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket.destroy();
      resolve(result);
    };
    const abort = () => finish({ ok: false, error: 'cancelled' });
    signal?.addEventListener('abort', abort, { once: true });
    socket.setEncoding('utf8');
    socket.on('error', () => finish({ ok: false, error: 'Herdr socket unavailable' }));
    socket.on('connect', () => socket.write(JSON.stringify(request) + '\n'));
    socket.on('data', chunk => {
      reply += chunk;
      if (reply.length > 64 * 1024) { finish({ ok: false, error: 'Herdr response too large' }); return; }
      const end = reply.indexOf('\n');
      if (end < 0) return;
      try {
        const data = JSON.parse(reply.slice(0, end));
        if (data.id !== request.id || data.error || !Object.hasOwn(data, 'result')) {
          finish({ ok: false, error: 'Herdr rejected model metadata' });
        } else finish({ ok: true });
      } catch { finish({ ok: false, error: 'Invalid Herdr response' }); }
    });
    socket.on('end', () => finish({ ok: false, error: 'Herdr closed without a response' }));
    timer = setTimeout(() => finish({ ok: false, error: 'Herdr request timed out' }), timeoutMs);
  });
}
