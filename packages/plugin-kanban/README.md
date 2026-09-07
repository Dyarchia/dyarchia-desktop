# @dyarchia/plugin-kanban

A task board that dispatches work to Claude Code and lets the operator watch the agent work
and talk to it while it does.

[docs/design.md](docs/design.md) is the design authority. It is self-contained: capability
inventory, data model, state machine, worker contract, failure taxonomy, and the measurements
behind every claim about the Claude Code CLI. Read it before changing anything here.

[docs/open-problems.md](docs/open-problems.md) is the register of what is wrong, missing or
unproven. Anything found while building goes there before the commit that found it, and
nothing leaves it silently. Read it before deciding what to do next.


## Index

- [1. What is built](#1-what-is-built)
- [1.1 What a worker actually is](#11-what-a-worker-actually-is)
- [2. Build and verify](#2-build-and-verify)
- [3. Storage](#3-storage)
- [4. IPC](#4-ipc)
- [5. Plugin-prefixed CSS, and why each rule exists](#5-plugin-prefixed-css-and-why-each-rule-exists)
- [6. Debts](#6-debts)
- [docs/open-problems.md](docs/open-problems.md)


## 1. What is built

Phases 0 to 5 of the design's section 18.

```text
AREA                     STATE
-----------------------  --------------------------------------------------------
Board registry           one board per project, slug validated as a path segment,
                         workdir absolute and checked to exist
Cards                    CRUD, priority, dependencies with cycle rejection,
                         comment thread, `rev` as a fencing token on every move
State machine            nine states, the transition table owned by the main
                         module and shipped to the renderer as data
Panel                    one panel per board, pinned in localStorage by the
                         shell's panel instance id, so two panels are two projects
Drag                     pointer events, ghost, insertion indicator, autoscroll,
                         accept and refuse washes, Escape to cancel
Keyboard                 roving tabindex, arrows, Ctrl with arrows to move a card
                         to the nearest legal status, Enter to open, live region
Dispatch                 a tick sweeps every board, reconciles running cards against
                         `claude agents --json` with three-valued liveness, promotes,
                         and claims. 1 card per board, 2 across all of them
Worker                   a real `claude --bg` session in a git worktree of the project,
                         watched through its transcript
Terminal                 `claude attach` in a pty, in a utilityProcess, over a
                         MessagePort. The operator watches and answers permission
                         prompts in the agent's own interface
Failure handling         crash, protocol violation, runtime cap, silence past a four
                         hour run, circuit breaker, respawn guard, block routing by
                         kind, and a block-loop guard that sends a card to triage
                         after it blocks the same way twice
Fan-out                  `followups` in the terminal block become child cards gated
                         on the card that proposed them
Health                   a strip in the bar naming what is wrong: cards waiting on
                         you, cards claimable and never claimed, liveness unknown
Artifacts                what a run declares is copied out of the workspace before the
                         workspace is reclaimed, and shown on the run as a chip that
                         opens it on disk. A declared artifact that is not there is a
                         violation, not a completion
History                  the transcript as readable rows in the drawer, beside the
                         terminal: prose, thinking, tool calls with a one-line argument
                         summary, results that expand, and a closing turn row
```

There is deliberately no way to move a card to `done` by hand. `done` means a worker finished.
See section 9 of the design.


## 1.1 What a worker actually is

```text
A REAL Claude Code session, started detached with `claude --bg`, not `claude -p`
Confined to a git worktree of the project: <repo>/.claude/worktrees/kanban-<8> on branch
    worktree-kanban-<8>. THE CLI REQUIRES THIS. A background session refuses to edit the
    checkout it started in, so the plugin passes -w and the operator's tree is never touched
Told what to do by a brief passed INLINE as the prompt when it is under 8000 characters,
    and written to <workspace>/.dyakanban/<runId>/brief.md either way. That directory gets a
    .gitignore of `*` so it never reaches anyone's git status
Spawned with the PARENT session's environment stripped, so a dyarchia launched from inside a
    Claude Code session does not hand its workers a proxy they cannot authenticate against
Never deleted. `claude rm` refuses a session whose worktree holds unmerged commits, so the
    plugin does not call it at all: `stop` is the only lifecycle verb it uses
Stopped as soon as it declares itself finished, so a resolved card does not leave a session
    sitting idle. A DECLARED TERMINAL BLOCK OUTRANKS LIVENESS: a worker that ends its turn by
    blocking leaves its session at state 'blocked', which liveness reads as alive, so waiting
    for liveness to say 'dead' left such cards running forever. See design.md 5.10
```

A run that completes inside a worktree lands its card in **review**, not done, because there
is a branch for a person to land.


## 2. Build and verify

```bash
pnpm --filter @dyarchia/plugin-kanban build
```

```bash
npx tsc -p packages/plugin-kanban
```

```bash
pnpm --filter @dyarchia/plugin-kanban probe
```

The probe is the headless half of verification: esbuild through an electron stub, then plain
node, no window and no IPC. 51 checks over slug validation, three-valued liveness, both
parsers, dependency cycles, rev fencing, promotion, unblock and scheduled cards. It writes to
a temp userData and takes about a second. Everything it covers is everything that does not
need a real agent, which is why it is worth keeping green.

A **main module change needs the whole app restarted**, not a window reload. The shell's watch
mode does not cover plugin sources at all, so rebuild by hand.

The panel is checked by mounting the built bundle against a fake context, which needs no
Electron and opens no native dialog:

```bash
py -m http.server 8731 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8731/packages/plugin-kanban/scripts/panel-harness.html` from the
repository root. The harness supplies two boards, thirteen cards across every column, a
dependency, a locked running card and a comment thread, which is enough to drive the drag, the
keyboard path and both themes.

Do not stub `window.dyarchia` inside the real shell instead. That object comes from
`contextBridge` and its properties are not writable: the assignment fails silently, the real
IPC call goes through, and a modal dialog opens on the operator's screen.


## 3. Storage

Under `app.getPath('userData')`, one directory per board:

```text
kanban/boards.json                          the registry
kanban/boards/<slug>/board.json             that board's cards
kanban/boards/<slug>/board.bak.<n>.json     three rotated copies, newest is 0
kanban/boards/<slug>/attachments/<cardId>/  artifacts harvested from a run
```

Scratch workspaces are the exception and live at `<tmpdir>/dyarchia-kanban/<slug>/<cardId>`,
NOT under userData. **A background session refuses to start anywhere under AppData**, with the
system temp directory the only exception, so a scratch workspace in userData could never have
run. Measured; see design.md 5.11.

Written by temp file plus `rename`, which is atomic on NTFS within a volume. **The slug is a
path segment**, so it is validated against an allowlist before it is ever joined to a path:
lowercase alphanumerics, `-` and `_`, 1 to 64 characters, starting with an alphanumeric, and
never a reserved Windows device name. Getting that wrong is a directory write anywhere on disk.


## 4. IPC

Short channel names; the shell prefixes `plugin:kanban:`. Every card channel takes the board
slug first, because there is no ambient current board in the main module.

```text
boards        createBoard   updateBoard   archiveBoard   pickWorkdir
board         createCard    updateCard    moveCard       deleteCard     comment
dispatchNow   stopCard      unblock       runEvents      diagnostics
attachments   reveal
attach        negotiates a MessagePort for the pty, never terminal data
event         broadcast, a discriminated union the renderer filters by slug
```

`attach` is registered with `ipcMain.handle` under its full channel name rather than through
`ctx.handle`, because it needs `event.sender` to hand the port back. `plugin-terminal` does the
same for the same reason, and it is the one sanctioned place a plugin writes the prefixed
channel name.

`moveCard` takes the card's `rev` and refuses on mismatch, which turns a stale optimistic move
into a refusal instead of a silent clobber.


## 5. Plugin-prefixed CSS, and why each rule exists

Every `dya-*` class the system has is used as-is; nothing here restyles one. What is left is
layout and the handful of things the system does not carry.

```text
RULE                        WHY
--------------------------  ------------------------------------------------------
.kanban [hidden]            THE SYSTEM HAS NO [hidden] RULE. The UA stylesheet's
                            `[hidden] { display: none }` loses to any class that
                            sets a display, so `.kanban-setup { display: flex }`
                            rendered a hidden element at full height. See section 6
.kanban-column              a column is a .dya-card; this is the flex column and
                            the fixed track width, nothing else
.kanban-scroll              the scroll area, on --dya-sunken so --dya-surface-1
                            cards read against it, ROUNDING ITS OWN bottom corners
                            so the column never needs overflow:hidden. An
                            overflow:hidden card becomes a scroll container and its
                            automatic minimum size collapses to zero
.kanban-indicator           the 2px insertion line. Absolutely positioned inside
                            the scroll element, as a SIBLING of the list, so it
                            shares the coordinate space of the measurements and no
                            scroll arithmetic is needed anywhere
.kanban-dot                 the status dot, following
                            packages/plugin-eforoi/src/styles.ts:203-213
.kanban-ghost               the dragged copy, at --dya-elev-overlay, matching what
                            the shell gives a dragged dockview group. It carries NO
                            transition: its transform is written every frame
.kanban-sr                  a screen-reader-only region for the live announcements.
                            The system has no such class. See section 6
.kanban-stage               the drawer's terminal band, on --dya-surface-1 because
                            xterm computes its own contrast and has to know what it
                            is drawing on
.xterm-viewport             xterm ships its own CSS, bundled as text and injected
                            ahead of this stylesheet. The three rules here make its
                            scrollbar and background match the system; they target
                            xterm's classes, not dya-* ones
```

`touch-action: none` sits on the whole card rather than on a grip. That disables touch panning
of a column that starts on a card, which is the correct trade for a desktop Electron app and
worse than the alternative with a mouse.

Contrast, measured with `py packages/kanon/tools/contrast.py`, on `--dya-surface-1`, where the
3.00 floor for a graphical object applies rather than 4.50:

```text
TOKEN        GI      ONEIRO   USED FOR
-----------  ------  -------  --------------------------------------------------
accent        5.85   12.51    running
accent-2      6.24   12.14    ready
accent-3      4.96    6.45    review
warning       8.43    8.62    blocked
success       9.47    9.69    done
idle          1.47    1.51    triage, todo, scheduled, archived
```

`--dya-idle` is below the floor and that is deliberate, following the same use in
`plugin-eforoi`: it is a surface token, it means "no outcome yet", and the state is already
carried by which column the card is in. The dot is a quiet anchor that lights up when
something is happening, not the primary signal.


## 6. Debts

The full register is [docs/open-problems.md](docs/open-problems.md). Two debts belong here
because they are about this plugin's relationship to the rest of the workspace rather than
about the board.

```text
DEBT                     WHY IT IS HERE
-----------------------  ---------------------------------------------------------
src/menu.ts is a COPY    `openMenu` exists only as a local function inside
of plugin-eforoi's       plugin-eforoi and is not exported by @dyarchia/sdk.
                         Promoting it is the better answer and is mechanically
                         cheap, since the SDK is consumed from source, but it edits
                         a sibling plugin and a feature branch here is one coherent
                         change. Promote later, in its own branch, touching both
                         consumers at once
Two standing requests    kanon's reset carries no [hidden] { display: none }, so
on kanon                 the UA rule loses to any class that sets a display and a
                         hidden element renders at full size with no error
                         anywhere; and it has no screen-reader-only class, so the
                         live region here is a prefixed .kanban-sr. Both are worked
                         around locally and both belong upstream
```
