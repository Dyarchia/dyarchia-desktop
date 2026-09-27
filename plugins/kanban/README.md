# kanban

A task board that dispatches work to Claude Code and lets the operator watch the agent work and
talk to it while it does. What is wrong, missing or unproven is kept in a register outside this
repository; anything found while building goes there before the commit that found it, and nothing
leaves it silently.

A worker under Claude Code is **a real interactive session, not a batch run**: `claude --bg` in a
git worktree, with a pty the operator can attach to. Print mode exists and this design does not
use it, because a session you cannot talk to cannot be unblocked. The four other harnesses the
board can run, Codex CLI, Grok CLI, Kimi Code and OpenCode, have no detached mode, so under them a
worker is a child process of this app whose event stream the board keeps; see *Who runs a card*.


## Build and verify

```bash
pnpm --filter @dyarchia/plugin-kanban build
npx tsc -p plugins/kanban
pnpm --filter @dyarchia/plugin-kanban probe
```

The probe is the headless half: esbuild through an electron stub, then plain node, no window and
no IPC. 216 checks over slug validation, three-valued liveness, the window where a new session is
not listed yet, both parsers and the verdict, dependency cycles, rev fencing, promotion, unblock,
scheduled cards, the worktree listing, both briefs, both concurrency caps, the respawn guard,
where a stopped run goes home, the status tally, both batch verbs, what a deleted card takes with
it, the fields a patch may carry, and a turn that finished declaring nothing. It writes to a temp
userData and takes about a second. **Everything it covers is everything that does not need a real
agent**, which is why it is worth keeping green.

The panel is checked by mounting the built bundle against a fake context, which needs no Electron
and opens no native dialog: serve the repo root and open
`scripts/panel-harness.html` under `plugins/kanban/`.

**A main module change needs the whole app restarted**, not a window reload, and the shell's watch
mode does not cover plugin sources at all.


## Claude Code CLI facts

Each row is verified CLI behaviour, not an inference.

```text
FACT                                                    CONSEQUENCE
------------------------------------------------------  ---------------------------------
Background agents are built in (claude --bg,             no supervisor of our own
claude agents --json)
A background session is confined to a git worktree       one worktree per card
The brief goes inline; file indirection was not enough   the brief is an argument
The worker inherits the parent process environment       the shell's env reaches it
A scratch workspace under userData does not work,        use a worktree
for a reason not yet understood
~/.claude/sessions/ is a process registry, not the       read the JSONL for content
transcripts
A stopped session reads as alive                         the card never lands on its own
'blocked' does not mean the worker is still working      liveness needs three values
Two modes finish a card unattended, auto and dontAsk    see below
Plan mode does not stop a reviewer from stalling         plan mode is not a safety net
os.kill(pid, 0) is not a liveness query on Windows       it lies in both directions
```

**Which permission mode.** Under `--bg`, two modes finish a card with nobody watching:

```text
MODE        FLAGS                                  BEHAVIOUR
----------  -------------------------------------  ------------------------------
auto        --permission-mode auto                 commits; the classifier passes
                                                   a compound shell command
                                                   without a prompt
dontAsk     --permission-mode dontAsk              commits in its worktree; what
            --allowedTools EnterWorktree Edit      the list does not name is
            Write Read Glob Grep                   denied, never asked, and the
            "Bash(git add:*)" "Bash(git commit:*)" worker routes round a denial
            "PowerShell(git add:*)"
            "PowerShell(git commit:*)"
acceptEdits --permission-mode acceptEdits          applies edits, then stops at
                                                   the first command
bypass      --permission-mode bypassPermissions    refuses to launch under --bg
```

`auto` is the default for a new card and the mode for unattended implementation: the worker
decides for itself and the CLI's classifier reviews what is not read-only, blocking what
escalates beyond the brief. Its one documented gap is that gap: a blocked action is retried
another way, and after three blocks in a row a session that cannot prompt keeps working without
the action. Auto mode also drops blanket `Bash(*)` and `PowerShell(*)` allow rules on entry, so
an allowlist does not widen it. A session asked for `auto` starts in Manual when the model does
not support it, when a settings file disables it or when the server declines it, and then stops
on ordinary edits.

