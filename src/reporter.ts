import { modelMetadata, type ModelIdentity } from './model.js';
import type { MetadataRequest, Send } from './transport.js';

export const SOURCE = 'pi-herdr-model';
export const LEASE_MS = 60_000;
export const HEARTBEAT_MS = 20_000;

export class ModelReporter {
  private model: ModelIdentity | undefined;
  private lastDelivered = '';
  private pending = false;
  private forced = false;
  private stopped = false;
  private draining: Promise<void> | undefined;
  private controller = new AbortController();
  private timer: ReturnType<typeof setInterval> | undefined;
  private seq = Date.now() * 1000;
  lastError: string | undefined;

  constructor(private readonly paneId: string, private readonly send: Send) {}

  startHeartbeat(intervalMs = HEARTBEAT_MS): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => { void this.refresh(); }, intervalMs);
    this.timer.unref();
  }
  update(model: ModelIdentity | undefined): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.model = model ? { id: model.id, provider: model.provider } : undefined;
    return this.request(false);
  }
  refresh(): Promise<void> { return this.request(true); }

  private request(force: boolean): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.pending = true;
    this.forced ||= force;
    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = undefined;
        // A notification can arrive between drain completion and this finalizer.
        if (this.pending && !this.stopped) void this.request(false);
      });
    }
    return this.draining;
  }
  private requestFor(clear = false): MetadataRequest {
    const metadata = modelMetadata(clear ? undefined : this.model);
    const seq = ++this.seq;
    return {
      id: `${SOURCE}:${seq}`, method: 'pane.report_metadata',
      params: {
        pane_id: this.paneId, source: SOURCE, agent: 'pi', seq,
        ...(clear ? { clear_display_agent: true } : { display_agent: metadata.display_agent }),
        tokens: metadata.tokens, ttl_ms: LEASE_MS,
      },
    };
  }
  private async drain(): Promise<void> {
    while (this.pending && !this.stopped) {
      this.pending = false;
      const force = this.forced;
      this.forced = false;
      const signature = JSON.stringify(modelMetadata(this.model));
      if (!force && signature === this.lastDelivered) continue;
      try {
        const result = await this.send(this.requestFor(), this.controller.signal);
        this.lastError = result.ok ? undefined : result.error ?? 'Delivery failed';
        if (result.ok) this.lastDelivered = signature;
      } catch { this.lastError = 'Delivery failed'; }
    }
  }
  // Clear only our source's fields; Radar and the official Pi integration are untouched.
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.pending = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller.abort();
    await this.draining;
    try { await this.send(this.requestFor(true)); } catch { /* Lease expires if Herdr is gone. */ }
  }
}
