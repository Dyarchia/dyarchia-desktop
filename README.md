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


## Install

```bash
pnpm install
pnpm build
pnpm install:plugin
```

`install:plugin` copies the manifest and `dist/` into the shell's plugin directory
(`%APPDATA%/dyarchia/plugins/eforoi` on Windows). Restart the shell afterwards: the
renderer bundle is cached by the `dyarchia-plugin://` protocol and the main module is only
read at startup.


## Driving it without the shell

The orchestration layer runs headless, which is how it is tested:

```bash
pnpm probe catalog
pnpm probe run "anthropic/claude-opus-5@subscription" "openai/gpt-5.6-sol@subscription" "anthropic/claude-opus-5@subscription" "your prompt"
```

The last seat is the analyst. `scripts/electron-stub.mjs` stands in for the two Electron
APIs the plugin uses, so no window is involved.


## Documentation

- [docs/design.md](docs/design.md) — the pipeline, the route adapters, the IPC contract,
  and the measured cost of each route.
