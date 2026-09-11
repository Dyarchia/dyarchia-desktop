# plugin-kanban: open problems

The register of what is wrong, missing or unproven. Anything found while building goes here
before the commit that found it, and nothing leaves it silently. What has been closed lives in
the commit that closed it, not here.


## 1. Open

### 1.1 No permission mode runs an implementation unattended

`worker.ts`, `agents.ts` and the launch. Done when a card can be claimed, worked and finished
with nobody watching, or when the design says in writing that it cannot and what the operator is
expected to do instead.

A reviewer was fixed by taking its shell away, because a reviewer only has to read. **An
implementer has to write, and every mode measured either refuses to start, refuses everything, or
stops to ask:**

```text
bypassPermissions   will not launch under --bg without a one-time interactive disclaimer
dontAsk             launches, then denies every edit and every command automatically
acceptEdits         stops for a person on every command
auto                stops for a person on every file edit. Measured 2026-09-11 on two
                    boards at once: both workers stopped on an ordinary edit approval
manual              not measured, and there is no reason to expect better
```

A card nobody is watching therefore sits at a prompt. A session at a prompt reads `blocked`,
`stalled` refuses anything that is not `working`, and the runtime cap is unset by default, so
nothing reclaims it. The board says "waiting on you", which is correct and is not a fix.

This is the strongest argument for moving workers onto real agent definitions with hooks, which
`claude --agents <json>` allows without writing into the operator's repository: a `PreToolUse`
hook can answer on the operator's rules instead of stopping. **One cheap measurement is needed
first: whether a hook denial ends the turn the way an operator's denial does.** If it does, hooks
would kill reviews more reliably rather than less, and the design has to know that before leaning
on them.


## 2. Unproven rather than broken

```text
WHAT                        WHY IT IS UNPROVEN
--------------------------  ----------------------------------------------------
The stall detector, only    The decision is proven, the thresholds are injectable
the silence half            and the branch it feeds has run against a live agent:
                            a real runtime cap stopped a real review on
                            2026-09-10. What remains is narrow — `stalled`
                            returning true on a real run, which needs one silent
                            for an hour past four hours of life. `overran`
                            reaches the same branch and has already done it
Reviewing without a shell   Built 2026-09-11: the board runs the diff and Bash and
                            PowerShell are denied to a review. Nine probe checks
                            cover the brief, including the empty diff, the missing
                            diff and the patch too large to inline. No run has
                            JUDGED under it. Watch two things the first time one
                            does: whether a reviewer with Read and Grep but no
                            shell still reads around the change enough to be worth
                            having, and whether it reaches the end without stalling
The `changes` verdict       Three of the four verdict routes are proven. `changes`
                            is the one no run has exercised and the one that
                            matters most: it is the loop that turns a review into
                            the next implementer's brief. It cannot be reached by
                            scripting a reviewer — one was told in its card body to
                            declare `changes` whatever it concluded, refused, judged
                            the work on its merits and declared `approved`,
                            correctly. Proving it needs a branch carrying real
                            deficient work for a real reviewer to reject. A reviewer
                            that will not declare a verdict it does not hold is a
                            property worth having, not a defect
Two panels, two boards      Proven in phase 1, not retested since the dispatcher
                            landed. The isolation is per-slug and should hold, but
                            "should" is not "did"
The last AppData question   Whether the CLI accepts a working directory under
                            userData when both the process that creates it and the
                            one that resolves it are outside a package container.
                            It cannot be measured from these sessions and nothing
                            depends on it, since scratch workspaces live in tmpdir
Anything but Windows        Every measured fact was taken on Windows 11 with a
                            native claude.exe. The .cmd branch in `invocation` has
                            never run, and the AppData refusal is a Windows-shaped
                            finding whose equivalent elsewhere is unknown
```


## 3. Standing requests on kanon

- **A screen-reader-only class.** The live region here is a prefixed `.kanban-sr`.

The `[hidden]` request was shipped in kanon on 2026-09-11 and the local workaround is gone.
