# kanban

A task board whose cards are run by coding-agent CLIs, with a terminal on the running worker.

## Columns

```text
FROM        TO (by hand)
----------  ----------------------------------
triage      ready
scheduled   ready, triage (promoted to ready at its time)
ready       scheduled, triage
running     (the dispatcher only)
blocked     ready, review, triage, archived
review      done, ready
done        archived
archived    (final)
```

- The dispatcher claims the top `ready` card whose parents are done, within per-board (1) and global (2) caps.
- A blocked card's state key reads `unblock` under the pointer; pressing it returns the card to the
  phase it was blocked from and resets its protocol violations to zero.

## How a card runs

- Each phase, implement and review, has a runner (harness, model, effort); blanks inherit from the board, then the CLI.
- Review is mandatory: a completed implement run moves the card to `review`, and the dispatcher starts
  the reviewer under the same caps, before any ready card. `approve` and `request changes` still override it.
- An `approved` verdict lands the card in `done`; `changes` posts the summary as a comment and returns it to `ready`.
- A `dir` card works in a git worktree at `.claude/worktrees/<name>`, a `scratch` card in a disposable temp folder.
- Changes left uncommitted by an implement run are committed by the board as one commit named after the card.
- A Claude worker also gets the tools other plugins offer under `<userData>/mcp/`; hosted harnesses do not.

Every run must end its last message with this closing block, the worker's only way to talk to the board:

```text
===KANBAN===
{ "outcome": "completed" | "blocked",
  "verdict": "approved" | "changes",          (review runs only)
  "blockKind": "needs_input" | "capability" | "transient" | "dependency" | null,
  "summary": "what changed, what is verified, what is left",
  "artifacts": ["relative/path"],
  "handoff": ["relative/path"],
  "followups": [ { "title": "...", "body": "..." } ] }
```

- `artifacts` are copied onto the card for the operator; `handoff` files are attached to the next brief.
- Each `followup` becomes a new `ready` card that depends on this one, at most ten per run.
- A turn without the block, a review without a verdict, or a declared file that is missing is a protocol violation.

## Harnesses

```text
HARNESS    RUNS AS                                   NON-OBVIOUS CONSTRAINT
---------  ----------------------------------------  ------------------------------------------
claude     claude --bg --worktree, survives the app  repo allow rules ignored; --allowedTools
codex      codex exec --json, child of the app       sandbox refuses .git writes
grok       grok -p, streaming-json, child            takes claude's --permission-mode values
kimi       kimi -p, stream-json, child               no permission mode, effort or usage
opencode   opencode run --format json, child         launched via its .exe; --dir always passed
```

- A hosted run (every harness but claude) streams to `<userData>/kanban/hosted/<runId>.jsonl` and dies with the app.
- `auto` is the default permission mode; `bypassPermissions` refuses to launch under `--bg`.
- A new harness is a driver in `src/harness/` implementing launch, liveness, stop, final text and attach.

## Safety rules

- Liveness has three values, and `UNKNOWN` is treated as alive, never as dead.
- The respawn guard holds a card for 60 s after a completed run and indefinitely after a quota or auth error.
- A launch or sign-in failure never counts: a sign-in race retries in two minutes, a second one in a
  row or any other account error blocks as `needs_input` until you sign in again.
- Three consecutive protocol violations block the card as `capability`.
- Two consecutive failures on one card trip its circuit breaker (`maxRetries` per card).
- A `blocked` worker waits on a person and is never reclaimed; a `working` one silent 1 h past 4 h of age is stalled.

## Data

```text
PATH                                              HOLDS
------------------------------------------------  ----------------------------------
<userData>/kanban/boards.json, settings.json      board registry, global cap
<userData>/kanban/boards/<slug>/                  board.json (cards, runs), events.jsonl,
                                                  attachments/<cardId>
<userData>/kanban/hosted/<runId>.*                hosted run streams
%TEMP%/dyarchia-kanban/<slug>                     scratch workspaces
```

## Verify

```bash
pnpm --filter @dyarchia/plugin-kanban probe
```

- The probe runs every check that needs no real agent, headless, against a temporary userData.
- `scripts/panel-harness.html`, served from the repo root, mounts the built panel against a fake context.