`dontAsk` with `--allowedTools` is the CLI's own recipe for CI: exact, and nothing outside the
list ever prompts. It costs more than `auto` on the same brief, because a denied call is a turn
spent. `acceptEdits` is for a run you sit in front of. `bypassPermissions` wants a one-time
interactive acceptance that writes to the operator's `~/.claude.json`; nothing in this plugin
performs it.

**The allowlist trap has two halves.** Allow rules in a repository's own `.claude/settings.json`
grant capability, so the CLI applies them only after the operator accepts the workspace trust
dialog for that folder, which an interactive session shows and a background or `-p` session
never does. A background worker therefore ignores every rule the repository carries, whichever
tool they name. Rules meant for a worker go on the command line as `--allowedTools`, where the board
puts them. The second half is Windows: the worker reaches for `PowerShell` as readily as for
`Bash`, so a rule that names one tool covers half the runs. Name both.

## Who runs a card

A card runs in two phases, implement and review, and each phase names its runner: a harness, a
model and an effort. A card leaves blank what its board decides, and a board leaves blank what
the harness decides.

```text
FIELD     THE CARD SAYS     ELSE THE BOARD SAYS   ELSE
--------  ----------------  --------------------  ------------------------
harness   that harness      that harness          claude
model     that model        that model            the CLI's own default
effort    that effort       that effort           the CLI's own default
```

The two phases are separate on purpose. A reviewer on the model that wrote the code is a worse
judge of it than one on another model, and independence is what the review phase exists for. A
card that carries a single model and effort outside the runners reads them as the
implementer's, and the review phase inherits them.

A harness is a driver in `src/harness/`, and the whole of what the board asks of one is five
operations: launch a run with a brief, answer whether it is alive, stop it, hand back its final
text, and give the operator a pty to attach. The brief, the closing block, the worktree per
card, the lease, the stall detector and the verdict never see which driver answered. Five are
shipped, and the harness list, each one's models and whether it is on PATH, come from the
drivers rather than from the panel.

```text
HARNESS    BINARY     MODELS COME FROM                    RUNS AS
---------  ---------  ----------------------------------  ---------------------------------
claude     claude     four aliases                        claude --bg, detached, a registry
codex      codex      ~/.codex/models_cache.json, the     codex exec --json, a child of this
                      ones it would list                  app
grok       grok       grok models                         grok -p, streaming json, a child
kimi       kimi       [models.*] in ~/.kimi-code/         kimi -p, stream-json, a child
                      config.toml, named by their model
opencode   opencode   opencode models, every provider:    opencode run --format json, a child
                      Zen, then Go, then OpenRouter
```

**A hosted run is a child of this app.** Its stdout is the event stream and goes to
`<userData>/kanban/hosted/<runId>.jsonl`, which is what progress and the activity tab read;
its exit is the liveness answer; the session tab tails that file while it runs, because there
is no session to talk to. When this app closes, the run closes with it: the board marks it crashed
with that reason, sends the card back to its phase, and does not count the attempt. The
board keeps no supervisor of its own.

**The board lands what a worker leaves uncommitted.** A change left in the working tree is not
on the branch, so nothing can review it and the worktree may go. When an implement run
completes in a worktree with a dirty tree, the board commits it as one commit named after the
card, says so in the message and in the event log, and only then hands the card to review.
Codex needs this by construction: its sandbox refuses every write to the git metadata, `--add-dir`
on `.git` included, so its brief tells it not to try. A worker under any harness that simply
forgot gets the same treatment.

**An artifact is for the operator; a handoff is for the next worker.** The closing block carries
both lists. `artifacts` are the files the operator should look at, kept on the card and shown on
the run. `handoff` are the files the next worker on this card should read, a reviewer or a retry:
the board attaches them to the next brief beside the operator's own files, marked as left by the
previous run, and only from the last completed implement run, because a brief that enumerates
what five attempts left is a different problem. Both are paths relative to the run's working
directory, and a declared file that is not there is a violation.

