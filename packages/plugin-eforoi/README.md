# dyarchia-eforoi

A panel of two to five models answers the same prompt, an analyst compares the answers
without merging them, and the final reply is written from that comparison. A plugin for
dyarchia-desktop, built outside its workspace.

The Spartan ephors were five magistrates whose job was to watch the king. The panel caps at
five for the same reason: past that, more members buy agreement, not scrutiny.


## What it does

```text
   prompt
     |
     +--> member 1 ---+
     +--> member 2 ---+---> analyst (JSON) ---> analyst (prose) ---> answer
     +--> member N ---+
```

The middle step is the point. The analyst does not blend the answers into an average; it
emits a structured comparison — consensus, contradictions, partial coverage, unique
insights, blind spots — and the final answer is written from that. Agreement across
independent members is evidence; disagreement is surfaced rather than smoothed away.


Every member and the analyst can search and fetch the web, always. Ask three models for a
version number and they will search, land on different pages and disagree — which is the
disagreement the analyst exists to surface.


## Two ways to reach a model

Every model in the catalogue offers up to two routes, chosen per seat from the side menu:

```text
Mode           How the call is made                        Who pays
------------   -----------------------------------------   ------------------------
Subscription   the provider's CLI, already signed in        your plan's quota
API            HTTPS with your own key                     per token, metered
```

Subscription mode spawns the agent CLI you already use — `claude`, `codex`, `opencode` —
in headless mode. No key is needed and nothing is billed per token; the call consumes plan
quota. API mode calls the provider directly with a key held in the OS keychain.

A mode that cannot work is shown greyed with the reason: no CLI on PATH, no key stored, or
the model not offered on that route.


## One prompt, one run

A run is one-shot. Every model is asked once, the analyst — the seat the panel labels
**Dogma**, δόγμα, the resolution a council issues — compares what came back and writes from
the comparison, and nothing carries to the next Run. No member ever sees another member's
answer, which is what keeps the panel worth polling.

Follow-up turns existed and were removed. A panel is not a chat: a follow-up is a new
question, and a new question deserves a fresh panel. `Clear` empties the board.


## Presets and effort

A seat is a model, a route, and an effort level. The model button opens the catalogue; the
route button opens both the route and the effort levels that route actually offers for that
model — codex publishes them per model, so `gpt-5.6-sol` shows an `ultra` that `gpt-5.5` does
not.

```text
Route       Effort reaches the model as
---------   ---------------------------------------
claude      --effort <level>
codex       -c model_reasoning_effort=<level>
opencode    --variant <level>
anthropic   output_config.effort
openai      reasoning.effort
```

`Save` names the current arrangement; `Presets` loads or deletes one, or starts a new
arrangement. Effort is saved with the seat.

Presets live in a JSON file next to the plugin's other state, outside the repository:

```text
Windows   %APPDATA%\dyarchia\eforoi\panels.json
macOS     ~/Library/Application Support/dyarchia/eforoi/panels.json
Linux     ~/.config/dyarchia/eforoi/panels.json
```

The `Save` button's tooltip shows the resolved path on the machine it is running on.


## Install

This is a workspace package. From the repository root:

```bash
pnpm install
pnpm --filter @dyarchia/plugin-eforoi build
```

In development that is enough: the shell discovers plugins under `packages/` directly. For
the packaged app, `node scripts/install-plugins.mjs` copies the manifest and `dist/` into
`%APPDATA%/dyarchia/plugins/eforoi`.

Restart the shell afterwards rather than reloading the window: the renderer bundle is
cached by the `dyarchia-plugin://` protocol and the main module is only read at startup.


## Driving it without the shell

Both halves can be exercised with no window. The orchestration layer runs headless:

```bash
pnpm --filter @dyarchia/plugin-eforoi probe catalog
pnpm --filter @dyarchia/plugin-eforoi probe run "anthropic/claude-opus-5@subscription" "anthropic/claude-sonnet-5@subscription" "anthropic/claude-opus-5@subscription" "your prompt"
```

The last seat is the analyst. `scripts/electron-stub.mjs` stands in for the two Electron
APIs the plugin uses.

The panel itself is checked by mounting the built bundle against a fake context.
`scripts/panel-harness.html` supplies a catalogue, a canned set of run events and answers
carrying the markdown that matters — fenced code, tables, nested lists — so the layout,
both themes and the code rendering can be inspected in an ordinary browser:

```bash
pnpm --filter @dyarchia/plugin-eforoi build
py -m http.server 8731 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8731/packages/plugin-eforoi/scripts/panel-harness.html` from
the repository root. Do not try to stub `window.dyarchia` inside the real shell instead:
that object comes from `contextBridge` and its properties are not writable, so the
assignment fails silently, the real IPC call goes through, and a modal dialog opens on the
operator's screen.


## Documentation

- [docs/design.md](docs/design.md) — the pipeline, the route adapters, the IPC contract,
  and the measured cost of each route.
