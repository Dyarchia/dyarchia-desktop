# plugin-kanban: open problems

The register of what is wrong, missing or unproven, kept as state rather than as a diary.
[design.md](design.md) says what the plugin should be and records every measurement behind it;
this file says where the plugin is not that yet.

Rules for keeping it:

- An entry leaves this file only when it is done or deliberately dropped, and a dropped entry
  moves to section 4 with the reason. Nothing is deleted silently.
- Every entry names the file it lives in and what "done" looks like, so it can be picked up by
  someone with no memory of the session that found it.
- A problem found while building is written here the same day, before the commit that found it.


## Index

- [1. Open, in the order they would bite](#1-open-in-the-order-they-would-bite)
- [2. Unproven rather than broken](#2-unproven-rather-than-broken)
- [3. Standing requests on kanon](#3-standing-requests-on-kanon)
- [4. Deferred or dropped on purpose](#4-deferred-or-dropped-on-purpose)
- [5. Closed, and where the evidence is](#5-closed-and-where-the-evidence-is)


## 1. Open, in the order they would bite

Two, both from the verdict-route proof of 2026-09-10 (second run of that day).

### 1.1 A review in plan mode stalls on an execution bundled into a read

`worker.ts`, `reviewBrief` and `REVIEW_MODE`, and design.md 10.6.1, which says why reviews are
pinned to `plan`. Done when an unattended review cannot be stopped by reaching for an
execution, AND the design says in writing which route was taken. The route has not been
chosen, which is what makes this open rather than merely unfixed.

Reviews are forced into plan mode so they can read the branch without stopping for permission,
and that part works: a real reviewer walked `git diff`, `git log`, `git show`, `ls` and `Read`
untouched. It then stopped dead on one compound command:

```text
cd <repo> && git log --all --oneline -- package.json && echo --- && git show da44159 --stat
    && echo --- && node -e "console.log(process.version)" 2>&1; node --version 2>&1
```

Plan mode gates on "is this an execution", not on "is this harmful", so a harmless version
probe bundled into an otherwise read-only command stalls the whole review. The brief's prose
already warns a reviewer against running things; the prose did not prevent it, and the reviewer
was arguably not even disobeying, since asking node its version is not running the tests.

Three reviews stalled on three different commands and only the first contained anything
executable. The third, session 1d75babf, stopped on two `git show` calls with an `echo`
fallback, which executes nothing: plan mode cannot prove that a compound expression carrying
`||` and a subshell is read-only, so it asks. Fixing the brief cannot close this. See
design.md 5.15.

With a person attached it costs one keystroke. Unattended, which is the case this plugin exists
for, the review waits for nobody and nothing underneath it reclaims the card. The stall detector
fires only while `state` is 'working' and a worker stopped at a prompt reads 'blocked', which
liveness calls ALIVE and which extends the claim. The card's runtime cap would end it and is
unset by default, so the card stays in `running` for as long as the board runs.

The cheap route does not work as written. A repository can pre-authorise commands in its own
`.claude/settings.json`, but rules spelled `Bash(git commit:*)` never match on Windows, because
the worker reaches for the PowerShell tool instead. Measured 2026-09-10: `node`, `git status`,
`git add` and `git commit` were all requested through PowerShell, all four were covered by a
`Bash(...)` allowlist on paper, and none was covered in fact.

### 1.2 The card drawer can strand the operator with no way back in view

`renderer.ts`, the drawer head, and `styles.ts`, where `.kanban-drawer-body` sets `overflow-y`
and nothing horizontal. Done when the tab strip and the close control stay reachable however
wide the drawer content gets. The fix belongs to a different branch; this entry is here so that
branch has the reproduction.

Reported by the operator, 2026-09-10: with a wide window and the card drawer open on the
`board` tab, the drawer content overflows horizontally and the tab strip falls out of view.
Every way back still exists, the terminal, history and board tabs and the panel's own close
control, and none of them was on screen. The operator stayed stuck until the tab was switched
for them from outside.

## 2. Unproven rather than broken

```text
WHAT                        WHY IT IS UNPROVEN
--------------------------  ----------------------------------------------------
The stall detector, the     Its DECISION is proven and its thresholds are now
wiring rather than the      injectable, see section 5. What no run has exercised
decision                    is the wiring around it: that `reconcile` calls
                            `claude stop`, closes the run as `stopped`, blocks
                            the card as `transient` and sends it back to the
                            phase it came from. Reaching that honestly still
                            means a real run silent for an hour past four hours
                            of life, or a card given a short `maxRuntimeSeconds`,
                            which enters the same branch through `overran` and is
                            the cheaper way in
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
                            turn now closed in section 5. The second was told,
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
                            is recorded in section 5 rather than resented here
The watch view against      Verified in the panel harness, over fake boards, and
real boards                 the channel it reads answers correctly against a real
                            one. Nobody has watched it with two REAL boards busy
                            at once, which is the case its arithmetic is for
Two panels, two boards      Proven in phase 1, not retested since the dispatcher
                            landed. The isolation is per-slug and should hold,
                            but "should" is not "did"
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


## 4. Deferred or dropped on purpose

```text
Automatic reviewer       2.5, still deferred, but narrower since 2026-09-09: a reviewer
                         can be asked for with a button, and what stays unbuilt is the
                         board-level setting that would spend one on every completed
                         run. design.md 10.6.4 says why it waits for the manual path to
                         be watched working
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
A board-side commit      BUILT, MEASURED WORKING, AND REMOVED. A run that finishes with
                         uncommitted work leaves an empty branch, and the dispatcher was
                         committing it. The worktree, the session and the branch are the
                         CLI's, the agent runs in Claude Code, and a board that quietly
                         commits in the operator's repository is doing somebody else's job.
                         Nothing is lost by declining: neither the plugin nor `claude rm`
                         removes a dirty worktree, so the work stays and the board says so.
                         design.md 5.7
The transcript copy      7.2 promised a JSONL per run, our own copy of transcript-derived
                         events, so a run stayed explicable after the CLI forgot its
                         session. Dropped: Claude Code already keeps that file, and a
                         second transcript store is the board doing the runtime's job.
                         The card keeps the run row, which is what a board knows, and the
                         history tab reads the CLI's file live. design.md 7.2 and 14.3
The last AppData         Whether the CLI accepts a working directory under userData when
question                 both the process that creates it and the one that resolves it are
                         outside a package container. It cannot be measured from these
                         sessions, nothing in the plugin depends on it since scratch
                         workspaces live in tmpdir, and it was being carried in section 1
                         as if it were work. design.md 5.11 keeps the OPEN line
```


## 5. Closed, and where the evidence is

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
not be launched into                         moved to tmpdir. The       and section 4
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
```
