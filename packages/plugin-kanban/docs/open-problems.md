# plugin-kanban: open problems

The register of what is wrong, missing or unproven, kept as state rather than as a diary.
[design.md](design.md) says what the plugin should be and records every measurement behind it;
this file says where the plugin is not that yet.

Rules for keeping it:

- An entry leaves this file only when it is done, and it leaves into section 4 with the
  evidence. Nothing is deleted silently. This file records what IS, not what was decided
  against: a feature nobody built needs no row, and the reason a feature was declined belongs
  in design.md beside the design it declines.
- Every entry names the file it lives in and what "done" looks like, so it can be picked up by
  someone with no memory of the session that found it.
- A problem found while building is written here the same day, before the commit that found it.


## Index

- [1. Open, in the order they would bite](#1-open-in-the-order-they-would-bite)
- [2. Unproven rather than broken](#2-unproven-rather-than-broken)
- [3. Standing requests on kanon](#3-standing-requests-on-kanon)
- [4. Closed, and where the evidence is](#4-closed-and-where-the-evidence-is)


## 1. Open, in the order they would bite

One. The review that stalled in plan mode was closed on 2026-09-11 by taking the shell away
from reviewers and handing them the diff; its evidence is in section 4 and the reasoning is in
design.md 10.6.1. What that fix did NOT touch is the same failure seen from the implementer's
side, which is the entry below.

### 1.1 No permission mode runs an implementation unattended

`worker.ts` and `agents.ts`, the launch, and design.md 5.14 which carries the measurements.
Done when a card can be claimed, worked and finished with nobody watching, or when the design
says in writing that it cannot and what the operator is expected to do instead.

A reviewer could be fixed by taking its shell away, because a reviewer only has to read. An
implementer has to write, and every mode measured either refuses to start, refuses everything,
or stops to ask:

```text
bypassPermissions   will not launch under --bg without a one-time interactive disclaimer
dontAsk             launches, then denies every edit and every command automatically
acceptEdits         stops for a person on every command
auto                stops for a person on every file edit. Measured 2026-09-11 on two
                    boards at once: both workers stopped on an ordinary edit approval
manual              not measured, and there is no reason to expect better
```

So a card nobody is watching sits at a prompt. What happens to it after that is 5.10 and 12.2:
a session at a prompt reads `blocked`, `stalled` refuses anything that is not `working`, and
the runtime cap is unset by default, so nothing reclaims it. The board notices and says
"waiting on you", which is correct and is not a fix.

This is the strongest argument for the thing the reviewer fix stopped short of: moving the
workers onto real agent definitions with hooks, which `claude --agents <json>` allows without
writing anything into the operator's repository. A `PreToolUse` hook can answer on the rules
the operator sets instead of stopping. **One measurement is needed before committing to that,
and it is cheap: whether a hook denial ends the turn the way an operator's denial does.** If it
does, hooks would kill reviews more reliably rather than less, and the design has to know that
before it leans on them.

## 2. Unproven rather than broken

```text
WHAT                        WHY IT IS UNPROVEN
--------------------------  ----------------------------------------------------
The stall detector, only    Its DECISION is proven and its thresholds are now
the silence half of it      injectable, see section 4. The BRANCH it feeds is
                            proven too, and was before today: a real runtime cap
                            stopped a real review on 2026-09-10, which is how the
                            routing hole of design.md 10.6.6 was found. So
                            `claude stop`, closing the run as `stopped`, blocking
                            as `transient` and asking `home(run)` have all run
                            against a live agent. What remains unexercised is
                            narrow: `stalled` returning true on a real run, which
                            needs one silent for an hour past four hours of life.
                            `overran` reaches the same branch and has already
                            done it
Reviewing without a shell   Decided and built on 2026-09-11: the board runs the diff
                            and `Bash` and `PowerShell` are denied to a review. Nine
                            probe checks cover the brief it produces, including the
                            empty diff, the missing diff and the patch too large to
                            inline. What no run has done is JUDGE under it. Two
                            things are worth watching the first time one does:
                            whether a reviewer with `Read` and `Grep` but no shell
                            still reads around the change enough to be worth having,
                            and whether it now reaches the end without stalling,
                            which is the whole point
The `changes` verdict       THREE OF THE FOUR ROUTES OF 10.6.3 ARE PROVEN.
                            `approved` landed a card in done earlier on
                            2026-09-10; the blocked route and the review that
                            declares no verdict were both proven by the second
                            run of that day. `changes` is the one route no run
                            has exercised, and it is the one that matters most:
                            it is the loop that turns a review into the next
                            implementer's brief. Why it is still unexercised
                            matters more than a tidy row, and the two attempts
                            failed for different reasons. The first review died
                            before declaring anything, killed by the undeclared
                            turn now closed in section 4. The second was told,
                            in the card body, to declare `changes` whatever it
                            concluded; it refused, judged the work on its merits
                            and declared `approved`, correctly, because the work
                            was right. Commit c017881 on a worktree branch is
                            that work. So the route cannot be reached by
                            scripting a reviewer: proving it needs a branch
                            carrying real deficient work for a real reviewer to
                            reject, and that is the shape the next attempt has
                            to take. A reviewer that will not declare a verdict
                            it does not hold is a property worth having, and it
                            is recorded in section 4 rather than resented here
Two panels, two boards      Proven in phase 1, not retested since the dispatcher
                            landed. The isolation is per-slug and should hold,
                            but "should" is not "did"
The last AppData question   Whether the CLI accepts a working directory under userData
                            when both the process that creates it and the one that
                            resolves it are outside a package container. It cannot be
                            measured from these sessions and nothing depends on it,
                            since scratch workspaces live in tmpdir. design.md 5.11
                            keeps the OPEN line
Anything but Windows        Every measurement in design.md section 5 was made on
                            Windows 11 with a native claude.exe. The .cmd branch
                            in `invocation` has never run, and the AppData
                            refusal of 5.11 is a Windows-shaped finding whose
                            equivalent elsewhere is unknown
```


## 3. Standing requests on kanon

Both are recorded in the README as debts and belong upstream rather than here.

- **No `[hidden] { display: none }` in the reset.** The UA rule loses to any class that sets a
  display, so an element toggled with `.hidden` renders at full size with no error anywhere.
  Every plugin that toggles a flex or grid element will hit it. Worked around by a prefixed
  `.kanban [hidden]` rule.
- **No screen-reader-only class.** The live region here is a prefixed `.kanban-sr`.


## 4. Closed, and where the evidence is

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
not be launched into                         moved to tmpdir. The       and section 2
                                             CAUSE is still open
A finished session holds its workspace open  stop, then retry the    design.md 5.11
                                             removal
A pane attached to a session mid-turn        the terminal says so    README section 5
drew nothing and read as a broken            after a second and a
terminal on a card that said it was          half of silence, and
running                                      resets on the first
                                             byte
A background session in plan mode might      it ends with a          design.md 10.6.1
have ended by proposing a plan rather        verdict. Measured
than by judging, which the board would       2026-09-10: approved
have called a protocol violation             in 56s, and it filed
                                             a followup nobody
                                             asked for
A sweep landing inside the first seconds     a run younger than      design.md 10.6.6
of a run read "not in the agents list" as    20s that is merely
dead and closed a healthy session as         absent is left for
crashed. A worktree hid it for a year;       the next tick
a review has none
An auth failure lands in run.summary and     `guarded` reads both    design.md 12.3
the respawn guard only read run.error, so    fields, and knows the
a busy credential looked like an exhausted   refresh message. Two
capability                                   Claude Code processes
                                             CAN contend on one
                                             token refresh; that is
                                             the shape it takes
A review under acceptEdits stopped for       reviews launch in       design.md 10.6.1
permission on its first git diff and was     `plan`, always
killed by the cap having judged nothing
A stopped review sent the card back to       both callers ask        design.md 10.6.6
ready, where an implementer would claim      `home(run)`
it and the review would be lost
A review run starts outside the per-board    the caps became         design.md 13
cap, and nothing said whether that was a     settable, and the       and 10.6.6
decision or an accident                      decision is written
                                             into the form: caps
                                             bind the dispatcher's
                                             claim, not the hand
createCard accepted any slug and created a   every card channel      commit 2784ca7
board the registry had never heard of        resolves the board
The drawer mounted xterm on a detached node  open after the drawer   commit 2784ca7
and rendered 36 empty rows                   is in the document
A fit() guard read `port` from its temporal  declare it first        commit 2784ca7
dead zone and threw silently
The optimistic move mutated the card object  a separate map          commit 0110b14
kanon has no [hidden] rule, so a hidden      a prefixed rule         README, section 4
setup form rendered at full height           of this file
The harness covered phases 1 and 2 only,     a faked dispatcher,     README, section 2
so the drawer could only be exercised by a   pty, transcript and
real agent                                   diagnostics
Attachments and temp workspaces were         deleteCard takes both,  design.md 8.3
created by every run and removed by          and a prune sweep on
nobody                                       the tick takes the rest
Fifty runs left fifty worktrees, with        a worktrees menu with   design.md 8.3
nothing that could even name them            merge state, removing
                                             only what landed
.claude/worktrees put untracked files in     an offer to write it    design.md 8.3
the operator's git status                    into .git/info/exclude
                                             rather than into a
                                             tracked .gitignore,
                                             with a comment naming
                                             the writer. Run
                                             against a real
                                             repository for the
                                             first time 2026-09-10
worktree remove succeeded before branch      the landed check moved  src/worktrees.ts
-d refused, so an unlanded branch could      inside worktrees.remove
lose its working tree
A run filing more than ten followups lost    the extras are named    probe, 4 checks
the rest in silence                          in a comment on the
                                             card
A stopped session read as alive, so a        liveness answers from   design.md 5.13
stopped card sat in running for ever         two measured sets, and
                                             'unknown' otherwise
A card could not carry its own source        files attached to a     design.md 2.1
material: only run-produced artifacts        card, handed to the
existed                                      worker by absolute path
One strip took every error and the next      an error belongs to     design.md 16.1.1
one erased it                                the card it happened
                                             to; the strip counts
Two copies of the app were two dispatchers   a lease renewed every   design.md 13
on the same board files                      tick, taken only when
                                             it is three ticks stale
A pty that never started said nothing:       attach waits for the    src/main.ts
the host's 'failed' reply had no listener    host's own answer
A completed run left an EMPTY branch:        the brief says COMMIT,   design.md 5.7
nothing told the worker to commit, and       and the board commits
acceptEdits will not let it run the          what a completed run
command anyway                               left behind
Removal could not work: the CLI locks        unlock first, and       design.md 5.7
every worktree it makes, and a dirty one     refuse a dirty tree
would have thrown away the work
Nine fields and channels the data model      a settings group in     README, section 1
had and the panel had no way to reach,       the drawer and a board
including the permission mode, which is      settings view with
a safety control                             rename, re-point,
                                             archive and delete
A turn that ended without declaring left     reconcile reads a       design.md 5.10
the card in running for ever. Saying no to   finished turn,          src/dispatch.ts
an agent, the ordinary use of this           progress.ended ===
feature, pins the card; it is not a          true, where it read
misconfiguration. Measured 2026-09-10,       a terminal block AND
session 79bd31da, where the OPERATOR         a finished turn.
denied a tool use from the drawer            resolve already read
terminal. The transcript records, at one     the block first and
instant, 'User rejected tool use', then      falls through to the
'[Request interrupted by user for tool       violation path, so it
use]', then a turn_duration entry. The       was not touched
denial ENDED THE TURN: the reviewer
declared nothing, the card stayed running
and locked, and claude agents --json
reported state 'working' with status
'idle'
updateCard dropped patches its own type      a PATCHABLE set of      src/board.ts
advertised, and returned the card as if      the twelve fields it    src/types.ts
they had landed. Two attempts to reset       really applies gates
the counters on card A were reported         the patch, and any
successful, and the card then blocked on     other key throws a
three violations that were supposed to       Refusal naming the
have been cleared                            strays. CardPatch
                                             narrowed to
                                             Partial<Pick<Card,
                                             ...>> over the same
                                             twelve, so the type
                                             promises no more
An expected refusal was logged like a        a refusal contract.     src/refusal.ts
crash: the guard refusing to patch a card    Refusal carries the     apps/shell
with a live worker still printed 'Error      property
occurred in handler for                      dyarchiaRefusal =
plugin:kanban:updateCard' with a stack,      true, 53 deliberate
so an operator watching the console could    throws became it, the
not tell a working guard from a fault        shell returns the
                                             value
                                             { __dyarchiaRefused:
                                             message } instead of
                                             throwing, and preload
                                             unwraps and rethrows a
                                             plain Error so every
                                             renderer call site is
                                             unchanged. The
                                             PROPERTY, not
                                             instanceof, because
                                             the plugin main module
                                             is bundled apart from
                                             the shell. main.ts's
                                             attach channel
                                             registers on ipcMain
                                             itself, for the
                                             MessagePorts, and is
                                             wrapped by a local
                                             refusable helper
Whether updateCard refusing every patch      the right answer.       src/board.ts
while a card has a live worker was an        Measured 2026-09-10     design.md 13
obstacle or the right answer had been        against a real board:
decided on paper only                        the guard held, and
                                             the operator steered
                                             with board priorities
                                             and a cap of 0, which
                                             pauses the board, to
                                             stop the dispatcher
                                             re-claiming a card
                                             between the read and
                                             the patch
Nothing had shown two workers running at     measured 2026-09-10: a  design.md 13
once on ONE board; the isolation that was    review of one card and
proven was between two boards                an implementation of
                                             another ran together
                                             on one board without
                                             interfering. TWO
                                             BOARDS at once stays
                                             unproven, in section 2
The card drawer grew past its own            `min-width: 0` on the   README section 5
flex-basis until the tab strip and the       drawer. Reproduced in
close control left the screen, stranding     the panel harness
the operator with every way out still in     2026-09-11: one 406
the DOM                                      character event detail
                                             took it 329px to
                                             2390px and the board
                                             to 24px. `.kanban-board`
                                             already had the guard
The stall detector could not be tested       `overran` and           design.md 12.2
without waiting five hours, so only its      `stalled` are pure
guard conditions had ever been read          and exported, and
                                             `stalled` takes its
                                             thresholds, so the
                                             probe can make it fire
                                             in microseconds. Eleven
                                             checks, 2026-09-11,
                                             each verified able to
                                             fail. The WIRING is
                                             still unproven, in
                                             section 2
The watch view had only ever been seen       measured 2026-09-11:    design.md 13
over fake boards; its arithmetic is for      two boards, one card
the case of several real ones busy at        each, both running at
once                                         once. It read "2
                                             running of 2", gave
                                             each board its own
                                             1/1 line, listed both
                                             runs under RUNNING NOW
                                             with their ages and
                                             token counts, and
                                             surfaced the one that
                                             had stopped for
                                             permission under
                                             PROBLEMS
`writeAtomic` used a fixed scratch name,     a per path write queue  design.md 8.3
`<path>.tmp`, so two overlapping writes      inside the process,
to one file shared it. Found 2026-09-11      plus a unique scratch
by an EPERM on renaming boards.json,         name for the writers
which left an orphan .tmp on disk. EPERM     another process cannot
was the lucky outcome: had both renames      see. The probe drives
landed, one writer's content would have      eight at once. The
been lost in silence                         CROSS PROCESS case is
                                             what the lease is for
                                             and the probe cannot
                                             reach it
A review in plan mode stalled on any         the board runs the      design.md 10.6.1
compound shell command it could not          diff and hands it       and 5.15
prove was read-only. Three stalled on        over; `Bash` and
three different commands and only the        `PowerShell` are
first contained anything executable          denied. A reviewer
                                             needs the change, not
                                             a shell. It keeps
                                             Read, Glob and Grep.
                                             Judging under it is
                                             unproven, in section 2
The board committed a run's uncommitted      REMOVED on purpose      design.md 5.7
work for it, so a finished run never         after being built and
left an empty branch. Built, measured        measured working. The
working, and taken out again                 worktree, the session
                                             and the branch are the
                                             CLI's, and a board
                                             that quietly commits
                                             in the operator's
                                             repository is doing
                                             somebody else's job.
                                             Nothing is lost: a
                                             dirty worktree is
                                             removed by neither the
                                             plugin nor `claude
                                             rm`, so the work stays
                                             and the board says so
A second transcript store, one JSONL per     DROPPED. Claude Code    design.md 7.2
run, was promised so a run stayed            already keeps that      and 14.3
explicable after the CLI forgot its          file. The card keeps
session                                      the run row, which is
                                             what a board knows,
                                             and the history tab
                                             reads the CLI's file
                                             live
```