**The worktree is the board's whichever harness runs.** Claude Code makes its own with
`--worktree`; for the other four the board runs `git worktree add` at the same place,
`.claude/worktrees/<name>` on branch `worktree-<name>`, because that is the directory the
board already ignores, inventories and prunes.

### Tools other plugins offer

A Claude worker can be given tools beyond its own, and the board learns of them from the one
folder the shell reserves for offers, `<userData>/mcp/`, described in docs/plugins.md. The
board reads every offer there at launch, merges them into one config under
`<userData>/kanban/mcp.json`, launches with `--mcp-config` and the listed tools allowed by
name, and ends the brief with a Tools section made of the offers' notes. It knows nothing about
who offers what: with the folder empty the worker runs as before, and an offer whose command is
gone from the disk is skipped. Crawlee offers `search_corpus`, published only while a corpus
repository holds pages. The hosted harnesses do not get offers.

A listed tool is callable only when it is allowed by name. The MCP client starts a server in the
session directory and ignores the offer's `cwd`, so a server that needs its own directory takes
it as an argument; crawlee's is launched with `--root`.

### The review loop

A review is asked for by hand, never claimed by the dispatcher. An `approved` verdict lands the
card in done. A `changes` verdict puts the reviewer's summary on the card as a comment and sends
it back to ready, so the review reaches the next implementer's brief.

### Hosted harness facts

Verified against codex-cli 0.154.0, grok 1.0.30 and opencode 1.18.30 on Windows 11. None of the
rows is inferred.

```text
FACT                                                      CONSEQUENCE
--------------------------------------------------------  ----------------------------------
codex exec --json prints thread.started, item.*,           the reader keys on those four
turn.completed with usage, turn.failed with the error
codex -o writes the last message whole                     the closing block is read from it
codex's workspace-write sandbox refuses .git writes even   the board commits for it
with --add-dir on .git
codex -s read-only reviewed and approved a diff            a codex review is a real read-only
                                                           review
codex reads stdin when it is not a tty                     stdin is ignored on the spawn
a model the account cannot use fails after the launch      the error is read from the stream
with turn.failed, not before it                            and blocks the card as needs_input
grok -p --output-format streaming-json prints thought      the reader joins deltas and takes
and text deltas, usage, and end with sessionId and usage   the usage from end
grok --permission-mode takes claude's vocabulary           the card's mode passes through
grok models lists the models, authenticated or not         the drawer offers them
grok reviewed a diff and approved it under plan mode       a grok review works
opencode is an npm shim through cmd.exe, and cmd.exe ends  the driver launches the .exe the
a command at the first newline, cutting the brief to one   shim points at, never the shim
line
opencode -f attaches a file the model never opened         the brief goes as the message
opencode run without --dir searches and writes in the      --dir is always passed
directory this app started in
opencode models lists each provider's ids in -m form       the drawer offers every provider's
opencode over OpenRouter completed a card, commit and       the cycle works end to end
closing block included, and codex approved it
the dispatcher lease outlives a killed app for its TTL     a lease whose process is gone is
                                                           taken at once; the 90 s TTL covers
                                                           a holder that hangs
```

Kimi Code is driven from its documentation for kimi 2.1.1, not from a verified run.
`-p` runs under Kimi's auto policy and Kimi refuses to start when `-p` comes with `--yolo`,
`--auto` or `--plan`, so the card's permission mode is not passed and a Kimi reviewer keeps every
tool: only its brief keeps it from writing. stream-json writes `assistant` messages with
`content` or `tool_calls` and `tool` messages with `tool_name` and `result`; there is no usage and
no closing event, so the run ends when the process exits, and there is no effort flag.

A launch that fails before any work is done, because the binary is not on PATH, the model is
one the harness does not know, or a login lapsed, blocks the card as `needs_input` with the
error on it. It does not count against the card's retries: nothing was tried.


## Liveness and the failure taxonomy

**Liveness has three values, and collapsing `UNKNOWN` into either neighbour is a production bug
in both directions**: into `DEAD` you double-dispatch live work, into `ALIVE` you never reap. A
process failure, a timeout, unparseable output and access denied are all `UNKNOWN`.

