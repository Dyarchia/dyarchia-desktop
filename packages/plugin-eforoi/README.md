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

The analyst does both in a single call, emitting the comparison as JSON, a marker, then the
answer. It used to be two calls, which made it the slower half of a run and left the writer
working from the JSON alone, having never read a word any member wrote.

It reads every surviving answer, so it is routinely the slowest seat even on a fast model —
three members producing 4891, 427 and 3849 tokens hand it over nine thousand tokens of input.
It carries its own 300 second deadline covering both attempts, the card counts seconds while
it runs, and a reply that had to be retried says `attempt 2`.

Follow-up turns existed and were removed. A panel is not a chat: a follow-up is a new
question, and a new question deserves a fresh panel. `Clear` empties the board.


## Web search

Every member searches, always. The analyst never does — it compares what it is given.

What is capped is how much they search. Three identical Haiku seats answering the same
question took 53.8s, 67.5s and 107.3s, having searched 6, 8 and 15 times: nothing bounded
the agent loop, so a run lasted as long as whichever seat was most curious. The panel prompt
now states a budget of three searches, and each member carries a 120 second deadline as a
backstop — a seat that overruns reports that it did not answer in time and does not vote.

```text
                  before             after
--------------   ----------------   ----------------
searches         6 / 8 / 15         3 / 3 / 3
members          53.8/67.5/107.3s   38.7/42.2/33.6s
shadow cost      $0.6657            $0.3099
```

There is no switch to turn searching off. There was one briefly; it reached four routes of
five, because opencode has no flag for web access, and a panel that cannot look anything up
is a panel of models guessing. Each card reports its own search count beside its time: `3 web` when the route reported
three, `0 web` when it reported none, and `web ?` when the route does not report tool use at
all. opencode is the one that cannot be counted, and it says so rather than showing a zero
it cannot stand behind.


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
