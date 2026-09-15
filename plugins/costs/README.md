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
cache write   input written to the cache, 1.25 times the input price
output        output tokens, five times the input price
usd           the row's cost
```

## Exact or estimated

A background session (`claude --bg`) and a print run (`claude -p`) close with a `cost-state`
line holding the figure the CLI computed, and the panel shows that figure and says so. An
interactive session carries no such line, so its cost is tokens times a price table and is
shown with a tilde. The table holds one input price per model family, with the output and cache
multipliers every Anthropic price list shares; the values were fitted to the cost lines of fifty
sessions on one machine on 2026-09-15 and are exact for opus-5, within a third for the others,
and a guess for a model the table does not name. On a subscription none of this is a bill: it
is the usage window being spent, at the price the API would charge.

## Verification

There is no test suite. `npx tsc -p plugins/costs` typechecks; the panel is verified by opening
it beside a running session and watching the row grow. The files are read incrementally from
the offset last reached, so a session transcript of a hundred megabytes costs the panel only
what was appended since the previous look.
