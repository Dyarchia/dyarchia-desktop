# crawlee

**The crawling here is [Crawlee for Python](https://github.com/apify/crawlee-python), by Apify,
under Apache-2.0.** The request queue, session pool, retry policy and crawlers are theirs; this
package is the corpus, the profiles, the search index and the panel around them. Crawlee is
installed from PyPI and never redistributed or modified. See [NOTICE.md](../../NOTICE.md).

A toolkit that snapshots documentation sites into a versioned corpus and reports what moved between
rounds, plus a Dyarchia panel that drives it. The engine knows no site; a profile describes a target
as data. It runs from the workspace only, and a packaged build does not carry it.

## Setup

- Python 3.12 or newer and uv; browser-backed crawlers also need Playwright's Chromium.
- A fresh clone has no `.venv`, no `.env` and no corpus. Copy `.env.example` to `.env` and set
  `DYARCHIA_CRAWLEE_REPOSITORIES_DIR` to the absolute path of the folder holding the corpora.
- Moving this folder invalidates the venv; `uv sync --dev` rewrites it.

```bash
uv sync --dev
uv run playwright install chromium
```

## Corpus repositories

- A corpus repository is a git repository with `profiles/`, `data/` and `output/`. Every
  subdirectory of `DYARCHIA_CRAWLEE_REPOSITORIES_DIR` holding a `profiles/` is one.
- Unset, the tool knows the single repository named by `DYARCHIA_CRAWLEE_DATA_DIR`,
  `DYARCHIA_CRAWLEE_PROFILES_DIR` and `DYARCHIA_CRAWLEE_OUTPUT_DIR`. The desktop app defaults the
  folder to `~/.dyarchia/data/crawlee` unless the environment already names one.
- A profile name defined in two repositories is refused; a crawl writes into the repository that
  defines the profile.
- `catalog/` ships the `docs-labs` and `salesforce-ai` profile groups, which the panel's Profile
  library installs without replacing a profile already on disk.

## Profiles

A YAML file in `profiles/` with the same fields as the command line; unknown keys are rejected.
The profiles under `catalog/` are working examples.

    Field                              Meaning
    --------------------------------   -------------------------------------------------------
    name, group                        Target name; snapshots go to data/<group>/<name>/
    start_urls, sitemap_urls           Where the crawl begins; at least one is required
    fetch_suffix                       Fetch the page's markdown twin, falling back to the page
    crawler                            http, beautifulsoup, parsel, playwright, adaptive
    extract, selectors                 Extraction mode (auto) and CSS field selectors
    max_depth, max_pages               Link hops to follow and page cap
    include, exclude                   URL patterns: substring, glob, or re: regex
    snapshot                           Keep pages under data/ and report changes
    min_success_rate, min_coverage     Refuse a snapshot from a run that failed or fell short

## Commands

Run as `uv run dyarchia-crawlee <command>`; `--help` lists each command's flags.

    Command     What it does
    ---------   ----------------------------------------------------------------------
    crawl       Scrape URLs directly, or run a saved profile (--snapshot, --commit)
    inspect     Probe a target: robots, sitemaps, markdown variants, rendering
    diff        Show what changed on a target in its last snapshot
    digest      Bundle a round's changes into one document
    watch       Run one round over every snapshotted target and report what moved
    urls        List the URLs a snapshotted target holds, grouped by section
    state       Report every corpus across every repository
    profiles    List known profiles; profile shows, saves or deletes one (--data: pages too)
    search      Full-text search over the corpus, best first
    index       Bring the search index level with the snapshots, or rebuild it
    mcp         Serve that search to an agent as the MCP tool search_corpus
    version     Print the installed version

## Rounds and search

- `--snapshot` stores each page as markdown with a manifest of hashes; changes are detected against
  disk, not git, and `--commit` commits only when content moved. A run below its success or
  coverage threshold writes nothing; a first snapshot and a pure reordering are not changes.
- `watch` locks the round and exits 0 (no change), 10 (changed), 1 (a target failed) or 30
  (another round holds the lock).
- Search splits pages at headings into one SQLite FTS5 index per repository, refreshed before each
  query, and labels every hit with the rung it matched (`phrase`, `near`, `all`, `any`), its file
  and its line.

## Politeness

- robots.txt and its `Crawl-delay` are honoured by default, requests are rate limited with backoff
  on HTTP 429, and the User-Agent names the tool; `--ignore-robots` is explicit.
- No paid service and no model is involved at any point.

## The panel

Lists the corpora, runs a round with per-target progress, edits and commits profiles, and searches,
opening a hit in a markdown reader or the file manager. It shells out to this package's CLI, so it
needs `uv sync --dev` here; restart the shell after changing `main.py`.

## Tests

```bash
cd plugins/crawlee && .venv/Scripts/python.exe -m pytest tests/unit -q
```
