# costs

What every prompt to Claude Code cost, prompt by prompt, following a session while it runs.

Claude Code writes each session to `~/.claude/projects/<folder>/<session>.jsonl`, one JSON
line per event. This panel reads those files and nothing else: a user prompt opens a row, every
assistant line adds the tokens of the request it belongs to, and the row closes when the model
stops. The left list holds every session touched in the last fourteen days, newest first, with a
green dot on one that wrote in the last thirty seconds and has a prompt still open.

```text
Column        Meaning
-----------   -----------------------------------------------------------------
prompt        the first 160 characters of what was typed
at, took      when it was sent and how long until the model stopped
requests      API requests the turn made; one per model call, tools included
input         uncached input tokens
cache read    input served from the prompt cache, a tenth of the input price
cache write   input written to the cache, 1.25 times input for a five-minute
              entry and twice input for a one-hour one
output        output tokens, five times the input price
usd           the row's cost
```

## Exact or estimated

A background session (`claude --bg`) and a print run (`claude -p`) close with a `cost-state`
line holding the figure the CLI computed, and the panel shows that figure and says so. An
interactive session carries no such line, so its cost is tokens times a price table and is
shown with a tilde. The table holds the published input, output and cache-read price per model
family; cache write is not a row of its own, because it is a multiple of input and the multiple
depends on the lifetime the entry asked for. An assistant line carries that split in
`usage.cache_creation`, and Claude Code writes every entry at one hour, so a single cache-write
rate cannot reproduce the CLI's own figure — pricing the two lifetimes apart is what closes the
gap.

Measured on 2026-09-17 against the forty-two sessions on this machine that carry a cost-state
line, by driving the built plugin and comparing its estimate to that figure:

```text
                                   median error   sessions exact to 4 dp
--------------------------------   ------------   ----------------------
one cache-write rate                      29.9%                        0
five-minute and one-hour apart             0.0%                    24/37
```

The estimate is not an approximation of those twenty-four figures, it is the formula that
produced them. What still diverges is the compacted sessions, where what the transcript holds
and what the turn was billed stop being the same thing, and transcripts written before the
lifetime split existed, whose writes are priced at the five-minute rate. A model the table does
not name gets the opus row, and `<synthetic>` — the CLI's own placeholder — is never billed. On
a subscription none of this is a bill: it is the usage window being spent, at the price the API
would charge.

## Verification

There is no test suite. `npx tsc -p plugins/costs` typechecks; the panel is verified by opening
it beside a running session and watching the row grow. The files are read incrementally from
the offset last reached, so a session transcript of a hundred megabytes costs the panel only
what was appended since the previous look.
