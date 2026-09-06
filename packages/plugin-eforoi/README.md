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


## Conversation

Runs are not one-shot. Each panel member keeps a thread of its own, and so does the analyst —
the seat the panel labels **Dogma**, δόγμα, the resolution a council issues. So a follow-up
like "which of the three you just named is hardest?" works, and no member ever sees another
member's answers, which is what keeps the panel worth polling. Ten turns per conversation;
`New` starts over.


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

The orchestration layer runs headless, which is how it is tested:

```bash
pnpm --filter @dyarchia/plugin-eforoi probe catalog
pnpm probe run "anthropic/claude-opus-5@subscription" "openai/gpt-5.6-sol@subscription" "anthropic/claude-opus-5@subscription" "your prompt || a follow-up that depends on the first"
```

The last seat is the analyst, and `||` splits the prompt into consecutive turns of one
conversation, which is how the threading is tested. `scripts/electron-stub.mjs` stands in for
the two Electron APIs the plugin uses, so no window is involved.


## Documentation

- [docs/design.md](docs/design.md) — the pipeline, the route adapters, the IPC contract,
  and the measured cost of each route.
