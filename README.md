# crawlee-lab

On-demand web scraping toolkit built on Crawlee for Python. Point it at a URL and it scrapes. Freeze
a run that worked into a reusable profile. Snapshot any target to track how its content changes.

## Requirements

Python 3.12 or newer, and uv. The project runs on 3.14 and CI covers 3.12 and 3.14. Browser-backed
crawlers additionally need Playwright's Chromium, which is a one-off download of roughly 400 MB.

```bash
uv sync --dev
uv run playwright install chromium
```

## Quick start

Look before you leap. `inspect` reports what a crawl against a target would have to deal with:

```bash
uv run crawlee-lab inspect https://code.claude.com/docs/en/overview
```

Scrape a page with no configuration at all:

```bash
uv run crawlee-lab crawl https://code.claude.com/docs/en/overview
```

Pull specific fields, follow links, write CSV:

```bash
uv run crawlee-lab crawl https://code.claude.com/docs/en/overview \
    --crawler parsel \
    --select title=h1 \
    --depth 2 \
    --max-pages 40 \
    --follow /docs/en/ \
    --format csv
```

Freeze that run and replay it later:

```bash
uv run crawlee-lab crawl https://code.claude.com/docs/en/overview \
    --select title=h1 --save-profile my-site
uv run crawlee-lab crawl --profile my-site
```

Track a target over time:

```bash
uv run crawlee-lab crawl --profile claude-docs --snapshot --commit
uv run crawlee-lab diff claude-docs --unified
```

## Commands

    Command      Purpose
    ---------    -----------------------------------------------------------------------
    crawl        Scrape URLs directly, or run a saved profile
    inspect      Probe a target: robots, sitemaps, markdown variants, rendering, advice
    diff         Show what changed on a target the last time it was snapshotted
    watch        Sweep every tracked target once and report whether anything moved
    urls         Report which URLs a snapshotted target is holding, broken down by section
    profiles     List the profiles this project knows about
    version      Print the installed version

Run `uv run crawlee-lab crawl --help` for the full option list.

## Choosing a crawler

    Crawler          Use when
    -------------    ----------------------------------------------------------------
    http             The response is already what you want: markdown, JSON, plain text
    beautifulsoup    Ordinary HTML, tolerant parsing of messy markup
    parsel           Ordinary HTML, faster on large documents
    playwright       Content only exists after JavaScript runs
    adaptive         You do not know, and would rather not pay for a browser by default

`adaptive` is the default. It runs the cheap static path first and escalates to a browser only when
that path comes back empty.

## Extraction

`--extract` decides what is pulled from each page when no selectors are given:

    Mode       Result
    -------    -----------------------------------------------------------------
    auto       Main content as markdown, with navigation and boilerplate removed
    text       Plain text of the whole document
    html       The markup as fetched
    links      Every link on the page, resolved to absolute URLs
    jsonld     schema.org structured data
    none       Nothing, useful when only the selectors matter

Selectors are given as `--select NAME=SELECTOR` and can be combined with any mode. The selector
syntax is documented in `docs/profiles.md`.

Whatever the mode, the header and footer that nearly every page of a run shares are removed once the
run is collected. A single page cannot tell its banner from its content; the corpus can. Turn it off
with `--keep-boilerplate`.

A response that claims to be markdown but arrives as layout markup, which is what MDX sites serve
for their landing pages, is reduced to the prose and links inside it. Headings living in component
attributes are kept, and fenced code blocks are never touched. `--extract html` opts out by asking
for the document exactly as fetched.

An MDX page may also define the component it renders inside the document, ahead of any prose. That
definition is JavaScript rather than markup, so no amount of tag-stripping reaches it; it is removed
outright and the invocation is kept, because where a widget stood is worth knowing and the four
hundred lines that built it are not. Code fences are exempt: a page teaching JavaScript is a page
whose `export const` is the lesson.

Markdown extracted from HTML is repaired before it is stored. Extraction can close a paragraph and
open the code block after it on one line, which leaves a fence delimiter no parser can see and
inverts every fence that follows, so a page's prose is read as code and its code as prose. Both
repairs refuse to act unless they demonstrably work, and a document fetched as markdown from its
publisher is never touched by either: that one is stored as published.

## Deciding what is worth keeping

A sitemap will happily hand over the whole site. `urls` reads the manifest back and reports what a
target is actually holding, grouped by the path that holds each page and ordered by weight, so the
sections that are paying their way are separated from the ones that are only bulk:

```bash
uv run crawlee-lab urls openai-docs --depth 1
```

    section                                   pages       size   share
    ---------------------------------------   -----   --------   -----
    developers.openai.com/cookbook              309    23.0 MB     58%
    developers.openai.com/api                   174     3.1 MB     33%
    developers.openai.com/plugins                30   376.4 KB      6%

`--depth` rolls the grouping up to the first N path segments; without it each page is grouped under
the path that holds it, which is the level an `include` or `exclude` rule is written against. Narrow
the profile with those rules, then re-run the crawl to drop what the corpus does not need.

`--list` prints one URL per line and nothing else, for piping into grep or a file. With no target
named, every snapshotted target is reported in turn.

## Snapshots and change tracking

`--snapshot` writes each page's content to `data/<name>/pages/<host>/<path>.md`, mirroring the URL
structure, and records hashes and per-URL status in a manifest beside it. A profile that names a
group nests one level deeper, at `data/<group>/<name>/`, and its output goes to
`output/<group>/<name>.jsonl`.

Detection does not depend on git. The manifest holds the previous hash of every page and the stored
pages hold the previous text, so every run reports what was added, removed and modified against what
is on disk. In this repository `data/` is ignored entirely, which keeps the scraped corpus out of
the history and costs only the long-term record: what survives is the state of the target and the
report of the last run, not a dated trail of every change.

