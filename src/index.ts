import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { modelMetadata } from './model.js';
import { ModelReporter } from './reporter.js';
import { herdrEnvironment, socketSender } from './transport.js';

/** Display-only integration. The official Herdr/Pi state reporter remains authoritative. */
export default function herdrModel(pi: ExtensionAPI): void {
  let reporter: ModelReporter | undefined;
  const publish = (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui' || !reporter) return;
    return reporter.update(ctx.model);
  };

  pi.on('session_start', async (_event, ctx) => {
    if (ctx.mode !== 'tui') return;
    const env = herdrEnvironment(process.env);
    if (!env) return;
    if (reporter) await reporter.stop();
    reporter = new ModelReporter(env.paneId, socketSender(env.endpoint));
    await reporter.update(ctx.model);
    reporter.startHeartbeat();
  });
  pi.on('model_select', async (event, ctx) => {
    if (ctx.mode === 'tui' && reporter) await reporter.update(event.model);
  });
  // Reconcile changes made by other extensions; session_start handles restores/branches.
  pi.on('agent_start', async (_event, ctx) => { await publish(ctx); });
  pi.on('session_shutdown', async () => {
    const current = reporter;
    reporter = undefined;
    await current?.stop();
  });

  pi.registerCommand('herdr-model', {
    description: 'Refresh Herdr model metadata and show integration status',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui' || !reporter) {
        if (ctx.hasUI) ctx.ui.notify('Model reporting is active only in a Herdr-managed Pi TUI.', 'info');
        return;
      }
      await reporter.update(ctx.model);
      await reporter.refresh();
      const metadata = modelMetadata(ctx.model);
      ctx.ui.notify(reporter.lastError
        ? `Herdr model: ${reporter.lastError}. Will retry automatically.`
        : `Herdr model: ${metadata.tokens.pi_model ?? 'none'}; logo: ${metadata.display_agent}.`,
      reporter.lastError ? 'warning' : 'info');
    },
  });
}
