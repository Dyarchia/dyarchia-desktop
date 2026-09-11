# eforoi

Two to five models answer the same prompt, an analyst compares the answers without merging
them, and the final reply is written from that comparison.

The Spartan ephors were five magistrates whose job was to watch the king. The panel caps at
five for the same reason: past that, more members buy agreement, not scrutiny.

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

```text
Mode           How the call is made                        Who pays
------------   -----------------------------------------   ------------------------
Subscription   the provider's CLI, already signed in        your plan's quota
API            HTTPS with your own key                     per token, metered
```

Subscription spawns the agent CLI you already use — `claude`, `codex`, `opencode` — in
headless mode. API calls the provider directly with a key held in the OS keychain. A mode
that cannot work is shown greyed with the reason: no CLI on PATH, no key stored, or the
model not offered on that route.

**The catalogue is discovered, not declared.** Routes are probed and models are read from
what is installed, so a model that appears in your CLI appears here. A seat whose model has
gone is kept and named rather than dropped in silence.


## One prompt, one run

A run is one-shot. Every model is asked once, the analyst — the seat labelled **Dogma**,
δόγμα, the resolution a council issues — compares what came back and writes from it, and
nothing carries to the next Run. No member ever sees another member's answer. `Clear`
empties the board; there is no conversation to forget.

Members run in parallel, so the panel stage costs whatever the slowest member costs. **The
analyst then runs twice, sequentially** — once for the comparison JSON, once for the prose
— after every member has finished. A slow model in the Dogma seat is paid for twice and
overlaps with nothing, which is the usual reason a run takes far longer than its slowest
member.

Every member and the analyst can search and fetch the web, always. Ask three models for a
version number and they will search, land on different pages and disagree, which is the
disagreement the analyst exists to surface.

**A panel run leaves nothing in your session history.** `claude -p` persists every headless
run as a full transcript and no flag suppresses it, so four seats would put four rows into
your resume picker, all titled with the same prompt. Each stream-json event carries
`session_id` and the transcript is named after it, so the plugin deletes the file once the
child exits — on the failure and cancellation paths too. Codex runs `--ephemeral`; opencode
has no equivalent handle and still writes.

```text
Route       Writes to                                  Still does
---------   ----------------------------------------   ----------
codex       ~/.codex/sessions/<date>/rollout-*.jsonl   no
claude      ~/.claude/projects/<scratch-slug>/         no
opencode    ~/.local/share/opencode/storage            yes
```


## Isolation from your own configuration

A CLI agent invoked as an inference endpoint otherwise loads everything it normally loads:
your memory files, your skills, your MCP servers, your hooks. The first working run
answered an English prompt in Spanish, because the operator's global `CLAUDE.md` sets
Spanish. Panel members must be comparable to each other and stable across runs, and neither
holds if each inherits an environment.

```text
Route       Flag                                  What it drops
---------   -----------------------------------   -------------------------------------
claude      --safe-mode --setting-sources ""      CLAUDE.md, skills, plugins, hooks, MCP
claude      --disallowed-tools "Agent Task …"     delegating to subagents
codex       --ignore-user-config --ignore-rules   config.toml, execpolicy rules
opencode    --pure                                external plugins
```

`--safe-mode` is the right instrument because it keeps authentication working. The adjacent
`--bare` also strips context but forces API-key auth, which would silently move a
Subscription seat onto metered billing — the exact thing the mode exists to avoid.

Every child also runs in an empty scratch directory under the plugin's own `userData`, so
no project file is discovered and no repository is inherited, and `ANTHROPIC_API_KEY`,
`ANTHROPIC_AUTH_TOKEN` and `OPENAI_API_KEY` are stripped from the child environment so a
key exported in the shell cannot quietly convert a plan call into a billed one.


## What a route costs

Measured with a prompt asking for a single word, so the numbers are almost entirely fixed
overhead rather than work.

```text
Route          Context prefix   Notional cost   Actually billed
------------   --------------   -------------   ----------------------
claude -p         1,348 tokens   $0.0025        plan quota
codex exec      ~15,600 tokens   not reported   plan quota
opencode run     ~8,100 tokens   $0.025         plan quota
```

Driving an agent CLI as an inference endpoint means paying for whatever it puts in front of
your prompt, and on the claude route that started near 48,600 tokens a call. Replacing the
system prompt barely dented it — 47,473 against 48,631 — because the weight is tool
definitions, not prose. **Denying the tools is what removes them:** `--allowed-tools`
governs what may be executed, while a denied tool is dropped from the context altogether.

