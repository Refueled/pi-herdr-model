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

### Render the model name in Radar

Reporting the model and vendor is automatic. Rendering the custom model text requires a Pi-specific sidebar row in Herdr's config:

- Windows: `%APPDATA%\herdr\config.toml`
- Linux/macOS: `~/.config/herdr/config.toml`

Merge the `pi = [...]` entry from [`radar/pi-model-row.toml`](radar/pi-model-row.toml) into your **existing** `[ui.sidebar.agents.rows_by_agent]` table. Declare that table only once.

**Important:** Radar owns tables inside its `# >>> herdr-radar sidebar block` markers. Its next configure action replaces those tables. To maintain custom layouts, move the sidebar tables outside those markers (or remove just the sidebar marker comments). Radar explicitly preserves user-owned tables. Back up your config first; this package never edits it automatically.

The supplied row keeps Radar's grouping, model-vendor logos, and held lifecycle marks, and replaces the session-title text with `$pi_model`. Working uses Radar's ring mark rather than its animated title spinner. Existing non-Pi rows stay unchanged. If you prefer your own theme colors, adapt your existing Pi row: replace `$title_*` with `$state_*`, preserve their styling, and append `$pi_model` to that row.

Validate and apply presentation changes without stopping any panes:

```sh
herdr config check
herdr server reload-config
```

Do **not** use `herdr server stop` for this setup.

## Behavior

- Reports at TUI startup/reload, model selection/cycling/restore, and agent start.
- Updates the existing pane, never the focused pane of another client.
- Refreshes its metadata lease every 20 seconds; stale metadata expires after 60 seconds.
- Coalesces rapid model changes and retries after transient delivery failures.
- Does nothing in RPC, JSON, or print mode, or outside a Herdr-managed pane.
- Closes sockets/timers and clears only its own metadata on orderly shutdown/reload.
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

No runtime dependencies, subprocesses, telemetry, HTTP requests, prompts, transcripts, credentials, or session-file reads. The extension consumes only the selected model's ID/provider and inherited `HERDR_*` connection context, then sends bounded JSON-line requests to Herdr's local Unix socket or Windows named pipe.

Model IDs and provider labels are visible to Herdr and its connected clients. Like all Pi extensions, this code runs with Pi's OS permissions; review it before installing.

Fonts and vendor artwork are **not distributed** by this package. The optional sidebar example references Radar's existing codepoints. Vendor marks belong to their respective owners.

## Remove

```sh
pi remove git:github.com/Refueled/pi-herdr-model
```

Reload each Pi session and restore the prior Pi sidebar row (or remove your `rows_by_agent.pi` override). Only this package's metadata is cleared; if a process exits abruptly, its lease expires within 60 seconds.

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
