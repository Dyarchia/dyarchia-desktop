# kanban

A task board that dispatches work to Claude Code and lets the operator watch the agent work and
talk to it while it does. [OPEN-PROBLEMS.md](OPEN-PROBLEMS.md) is the register of what
is wrong, missing or unproven; anything found while building goes there before the commit that
found it, and nothing leaves it silently.

A worker is **a real interactive session, not a batch run**: `claude --bg` in a git worktree, with
a pty the operator can attach to. Print mode exists and this design does not use it, because a
session you cannot talk to cannot be unblocked.


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


## Measured facts about the Claude Code CLI

Every row cost a real run. None of them is inferred.

```text
FACT                                                    CONSEQUENCE
------------------------------------------------------  ---------------------------------
Background agents are built in (claude --bg,             no supervisor of our own
claude agents --json)
A background session is confined to a git worktree       one worktree per card
The brief goes inline; file indirection was not enough   the brief is an argument
The worker inherits the parent process environment       the shell's env reaches it
A scratch workspace under userData did not work,         do not retry it blind
and the reason is NOT settled
~/.claude/sessions/ is a process registry, not the       read the JSONL for content
transcripts
A stopped session reads as alive                         the card never lands on its own
'blocked' does not mean the worker is still working      liveness needs three values
Permission modes are not interchangeable under --bg      see below
Plan mode does not stop a reviewer from stalling         plan mode is not a safety net
os.kill(pid, 0) is not a liveness query on Windows       it lies in both directions
```

**Which permission mode.** An unattended run goes on `auto`: the worker decides for itself, the
CLI's safety classifier is the backstop, and it is the only mode that gets a commit made with
nobody watching. A run you intend to sit in front of can go on `acceptEdits`, which applies edits
without asking and then stops on every command, the commit included. `bypassPermissions` **refuses
to launch under `--bg` at all** — the CLI wants a one-time interactive disclaimer and a detached
session has nobody to give it, so the run never starts.

**The Windows allowlist trap.** A repository can pre-authorise commands in its own
`.claude/settings.json`, but on Windows a rule written as `Bash(...)` never fires: the worker
reaches for the PowerShell tool, so the rule names a tool that is never asked for and the worker
stops for approval anyway. Measured on the proof repository, four commands, all four covered on
paper and none in fact.

```text
COMMAND      REQUESTED THROUGH   RULE THAT WAS MEANT TO COVER IT
-----------  ------------------  ---------------------------------
node         PowerShell          Bash(node:*)
git status   PowerShell          Bash(git status:*)
git add      PowerShell          Bash(git add:*)
git commit   PowerShell          Bash(git commit:*)
```

Name the tool the worker actually uses.


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

Stalled and Max runtime were unfalsifiable until the decision became a pair of exported pure
functions, `overran` and `stalled` in `dispatch.ts`, with the thresholds as a defaulted
parameter. The probe makes them fire in microseconds, and each check was verified able to fail by
breaking the rule and watching the probe go red.

**A session at a permission prompt reads `blocked`, and `stalled` returns false for anything that
is not `working`.** Nothing reclaims such a card. That is deliberate, and it is why an unattended
review that stops for permission is a problem this detector does not solve — see open-problems
section 1. Still unproven is the wiring rather than the decision: no run has taken the branch that
calls `claude stop`, closes the run as `stopped` and blocks the card.

**The respawn guard.** Never relaunch a card whose previous run ended in a quota or auth error, or
that completed successfully inside a short guard window: emit a diagnostic and leave it claimable
for a later tick. A 401 does not fix itself in five seconds, and a dispatcher without this guard
burns the whole board against a bad credential.


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

Already paid for. Do not rediscover them.

1. **`overflow: hidden` on a card makes it a scroll container** and sets its automatic minimum
   size to zero. It cost an hour in a panel that has since been removed: cards collapsed from 31px
   to 15px and a 510px card overflowed a 416px row. Do not ask one element to both scroll and lay
   out.
2. **`grid-column: span N` survives nesting.** A card carrying span 12 inside a three-column band
   generated nine implicit 0px tracks. A band must reset `grid-column: auto` on its children.
3. **The `dyarchia-plugin://` response is cached** and the main module is read only at startup.
   Reload ignoring cache after every install; restart the app after a main module change.
4. **Never put `content-visibility: auto` on a column.** An unrendered subtree has no boxes and
   measurement silently returns garbage.
5. **`touch-action: none` on the whole card** disables touch panning of a column that starts on a
   card. Correct trade for desktop Electron; a dedicated grip is worse with a mouse.
6. **xterm 6 does not render into the DOM.** Reading `.xterm-rows` textContent returns empty
   strings however well it is painting, which cost an hour chasing a rendering bug that did not
   exist. Look at the screen, or capture the bytes on the way in.
7. **A card body that says "artifact" can send the worker to the Artifact tool.** Measured on a
   live board: a card asking for a file to be "declared as an artifact" had the worker reach for
   the tool of that name, which needs a permission nobody was there to give, and the run sat
   waiting. The protocol's own word is `artifacts` in the closing block, so write "write the file
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

Claude Code takes `--model` and speaks to Bedrock, Vertex and Foundry as well as the direct API,
so other models need no work here. Another executor entirely would need its own liveness answer;
the three board-owned failure rows above survive that change unaltered, which is the point of
keeping them on the card rather than on the process.