```text
Denied on the claude route                    Prefix   Cost per call
-------------------------------------------   ------   -------------
nothing (allowed-tools alone)                 48,600   $0.2900
Agent, Task, ToolSearch                       36,819   $0.0098
the whole editing and orchestration surface    1,348   $0.0025
```

Thirty-six times less context for the same answer, and it matters beyond arithmetic: a
member carrying thirty-two tool definitions behaves like the agent those tools belong to,
which is how one came to announce it had delegated the question to a subagent.

What cannot be removed is the identity. A member still reports itself as a Claude agent —
the system prompt replaces the instructions layered on top, not the harness underneath. **A
Subscription seat is the model inside its CLI; the API route is the bare model.** Close
enough to compare, not identical, and worth knowing before reading much into a disagreement
between the same model on two routes.

API prices come from a table in `src/providers/api.ts`. Anthropic's rates are filled in;
OpenAI's are deliberately empty, because a wrong price shown with confidence is worse than
no price, so that route yields token counts and no dollar figure.


## The IPC contract

```text
Direction   Channel     Purpose
---------   ---------   ---------------------------------------------------
invoke      catalog     models and modes, with a reason for each blocked one
invoke      keys        where each API key comes from: stored, env, or none
invoke      setKey      encrypt a key into userData, or clear it
invoke      run         start a run, returns a run id
invoke      cancel      abort a run in flight
invoke      panels      the saved presets and the path they live at
invoke      savePanel   store the current arrangement under a name
invoke      deletePanel forget one saved preset
broadcast   event       every run event, tagged with its run id
```

All run events travel on one channel as a discriminated union rather than six channels. The
renderer filters by run id and switches on `type`, so a panel closed and reopened mid-run
ignores the tail of the previous one instead of rendering it into a fresh layout.

Keys are encrypted with Electron's `safeStorage` into `userData/eforoi/keys.json`. Never
`localStorage`, never sent to the renderer, never logged: the renderer can learn that a key
exists and where it came from, not what it is.


## Verifying without spending

The panel is checked by mounting the built bundle against a fake context.
`scripts/panel-harness.html` supplies a catalogue, canned run events and answers carrying
the markdown that matters — fenced code, tables, nested lists — so layout, both themes and
code rendering are inspectable in an ordinary browser, with **zero model calls**.

```bash
pnpm --filter @dyarchia/plugin-eforoi build
py -m http.server 8731 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8731/plugins/eforoi/scripts/panel-harness.html`. **Do not stub
`window.dyarchia` inside the real shell instead**: that object comes from `contextBridge`
and its properties are not writable, so the assignment fails silently, the real IPC call
goes through, and a modal dialog opens on the operator's screen.

The orchestration layer runs headless, and this one does spend real quota:

```bash
pnpm --filter @dyarchia/plugin-eforoi probe catalog
pnpm --filter @dyarchia/plugin-eforoi probe run "<seat>" "<seat>" "<analyst>" "your prompt"
```

The last seat is the analyst; `scripts/electron-stub.mjs` stands in for the two Electron
APIs the plugin uses. Say what a run will cost before launching one.


## Deliberate omissions

```text
Absent               Why
------------------   ---------------------------------------------------------
a web switch         It reached four routes of five: opencode has no flag for
                     web access either way. Same objection as temperature.
follow-up turns      A panel is not a chat. A follow-up is a new question and a
                     new question deserves a fresh panel.
markdown library     Model output reaches the DOM through innerHTML, so a parser
                     emitting raw HTML would need a sanitiser behind it. The SDK
                     renderer escapes at every leaf instead.
temperature          Current Anthropic models reject the parameter with a 400,
                     and no CLI route exposes one. A control working on two
                     routes of five would mislead.
analyst warnings     A weak analyst under a strong panel is a legitimate choice;
                     comparison is a bounded task. The UI names the role rather
                     than second-guessing who fills it.
uniform streaming    Members stream where their route allows it — claude and
                     opencode emit deltas, codex only a final message — so cards
                     fill at different rates. The analyst's JSON call never
                     streams; there is nothing readable to show mid-parse.
```

One open thread: opencode's run reports no searchable count, so the panel says `web ?`
rather than a zero it cannot stand behind. Closing it needs one good `--format json` run.