```text
ANSWER     ACTION
---------  ------------------------------------------------------------
ALIVE      extend the claim. Do not touch the worker
UNKNOWN    extend exactly as for ALIVE, and count the uncertainty.
           Escalate only on the four hour wall clock, never on doubt
DEAD       walk the evidence ladder and resolve
```

```text
FAILURE               DETECTION                                        AUTHORITY
--------------------  -----------------------------------------------  --------------
Crashed               the id is absent from agents --json and the       agents --json
                      transcript has no trailing turn_duration
Protocol violation    the turn ended but no marked terminal block is    the JSONL
                      in the assistant text
Waiting on a person   state 'blocked' and the turn has not ended.       agents --json
                      NOT a failure and never reclaimed
Stalled               state 'working', but the JSONL mtime has not      the file
                      advanced in an hour and the run is older than
                      four hours
Max runtime           the run exceeded the card's runtime cap           the clock
Quota or auth error   an api-error record, or 401 or 429 in the         the JSONL
                      assistant stream
Orphaned              the board says running, agents does not see it    agents --json
Stranded in ready     claimable but unclaimed for 30 minutes            the board
                      (a diagnostic, never an action)
Circuit breaker       2 consecutive failures on the same card           the board
Block loop            2 cycles of block, unblock, same block kind       the board
```

The last three are the board's because they are properties of the card, not of a process, which
is why they survive any change of execution substrate.

Every diagnostic reaches the bar as `health n`. The button opens a list, one row per problem
with where it sits above the sentence; a row that belongs to a card opens that card, and one
about the machine (another window holds the dispatcher, a worker outlived the previous app) is
shown on every board. The list is re-read every thirty seconds, so a problem that resolves
itself leaves the bar without a board event.

```text
claim TTL                  15 minutes, extended on ALIVE or UNKNOWN
blocked                    never expires. A person is not a timeout
stale: no output for       60 minutes, and only while state is 'working'
stale: minimum run age     4 hours
max runtime                unset by default, per card
circuit breaker            2 consecutive failures, per card via maxRetries
protocol violations        3 consecutive, then block
block recurrences          2, then triage
stranded diagnostic        30 minutes
```

Stalled and Max runtime are decided by two exported pure functions, `overran` and `stalled` in
`dispatch.ts`, with the thresholds as a defaulted parameter, so the probe makes them fire in
microseconds.

**A session at a permission prompt reads `blocked`, and `stalled` returns false for anything that
is not `working`.** Nothing reclaims such a card. That is deliberate, and it is why an unattended
review that stops for permission is a problem this detector does not solve. The branch that calls
`claude stop`, closes the run as `stopped` and blocks the card is not exercised by any real run.

**The respawn guard.** Never relaunch a card whose previous run ended in a quota or auth error, or
that completed successfully inside a short guard window: emit a diagnostic and leave it claimable
for a later tick. A 401 does not fix itself in five seconds, and a dispatcher without this guard
burns the whole board against a bad credential.

A turn that ends before the model says a word, on an account error, is the harness failing to
reach the model and never a protocol violation. A login that two Claude processes renewed at
once clears on its own, so the card goes back to ready and is held for two minutes; any other
account error blocks the card as `needs input`. Neither counts against it, and the thread says why.


## The inspector

A selected card opens over the board, not beside it: a card-shaped sheet as tall as the
columns, half the panel wide, with the board still in place underneath. The key in its head
gives it the whole panel, the choice is remembered per panel, and it closes on Escape, on
its key, or on a click on the board around it. Without a run it is one column and the brief
grows to the height. With a run and 720 px of width it is two columns, the form on the left
and the stage on the right at full height. Under that width the stage sits above the form. The
form is its own pane, so its label column answers to its own width and not the drawer's.

The head is the form's first row: the state key in the label column, the title where the values
start. The state key opens the move menu. A blocked card's state is lit red and joined to a
green check that unblocks it, which returns the card to the phase it was blocked from and forgives
its protocol violations, so the next attempt has its full budget. What to do with the card, from
approving to deleting it, is icon keys with tips.

