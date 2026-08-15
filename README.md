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

## Snapshots and change tracking

`--snapshot` writes each page's content to `data/<name>/pages/<host>/<path>.md`, mirroring the URL
structure, and records hashes and per-URL status in a manifest beside it.

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

## Bundled profiles

    Profile                Target                       Pages
    -------------------    -------------------------    -----
    claude-docs            claude.com/docs                213
    claude-code-docs       code.claude.com, English       187
    claude-code-docs-es    code.claude.com, Spanish       166
    claude-api-docs        platform.claude.com, English   553
    claude-api-docs-es     platform.claude.com, Spanish   206

Every one of them fetches the markdown variant each site publishes, so the snapshot is the
document rather than an extractor's reading of it. Page counts are from the last full run.

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
.\scripts\register-watch-task.ps1 -Time 08:00
```

Nothing registers itself. Run that when you want the monitor to start, and
`.\scripts\register-watch-task.ps1 -Unregister` when you want it to stop.

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
uv run pytest -m "not network and not browser"
uv run pytest
```

Tests that reach the network are marked `network`, and those that need a browser are marked
`browser`. CI runs neither.

## Documentation

- `docs/tutorial.md` — step by step from zero, in Spanish. Start here
- `docs/cheatsheet.md` — every command and every option, on one page
- `docs/architecture.md` — how the pieces fit together and why
- `docs/profiles.md` — the profile file format, selector and pattern syntax
- `docs/superpowers/specs/` — the approved design
- `docs/reference/crawlee.md` — index of the Crawlee API documentation

## Cost

Nothing here costs money. The whole stack is open source and runs locally. Apify Cloud, paid
proxies and LLM-assisted extraction are all deliberately out of scope.

## License

MIT
