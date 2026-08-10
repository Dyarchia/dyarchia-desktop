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
uv run crawlee-lab inspect https://books.toscrape.com/
```

Scrape a page with no configuration at all:

```bash
uv run crawlee-lab crawl https://books.toscrape.com/
```

Pull specific fields, follow links, write CSV:

```bash
uv run crawlee-lab crawl https://books.toscrape.com/ \
    --crawler parsel \
    --select title=h1 \
    --select price=.price_color \
    --depth 2 \
    --max-pages 40 \
    --follow /catalogue/ \
    --format csv
```

Freeze that run and replay it later:

```bash
uv run crawlee-lab crawl https://books.toscrape.com/ --select title=h1 --save-profile my-site
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

## Snapshots and change tracking

`--snapshot` writes each page's content to `data/<name>/pages/<host>/<path>.md`, mirroring the URL
structure, and records hashes and per-URL status in a manifest beside it.

Git tracks the metadata, not the corpus. `data/*/pages/` is ignored, while `manifest.json`,
`changes.json` and `CHANGES.md` are committed, so the history answers what changed and when, diffs
included, without the repository carrying every page ever scraped. The pages themselves stay on disk
and are what the next run diffs against. A fresh clone therefore knows the hashes but not the old
text, so its first run reports modifications without a before-and-after.

A run that failed too often writes nothing, because half a snapshot would read as a mass deletion on
the next comparison. A run that found nothing rewrites nothing, so an unchanged target leaves the
working tree clean and `--commit` has nothing to do.

## Bundled profiles

    Profile                 Target                     Exercises
    --------------------    ----------------------    --------------------------------
    claude-docs             claude.com/docs           HttpCrawler, sitemap seeding,
                                                      markdown variants, snapshots
    books-toscrape          books.toscrape.com        BeautifulSoupCrawler, link
                                                      following, CSV export
    books-toscrape-parsel   books.toscrape.com        ParselCrawler on the same target
    quotes-js               quotes.toscrape.com/js    PlaywrightCrawler, resource
                                                      blocking
    quotes-js-adaptive      quotes.toscrape.com/js    AdaptivePlaywrightCrawler

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