Track that trail by removing `data/` from `.gitignore` and passing `--commit`, which stages a
snapshot when, and only when, its content fingerprint moved. It is never implicit.

Nothing in the toolkit depends on that directory existing or on where it is. `CRAWLEE_LAB_DATA_DIR`
accepts an absolute path, so the corpus can live anywhere, and deleting it costs the comparison
baseline rather than the ability to run. See `.env.example`.

A run that failed too often writes nothing, because half a snapshot would read as a mass deletion on
the next comparison. A run that found nothing rewrites nothing, so an unchanged target leaves its
files untouched.

## Corpora

Profiles are not tracked by git. A profile describes somebody's corpus rather than the tool, so it
lives on the machine that crawls it; the package ships `claude-docs` under `src/crawlee_lab/sites/`
as the worked example, and `docs/profiles.md` documents the format. The nine this toolkit was built
against, in the group `docs-labs`:

    Profile                Target                       Pages
    -------------------    -------------------------    -----
    claude-docs            claude.com/docs                187
    claude-code-docs       code.claude.com, English       170
    claude-code-docs-es    code.claude.com, Spanish       149
    claude-api-docs        platform.claude.com, English   581
    claude-api-docs-es     platform.claude.com, Spanish   206
    openai-docs            developers.openai.com          538
    chatgpt-docs           learn.chatgpt.com, Codex       248
    gemini-docs            ai.google.dev, HTML            219
    xai-docs               docs.x.ai, Grok                158

All but one fetch the markdown variant the site publishes, so the snapshot is the document rather
than an extractor's reading of it. `ai.google.dev` publishes none, so `gemini-docs` is extracted
from HTML instead. Page counts are from the last run of each.

A second group, `salesforce-ai`, tracks what Salesforce publishes about Agentforce and Data 360:

    Profile                Target                             Pages
    -------------------    -------------------------------    -----
    agentforce-docs        Agentforce, MCP, Lightning Types     448
    data-cloud-docs        Data 360, English                  4,033
    einstein-apis          Einstein Vision, Language, Bots       85

`developer.salesforce.com` announces an `llms.txt` in its robots.txt and publishes a markdown twin
of every documentation page, indexed per product. Its sitemaps name pages as `.html` and the twin
lives at `.md`, which is why `fetch_suffix` replaces a page extension rather than only appending
one. The set of twins matches the set of sitemap entries exactly, so nothing is sampled or guessed;
the exception was sixteen localised copies of one guide that publish no markdown, and they are
excluded by locale.

Each group is a folder and a round: its profiles share `data/<group>/`, `output/<group>/` and one
weekly sweep. A corpus on another subject gets its own group, and with it its own folder and its
own schedule, rather than joining an existing one by having asked for snapshots.

## Running unattended

`watch` is the command a scheduler calls. It sweeps every profile that asks for snapshots, lets one
failing target cost only its own target, writes `data/WATCH.md` describing the sweep, and answers
through its exit code:

    Code    Meaning
    ----    ----------------------------------------------------------------
    0       nothing changed, and nothing needs reading
    10      at least one target changed
    1       at least one target failed, so the sweep cannot vouch for itself

A first snapshot is deliberately not a change. There is nothing yet for it to differ from, and a
monitor that cries on its own first run teaches you to ignore it.

```bash
uv run crawlee-lab watch
uv run crawlee-lab watch claude-docs claude-code-docs
```

On Windows, `scripts/watch.ps1` wraps that in a log and a desktop notification raised only when the
exit code is not 0, and `scripts/register-watch-task.ps1` registers it with the Task Scheduler:

```powershell
.\scripts\register-watch-task.ps1 -Name labs-docs -Group docs-labs
```

The task fires at every logon and the wrapper decides whether the week is still owed a sweep, so the
round happens the first time you log on in a given week: Monday if you turn the machine on that day,
the first day you do if you do not. A run that finds the week already swept exits 20 and does
nothing. A week whose sweep failed is still owed one, so the next logon takes it.

Every task carries a name, `labs-docs` by default, and lives under the `\crawlee-lab\` folder of the
Task Scheduler. The name keys the log and the record of the last week swept, so rounds over
different corpora sit side by side without taking each other's turn. `-Group` is what a round
covers; naming profiles instead covers exactly those:

```powershell
.\scripts\register-watch-task.ps1 -Name claude-only -Profiles claude-docs, claude-code-docs
```

A task registered with neither sweeps every profile that asks for snapshots, including the ones
added after it was registered, and says so when you register it.

Nothing registers itself. Run that when you want a monitor to start, and
`.\scripts\register-watch-task.ps1 -Name labs-docs -Unregister` when you want it to stop.

## Politeness

robots.txt is respected by default, including `Crawl-delay`, and requests are rate limited per
domain with backoff on HTTP 429. The User-Agent identifies the tool rather than impersonating a
browser. Each of those can be overridden, `--ignore-robots` loudly, but the defaults assume you are
a guest on someone else's server.

## Development

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest
uv run pytest -m "not browser"
```

The suite runs offline. Tests that need a website get a fixture site served on localhost; the only
mark left is `browser`, for the tests that need Playwright's Chromium installed.

## Documentation

- `docs/cheatsheet.md` — every command and every option, on one page
- `docs/architecture.md` — how the pieces fit together and why
- `docs/profiles.md` — the profile file format, selector and pattern syntax
- `docs/architecture/specs/` — the approved design

## Cost

Nothing here costs money. The whole stack is open source and runs locally. Apify Cloud, paid
proxies and LLM-assisted extraction are all deliberately out of scope: no model is consulted at any
point between a URL going in and a snapshot coming out.

## License

MIT
