# pi-herdr-model

Show **Pi's selected model identifier and model-family logo** in [Herdr Radar](https://github.com/hhdebb/herdr-radar), instead of a sidebar full of `Pi` labels.

```text
[GPT logo]      gpt-5.6-sol
[DeepSeek logo] deepseek-v4
[Gemini logo]   gemini-3.8-flash
```

Pi remains the actual agent. This package only reports display metadata; it does not replace Herdr's official Pi integration or Radar's state tracking. No Radar fork is needed.

## Requirements

- Pi with the `model_select` extension event and `ctx.mode` (tested with `@earendil-works/pi-coding-agent` 0.99.x).
- Herdr 0.9.3+ and a Pi TUI running inside a Herdr pane.
- Radar with `--display-agent` support and the `$logo` / `$state_*` token layout (tested against the current Radar implementation).
- For vendor icons: Radar's icon font or a compatible patched Nerd Font, and Radar `variant = "font"`. Without the font, Radar can use its text variant; the example row's PUA brand-color rules then do not apply.

## Install

Install the public GitHub package:

```sh
pi install git:github.com/Refueled/pi-herdr-model
```

Then run `/reload` in **each existing Pi session**. New sessions load the extension automatically. No Herdr server or Pi process restart is necessary.

For local development:

```sh
pi install /absolute/path/to/pi-herdr-model
```

### Render the model name without losing Radar's spinner

Reporting the model and vendor is automatic. To render model names while preserving Radar's animated spinner, done tick, blocked pulse, and lifecycle colors, enable the supplied **title render hook** in Radar's own `config.toml` (locate it with `herdr plugin config-dir hhdebb.herdr-radar`):

```toml
render_hook = "/absolute/path/to/pi-herdr-model/radar/model-title.cjs"
```

Use the actual installed package location (`pi list` helps locate package sources). On Windows, use forward slashes or a TOML single-quoted path. If you already use a render hook, compose its exports with this hook rather than replacing it silently.

Radar loads render hooks once per display-daemon start. Restart **only Radar's plugin daemon** once after enabling the hook:

```sh
herdr plugin action invoke hhdebb.herdr-radar.state-stop
herdr plugin action invoke hhdebb.herdr-radar.state-start
```

These plugin actions are separate from Herdr's server. Do **not** run `herdr server stop`; keep Herdr and Pi sessions alive.

Keep your existing Radar sidebar layout and its `$title_working`, `$title_done`, `$title_blocked`, etc. tokens. The hook replaces only the title body with the model ID, and Radar prepends its normal animation/marks. No Pi-specific row is required. [`radar/pi-model-row.toml`](radar/pi-model-row.toml) is an optional example for custom layouts.

**Upgrading from 0.1.0:** remove the package's Pi-specific `rows_by_agent.pi` override to use your usual Radar row again, or change its `$state_*` tokens back to `$title_*` and remove the standalone `$pi_model` cell. That old row displayed static rings instead of Radar's title spinner.

If editing user-owned sidebar tables, keep them outside Radar's managed marker comments and declare each TOML table only once. Validate and live-reload presentation changes with `herdr config check` followed by `herdr server reload-config`. This package never edits either config automatically.

## Behavior

- Reports at TUI startup/reload, model selection/cycling/restore, and agent start.
- Updates the existing pane, never the focused pane of another client.
- Refreshes its metadata lease every 20 seconds; stale metadata expires after 60 seconds.
- Coalesces rapid model changes and retries after transient delivery failures.
- Does nothing in RPC, JSON, or print mode, or outside a Herdr-managed pane.
- Closes sockets/timers and clears only its own metadata/title cache on orderly shutdown/reload.
- Does not change terminal titles, rename panes/tabs, or report agent lifecycle state.

Run `/herdr-model` to refresh the metadata and inspect the last delivery status.

### Published metadata

Source: `pi-herdr-model`; actual agent filter: `pi`.

| Field/token | Example | Purpose |
|---|---|---|
| `display_agent` | `gpt` | Radar's vendor logo selector |
| `$pi_model` | `gpt-5.6-sol` | Selected model ID |
| `$pi_model_provider` | `openai-codex` | Optional provider label |
| `$pi_model_vendor` | `gpt` | Optional vendor label |

This is the **selected** model, not a trace of nested subagents or a virtual model's internal routing. Display text is control-character-sanitized and bounded; very long identifiers are truncated to 160 Unicode codepoints.

### Vendor mapping

The model identifier takes priority over the provider. Supported families: Claude, GPT/ChatGPT/o1/o3/o4, Gemini, DeepSeek, Qwen, Grok, GLM, and Kimi. Namespaced identifiers such as `deepseek/deepseek-v4` are supported.

A small set of single-vendor providers is used as a fallback. Generic OpenAI-compatible endpoints and gateways such as OpenRouter are **not** assumed to serve GPT. Unknown model families retain the Pi logo while displaying their model ID. Logos represent a vendor/family, not a unique logo for every model version.

## Privacy and permissions

No runtime dependencies, subprocesses, telemetry, HTTP requests, prompts, transcripts, credentials, or session-file reads. The extension consumes the selected model's ID/provider and inherited Herdr/state-directory context, then sends bounded JSON-line requests to Herdr's local Unix socket or Windows named pipe.

For Radar's synchronous title hook, successful reports also atomically write a tiny, leased model-only cache under `$XDG_STATE_HOME/pi-herdr-model`, `%LOCALAPPDATA%/pi-herdr-model` on Windows, or `~/.local/state/pi-herdr-model` elsewhere. Filenames hash the socket and pane identity. Caches expire after 60 seconds and are removed on orderly shutdown; leftover files after a crash can be deleted safely. The hook reads only these bounded cache records, never a Pi session file. Missing, expired, or invalid records preserve Radar's original title.

Model IDs and provider labels are visible to Herdr and its connected clients; selected model IDs also reside in this local cache. Like all Pi extensions, this code runs with Pi's OS permissions; review it before installing.

Fonts and vendor artwork are **not distributed** by this package. The optional sidebar example references Radar's existing codepoints. Vendor marks belong to their respective owners.

## Remove

```sh
pi remove git:github.com/Refueled/pi-herdr-model
```

Reload each Pi session, remove the `render_hook` setting (or restore your previous composed hook), and restart only Radar's display daemon to unload it. Restore any optional customized Pi sidebar row. Only this package's metadata/cache is cleared; if a process exits abruptly, its leases expire within 60 seconds.

## Development and publishing

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

Tests cover model mapping, metadata ownership, TUI/headless behavior, reload/shutdown, coalescing, leases, and socket failures. Tests use isolated fake sockets, never a running Herdr server.

The package uses Pi's explicit extension manifest and the `pi-package` keyword. After publishing to npm, it is eligible for [Pi package gallery](https://pi.dev/packages) discovery:

```sh
npm publish --access public
# After npm publication:
pi install npm:pi-herdr-model
```

There are no install/postinstall hooks. The npm files allowlist excludes tests, development dependencies, configs, logs, and local session data. GitHub publication is separate from npm publication.

MIT license.
