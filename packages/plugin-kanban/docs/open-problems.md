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

**"A reviewer does not edit" is enforced by the brief and by nothing else.** A review run
inherits the card's permission mode, which defaults to `acceptEdits`, and it runs in the
operator's own checkout rather than in a worktree. The brief tells it to read and judge; a
model that decides to fix what it found can.

- `plan` is already one of the modes a card can carry, so the CLI takes it, and it is the
  mechanism that would make the sentence true rather than polite.
- What is NOT known is whether a `--bg` session in plan mode finishes a judgement or stalls
  asking to leave plan mode. Nothing here has measured it, and a reviewer that stalls is worse
  than a reviewer that could have edited.
- **Done looks like** that measurement, and then either launching reviews in `plan` or writing
  down why not. `worker.start`, the `reviewing` branch.

## 2. Unproven rather than broken

```text
WHAT                        WHY IT IS UNPROVEN
--------------------------  ----------------------------------------------------
The stall detector          Its thresholds are an hour of silence past a four
                            hour run. Only its guard conditions have been read;
                            it has never fired. Verifying it honestly means
                            either waiting or making the thresholds injectable
`sourcePhase` = 'review'    Reachable since 2026-09-09: a review run that blocks
                            sets it, and unblock returns the card to review. Written
                            and read, never yet fired by a real reviewer
The verdict path            The probe covers the parser and the brief. The four
                            routes of design.md 10.6.3 are read but not exercised:
                            `resolveReview` needs a board, a sink and a transcript
                            to drive, and no real reviewer has judged a real branch
                            yet. Proving it means a card that completes in a
                            worktree and the drawer's third button
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
not be launched into                         moved to tmpdir. The       and 1.2 above
                                             CAUSE is still open
A finished session holds its workspace open  stop, then retry the    design.md 5.11
                                             removal
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
```
