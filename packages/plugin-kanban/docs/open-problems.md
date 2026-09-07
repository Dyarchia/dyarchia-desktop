# plugin-kanban: open problems

The register of what is wrong, missing or unproven, kept as state rather than as a diary.
[design.md](design.md) says what the plugin should be and records every measurement behind it;
this file says where the plugin is not that yet.

Rules for keeping it:

- An entry leaves this file only when it is done or deliberately dropped, and a dropped entry
  moves to section 5 with the reason. Nothing is deleted silently.
- Every entry names the file it lives in and what "done" looks like, so it can be picked up by
  someone with no memory of the session that found it.
- A problem found while building is written here the same day, before the commit that found it.


## Index

- [1. Open, in the order they would bite](#1-open-in-the-order-they-would-bite)
- [2. Surfaces the data model has and the panel does not](#2-surfaces-the-data-model-has-and-the-panel-does-not)
- [3. Unproven rather than broken](#3-unproven-rather-than-broken)
- [4. Standing requests on kanon](#4-standing-requests-on-kanon)
- [5. Deferred or dropped on purpose](#5-deferred-or-dropped-on-purpose)
- [6. Closed, and where the evidence is](#6-closed-and-where-the-evidence-is)


## 1. Open, in the order they would bite

### 1.1 Nothing prunes worktrees, attachments or temp workspaces

Three stores grow forever and nothing reclaims them.

```text
STORE                                        WHO CREATES IT        WHO REMOVES IT
-------------------------------------------  --------------------  --------------
<repo>/.claude/worktrees/kanban-<8>          every run on a git    NOBODY
                                             project
kanban/boards/<slug>/attachments/<cardId>/   every harvested run   NOBODY, not even
                                                                   deleteCard
<tmpdir>/dyarchia-kanban/<slug>/<cardId>/    every scratch run     only a COMPLETED
                                                                   scratch run
```

The worktree one is the sharpest: `claude rm` refuses a session whose worktree holds unmerged
commits, which is correct of it, so a board that runs fifty cards leaves fifty branches and
fifty working trees in the operator's repository. The board knows the branch, so it can say
which are landed and offer to remove those.

A worktree also lands *inside* the operator's checkout, at `.claude/worktrees/`, and that path
is not in dyarchia's `.gitignore`. A run on this repository therefore puts untracked files in
`git status` while it works, which is noise at best and something committed by accident at
worst.

Done looks like: `deleteCard` removes that card's attachments; a sweep removes temp workspaces
with no live card; the panel lists worktree branches with their merge state and can remove the
ones that are landed; and `.claude/` is ignored by any repository a board points at, which the
board can offer to do when it creates the board. Lives in `src/artifacts.ts`, `src/board.ts`
and `src/dispatch.ts`.

### 1.2 Every measurement on this machine was taken inside a package container

The shell used for every measurement in design.md section 5 runs inside the Claude desktop
app, which is an MSIX package, so its writes to `AppData\Roaming` are redirected into
`AppData\Local\Packages\Claude_<id>\LocalCache\Roaming\`. Verified by writing a marker through
one path and reading it back through the other.

This already produced one wrong conclusion. Section 5.11 originally said the CLI refuses any
working directory under AppData; the counter-example was in the transcript directory names all
along, where sessions had been running happily under
`AppData\Local\Packages\Claude_<id>\LocalCache\Roaming\dyarchia\...`. The section now says
what was observed and marks the cause unresolved.

Two things follow, and neither is urgent:

- **The scratch-workspace failure has no established cause.** The evidence points at a
  virtualization mismatch between the process that created the directory and the process that
  resolved it, not at a policy. It may not reproduce at all on a machine where dyarchia is
  launched normally. The fix stands on its own reasoning — a scratch workspace is a temporary
  directory and belongs in the temp directory — so nothing is blocked.
- **Every other AppData-shaped or path-shaped measurement is suspect** until re-taken outside
  the container, including anything about where userData really is.

Done looks like: the handful of path-dependent claims re-measured from a plainly launched
dyarchia, and section 5 annotated with which ones held.

### 1.3 A worker filing more than ten followups loses the rest in silence

`adopt` in `src/dispatch.ts` takes `followups.slice(0, 10)`. A worker that finds fifteen
problems has five dropped with nothing said anywhere. The cap is right; the silence is not.

Done looks like: the extras are named in a comment on the card, or the cap is lifted and the
board deals with the volume.

### 1.4 The transcript copy of section 7.2 does not exist

The design has two storage tiers: the board as one JSON file, and a JSONL per run that is "our
copy of transcript-derived events", which is what makes a run explicable after the CLI has
forgotten it. Only the first is built. The history tab reads the CLI's own transcript live, so
a run whose session is deleted, or whose transcript is rotated away by the CLI, loses its
history entirely.

The `runs/` directory this was going to live in was being created empty on every save and has
been removed until it is used.

Done looks like: the dispatcher tees what it parses into `kanban/boards/<slug>/runs/<runId>.jsonl`,
the history tab falls back to it, and it is rotated by size. Section 20 already lists
"the transcript copy grows without bound" as the risk to answer at the same time.

### 1.5 Two dyarchia processes would fight over one board

Section 13 asks for a single elected dispatcher with a lease. There is none. It does not bite
today because a plugin main module is imported once per app process, so one running dyarchia is
one dispatcher however many windows it has. A second copy of the app on the same machine would
be a second dispatcher on the same files, and both would claim.

Done looks like: a lease file next to the board with an expiry, stolen only when the holder is
verified dead. Cheap now, and the alternative is double-dispatching real work.

### 1.6 Errors are a single strip that the next error overwrites

`fail()` in `src/renderer.ts` writes the last error into one element. An error that happened on
a card is not attached to that card, and a second error erases the first. A run's `error` field
is shown in the drawer, but a refused move or a failed invoke is not.

Done looks like: the error belongs to the thing it happened to, and the strip is a summary of
what is currently wrong rather than a scratchpad.

### 1.7 The panel harness stopped covering the panel

`scripts/panel-harness.html` was written for phases 1 and 2 and still only fakes those
channels. It has no `card:progress`, no `run:ended`, no terminal and no history, so the drawer
paths added in phases 3 to 5 can only be exercised by running a real agent. That is slow and it
costs money, which means in practice they are exercised rarely.

Done looks like: the harness fakes a running card with progress events and canned transcript
rows, so the drawer, the tabs and the history renderer can be iterated on with no Electron and
no spend.


## 2. Surfaces the data model has and the panel does not

None of these is a bug. Each is a field or a channel that works over IPC and has no way to
reach it from the panel, which means it may as well not exist for the operator.

```text
WHAT                     WHERE IT LIVES              WHAT IS MISSING
-----------------------  --------------------------  ------------------------------
model, effort            Card, passed to the CLI     any control at all. Every card
                                                     runs on the default model
permissionMode           Card, defaults acceptEdits  the same. This is the one that
                                                     governs what an unattended
                                                     worker may do to a repository,
                                                     and it is per card BECAUSE it
                                                     should never be set globally
maxRuntimeSeconds        Card, enforced by the tick  no way to set the cap that the
                                                     dispatcher already honours
maxRetries               Card, drives the breaker    the same
workspaceKind            Card, scratch or dir        no way to choose scratch, so
                                                     the whole scratch path is
                                                     reachable only over IPC
workdir override         Card, per-card directory    the same
archiveBoard             channel, refuses while a    no button. A board cannot be
                         card is running             put away
updateBoard              channel, rename and         no button. A board cannot be
                         re-point                    renamed or moved
board deletion           NOT BUILT. 8.1 says real    neither channel nor button
                         deletion is a separate
                         confirmed action
```

Done looks like: a card settings group in the drawer for the per-card fields, and a board menu
that can rename, re-point, archive and delete. The permission mode is the one worth doing
first, because it is a safety control that currently cannot be exercised.


## 3. Unproven rather than broken

```text
WHAT                        WHY IT IS UNPROVEN
--------------------------  ----------------------------------------------------
The stall detector          Its thresholds are an hour of silence past a four
                            hour run. Only its guard conditions have been read;
                            it has never fired. Verifying it honestly means
                            either waiting or making the thresholds injectable
`sourcePhase` = 'review'    A card can only be blocked out of a run, and a run
                            only starts from ready, so the arm is written and
                            unreachable until an automatic reviewer exists
Two panels, two boards      Proven in phase 1, not retested since the dispatcher
                            landed. The isolation is per-slug and should hold,
                            but "should" is not "did"
Anything but Windows        Every measurement in design.md section 5 was made on
                            Windows 11 with a native claude.exe. The .cmd branch
                            in `invocation` has never run, and the AppData
                            refusal of 5.11 is a Windows-shaped finding whose
                            equivalent elsewhere is unknown
```


## 4. Standing requests on kanon

Both are recorded in the README as debts and belong upstream rather than here.

- **No `[hidden] { display: none }` in the reset.** The UA rule loses to any class that sets a
  display, so an element toggled with `.hidden` renders at full size with no error anywhere.
  Every plugin that toggles a flex or grid element will hit it. Worked around by a prefixed
  `.kanban [hidden]` rule.
- **No screen-reader-only class.** The live region here is a prefixed `.kanban-sr`.


## 5. Deferred or dropped on purpose

```text
Inbound attachments      2.1 wants files bound to a card and handed to the worker as
                         absolute paths. Only run-produced artifacts are built. Deferred,
                         and worth doing before goal mode
Automatic reviewer       2.5, deferred. Approve and request-changes are manual buttons
Goal mode                2.5, phase 6
Auto-decompose           2.5, phase 6
Swarm                    2.8, phase 7, and it should NOT be built next: over a single
                         executor a swarm is a card-creation macro. It is worth having
                         only once worker diversity exists, which is section 21
A dollar figure          10.2. There is no cost in USD anywhere in a transcript, so the
                         card shows tokens and calls them tokens. A priced estimate can
                         come back later, labelled as an estimate, with a versioned price
                         table beside it
The executor abstraction 21.5. Deliberately not built. Keep Claude-specific knowledge in
                         agents.ts and worker.ts and extract an interface from two real
                         implementations, not one
```


## 6. Closed, and where the evidence is

Kept so nobody re-opens them or, worse, re-derives them.

```text
PROBLEM                                      CLOSED BY               RECORDED IN
-------------------------------------------  ----------------------  -------------
--bg ignores --session-id                    a launch handshake      design.md 5.6, 7.3
No {"type":"result"} record in a transcript  a rebuilt ladder        design.md 5.6, 11
No cost in USD                               tokens, honestly named  design.md 5.6, 10.2
A background session cannot edit its own     launching with -w       design.md 5.7
checkout
The brief file was itself a permission       the brief goes inline   design.md 5.8
prompt
Workers inherited the parent session's       stripped at spawn       design.md 5.9
environment and came up "not logged in"
state 'blocked' also means "finished, and    a declared terminal     design.md 5.10
waiting on you", so cards stayed running     block outranks liveness
A scratch workspace under userData could     scratch workspaces      design.md 5.11
not be launched into                         moved to tmpdir. The       and 1.2 above
                                             CAUSE is still open
A finished session holds its workspace open  stop, then retry the    design.md 5.11
                                             removal
createCard accepted any slug and created a   every card channel      commit 2784ca7
board the registry had never heard of        resolves the board
The drawer mounted xterm on a detached node  open after the drawer   commit 2784ca7
and rendered 36 empty rows                   is in the document
A fit() guard read `port` from its temporal  declare it first        commit 2784ca7
dead zone and threw silently
The optimistic move mutated the card object  a separate map          commit 0110b14
kanon has no [hidden] rule, so a hidden      a prefixed rule         README, section 4
setup form rendered at full height           of this file
```
