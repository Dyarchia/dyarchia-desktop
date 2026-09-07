# @dyarchia/plugin-kanban

A task board that dispatches work to Claude Code and lets the operator watch the agent work
and talk to it while it does.

[docs/design.md](docs/design.md) is the design authority. It is self-contained: capability
inventory, data model, state machine, worker contract, failure taxonomy, and the measurements
behind every claim about the Claude Code CLI. Read it before changing anything here.


## Index

- [1. What is built](#1-what-is-built)
- [2. Build and verify](#2-build-and-verify)
- [3. Storage](#3-storage)
- [4. IPC](#4-ipc)
- [5. Plugin-prefixed CSS, and why each rule exists](#5-plugin-prefixed-css-and-why-each-rule-exists)
- [6. Debts](#6-debts)


## 1. What is built

Phases 0 to 2 of the design's section 18.

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
Dispatch                 NOT YET. Phase 3
```

There is deliberately no way to move a card to `done` by hand. `done` means a worker finished,
and until phase 3 there are no workers. See section 9 of the design.


## 2. Build and verify

```bash
pnpm --filter @dyarchia/plugin-kanban build
```

```bash
npx tsc -p packages/plugin-kanban
```

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
kanban/boards.json                       the registry
kanban/boards/<slug>/board.json          that board's cards
kanban/boards/<slug>/board.bak.<n>.json  three rotated copies, newest is 0
kanban/boards/<slug>/runs/               transcript-derived events, phase 3
```

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
event         broadcast, a discriminated union the renderer filters by slug
```

`moveCard` takes the card's `rev` and refuses on mismatch, which turns a stale optimistic move
into a refusal instead of a silent clobber.


## 5. Plugin-prefixed CSS, and why each rule exists

Every `dya-*` class the system has is used as-is; nothing here restyles one. What is left is
layout and four things the system does not carry.

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
No [hidden] rule in      A standing request, alongside the .dya-button--bare
kanon's reset            already recorded in this repo's CLAUDE.md. Every plugin
                         that sets a display on a class it also toggles with
                         `hidden` will hit this, silently
No screen-reader-only    The same standing request. The live region here is a
class in kanon           prefixed .kanban-sr until the system carries one
```