The stage has up to three tabs. `session` is the terminal attached to the worker, and exists only
while a worker is on the card. `activity` is what a run did, as kanon's `steps`: the time, a verb
a person would use (`ran`, `read`, `wrote`, `started agent`) and its subject, which for claude is
the description the agent gave the call; the call's input and what came back open under it, a
failed call's verb is red, and what the agent said is prose. A picker chooses the run, and `open
transcript` hands the raw JSONL to whichever panel reads text. `log` is what happened to the card,
one sentence per event, with a run of edits folded into one line.

Every setting is a native `select`: harness, model and effort per phase, permission mode,
workspace kind. A blank inherits: its option shows what it inherits, `Claude Code` or
`claude-opus-5-5`, noted `follows the board` in the list, or `default` when the harness decides.
A model is always named by its API id, on the card too: a Claude alias by the newest model of its
family in the account's recent transcripts (`latest` when none is seen), a Kimi alias by the
`model` of its config table. The model is picked from the board's menu with its search
field, where every word typed must appear, grouped by provider when the ids carry one. The bar carries the board
name, then three keys for that board (new, settings, worktrees), then dispatch and watch;
every icon-only control opens a tip on hover or focus and carries an `aria-label`. The board
picker lists boards and nothing else.

## Storage and IPC

No database. The card id is ours and the session id is the CLI's, and they are never conflated.
Each store has exactly one owner that reclaims it, so nothing is orphaned by a delete: a deleted
card takes its own artifacts with it and nothing else.

Channels are short and the shell prefixes them with `plugin:kanban:`. The renderer moves cards
optimistically and reconciles against the rev it was given, so a stale patch is refused rather
than applied out of order. An error belongs to the thing it happened to: a failed card shows its
own error, never a panel-wide banner.

A refusal is marked, and the mark is what carries it: a worker that declines work says so in its
closing block, and the card lands in a state that names the refusal instead of reading as a crash.


## Traps

Do not rediscover them.

1. **`overflow: hidden` on a card makes it a scroll container** and sets its automatic minimum
   size to zero, so cards collapse and overflow their row. Do not ask one element to both scroll
   and lay out.
2. **`grid-column: span N` survives nesting.** A card carrying span 12 inside a three-column band
   generated nine implicit 0px tracks. A band must reset `grid-column: auto` on its children.
3. **The `dyarchia-plugin://` response is cached** and the main module is read only at startup.
   Reload ignoring cache after every install; restart the app after a main module change.
4. **Never put `content-visibility: auto` on a column.** An unrendered subtree has no boxes and
   measurement silently returns garbage.
5. **`touch-action: none` on the whole card** disables touch panning of a column that starts on a
   card. Correct trade for desktop Electron; a dedicated grip is worse with a mouse.
6. **xterm 6 does not render into the DOM.** Reading `.xterm-rows` textContent returns empty
   strings however well it is painting. Look at the screen, or capture the bytes on the way in.
7. **A card body that says "artifact" can send the worker to the Artifact tool**, which needs a
   permission nobody is there to give, so the run sits waiting. The protocol's own word is `artifacts` in the closing block, so write "write the file
   and list its path in the closing block" instead.

```text
RISK                                      MITIGATION
----------------------------------------  ------------------------------------------
An unattended worker with broad           permission mode is per card, never global
permissions on a work repository
Cost climbs unseen                        accumulated cost on the card, plus a
                                          stop-loss. It is a stop-loss, not a cap
Board and sessions diverge                agents --json is authority every tick and
                                          the board never contradicts what it sees
The app closes with work running          nothing to do: sessions are detached and
                                          survive by design
A worker is told something its siblings   the brief carries parent summaries and the
never learn                               comment thread and nothing else. Shared
                                          decisions must be stamped into every card
A board slug reaches the filesystem       validated against the allowlist before it is
unvalidated                               joined to a path. Getting this wrong is a
                                          directory write anywhere on disk
Five boards launch ten sessions           the global concurrency cap, not only the
                                          per-board one
A panel silently switches project after   a panel whose pinned board is gone shows an
its board is archived                     empty state naming it, never a fallback
```


## Portability

Another harness is another driver in `src/harness/`: the five operations above, its own
liveness answer, and its own verified facts. The three board-owned failure rows
survive that change unaltered, which is the point of keeping them on the card rather than on
the process.
