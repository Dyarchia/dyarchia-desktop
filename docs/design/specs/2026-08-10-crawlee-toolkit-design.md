# Design: euripontida-crawlee, an on-demand scraping toolkit built on Crawlee for Python

Date: 2026-08-10
Status: approved

## Index

- [Goal](#goal)
- [Scope](#scope)
- [Architecture decision](#architecture-decision)
- [Project layout](#project-layout)
- [Usage modes](#usage-modes)
- [Components](#components)
- [Data model](#data-model)
- [Content versioning](#content-versioning)
- [Crawler coverage](#crawler-coverage)
- [Error handling](#error-handling)
- [Politeness and compliance](#politeness-and-compliance)
- [First target: claude.com/docs](#first-target-claudecomdocs)
- [Quality and tooling](#quality-and-tooling)
- [Delivery phases](#delivery-phases)
- [Accepted risks](#accepted-risks)
- [Out of scope](#out-of-scope)

## Goal

Leave Crawlee for Python ready to scrape any site on demand. The deliverable is the engine: a command line
tool that attacks an arbitrary URL without writing code, and that lets a successful run be frozen into a
reusable profile once the target becomes recurring.

`claude.com/docs` is the first profile that exercises the engine, not its reason to exist.

## Scope

In scope:

- A site-agnostic crawling engine built on Crawlee for Python.
- A CLI with an ad-hoc mode (direct URL) and a profile mode (declared recurring target).
- Coverage of all five Crawlee crawlers and of the library's cross-cutting machinery.
- Content versioning applicable to any target, with a change report.
- Export to JSON, JSONL, CSV and markdown.

Everything else: see [Out of scope](#out-of-scope).

## Architecture decision

Three approaches were evaluated.

```text
APPROACH            DESCRIPTION                                   VERDICT
------------------  --------------------------------------------  ------------------------------
Cookbook            Standalone scripts, one per Crawlee feature    Rejected: every new site means
                                                                  copy and paste

Engine + profiles   Reusable site-agnostic library; targets        CHOSEN
                    declared separately in YAML or Python;
                    a single CLI

Full platform       Engine plus scheduler, dashboard, database     Rejected for now: it can be
                    and notifications                             built on top without refactor
```

Two layers with a hard boundary: the engine knows nothing about any specific site, and profiles never touch
the Crawlee API. A profile describes what to look for; the engine decides how to obtain it.

## Project layout

```text
crawlee/
    pyproject.toml
    uv.lock
    README.md
    .python-version
    .gitignore
    .pre-commit-config.yaml
    .github/workflows/ci.yml
    docs/
        architecture.md
        profiles.md
        reference/crawlee.md
        design/specs/
    profiles/
        books-toscrape.yaml
        quotes-js.yaml
    src/euripontida_crawlee/
        cli.py
        config.py
        models.py
        registry.py
        crawlers/
            factory.py
            settings.py
            hooks.py
        extraction/
            strategies.py
            selectors.py
        handlers/
            declarative.py
            sitemap.py
            markdown.py
        profiles/
            schema.py
            loader.py
        storage/
            exporters.py
            snapshots.py
        versioning/
            hashing.py
            diffing.py
            report.py
        sites/
            claude_docs.py
    tests/
        unit/
        integration/
        fixtures/
    data/
    storage/
```

`data/` holds versioned snapshots and is tracked by git. `storage/` is Crawlee's working directory and is
ignored.

## Usage modes

Ad-hoc, with nothing configured:

```bash
uv run euripontida-crawlee crawl https://example.com --depth 2 --extract auto --format jsonl
```

Ad-hoc with field selection on the fly:

```bash
uv run euripontida-crawlee crawl https://example.com/products \
    --select name=h1 \
    --select price=".price" \
    --follow "/products/*"
```

Reconnaissance before attacking a new target:

```bash
uv run euripontida-crawlee inspect https://example.com
```

Promoting a run into a reusable profile:

```bash
uv run euripontida-crawlee crawl https://example.com --select name=h1 --save-profile my-site
uv run euripontida-crawlee crawl --profile my-site
```

Versioning and change report:

```bash
uv run euripontida-crawlee crawl --profile claude-docs --snapshot
uv run euripontida-crawlee diff claude-docs
```

## Components

```text
COMPONENT             RESPONSIBILITY                                 DEPENDS ON
--------------------  ---------------------------------------------  ---------------------
cli                   Command parsing, run orchestration             config, registry, run
config                Environment settings and .env file             nothing
models                Data contracts between layers                  nothing
registry              Discovery of YAML profiles and Python sites    profiles, sites
crawlers.factory      Builds the requested crawler, wires the router crawlers.settings, hooks
crawlers.settings     Concurrency, rate limit, retries, sessions     config
crawlers.hooks        Pre-navigation, resource blocking              nothing
extraction            Strategies auto/text/html/links/jsonld         models
handlers.declarative  Generic handler driven by profile selectors    extraction, models
handlers.sitemap      Request seeding from sitemap.xml               nothing
handlers.markdown     Markdown variant fetch with HTML fallback      extraction
storage.exporters     Dump to json, jsonl, csv, md                   models
storage.snapshots     Snapshot writes under data/<name>/             models, versioning
versioning            Hashing, diffing and change report             models
sites.claude_docs     Python profile for the first target            handlers, models
```

Every component can be understood and tested without opening the others. Dependencies always point towards
`models` and `config`, never towards `cli`.

## Data model

- `ScrapedItem`: one extracted record. URL, timestamp, extracted fields, crawler metadata.
- `PageSnapshot`: normalized page content plus its sha256 and its relative path under `data/`.
- `RunManifest`: the full result of a run. Every URL with its final status, hash, fetch time and snapshot
  path. This is the artifact that makes diffing possible without invoking git.
- `ProfileSpec`: declarative description of a target. Start URLs or sitemap, crawler kind, include and
  exclude patterns, depth, per-field selectors, extraction strategy, politeness settings.

## Content versioning

Git is the history. Every run with `--snapshot` writes normalized content to `data/<name>/<path>.md` inside
the repository itself. Knowing what changed and when is `git log` and `git diff`, with no proprietary format.

On top of that, `manifest.json` records url, sha256, status and fetch time, which allows:

- Detecting changes without invoking git.
- Telling a deleted page apart from a page that failed to download.
- Generating the `diff` report with added, removed and modified sections plus a unified diff.

Automatic commits sit behind an explicit `--commit` flag. They are never implicit.

## Crawler coverage

Every crawler earns its place through a real need, not as decoration.

```text
CRAWLER                     JUSTIFIED BY                            FIRST PROFILE TO USE IT
--------------------------  --------------------------------------  ------------------------
HttpCrawler                 Raw markdown fetch, no parsing needed   claude-docs
BeautifulSoupCrawler        Tolerant parsing of messy HTML          books-toscrape
ParselCrawler               XPath and CSS with better performance   books-toscrape (variant)
PlaywrightCrawler           JavaScript-rendered content             quotes-js
AdaptivePlaywrightCrawler   Decides on its own whether to render    quotes-js (variant)
```

Cross-cutting across every profile: `Router`, `RequestQueue`, `Dataset`, `KeyValueStore`,
`ConcurrencySettings`, `SessionPool`, retry policy, `error_snapshotter`, run statistics and structured
logging.

`AdaptivePlaywrightCrawler` is the default for ad-hoc mode: it does not pay the browser cost when the page
does not need one.

## Error handling

Crawlee owns retries with backoff. On top of that:

- The manifest records a final status per URL, so a partial failure neither deletes valid snapshots nor
  pollutes the diff with false removals.
- A run whose success rate falls below a configurable threshold writes no changes to `data/`.
- Extraction errors are isolated per page: one broken page does not abort the run.
- `error_snapshotter` stores the failing HTML for later diagnosis.

## Politeness and compliance

- `respect_robots_txt_file=True` by default on every crawler. An explicit, loudly logged `--ignore-robots`
  exists for targets you own.
- Conservative rate limit and low concurrency by default.
- Identifiable, configurable User-Agent.
- `inspect` is the recommended first step against any new target: it reports robots, available sitemaps,
  whether a markdown variant exists, whether content is static or JavaScript-rendered, and which crawler it
  recommends.

## First target: claude.com/docs

Checks performed before the design was written:

```text
CHECK                                 RESULT
------------------------------------  -----------------------------------------------------
robots.txt for claude.com             User-Agent: * with Allow: /, no exclusions
Docs sitemap                          213 URLs at https://claude.com/docs/sitemap.xml
Markdown variant                      Exists: .md suffix, Content-Type text/markdown
HTML size of one page                 407 KB
Markdown size of the same page        4.6 KB
```

The markdown variant is the source of truth for versioning: the diff stays readable instead of being React
hydration noise. Should the site stop serving it, the fetcher falls back to HTML and converts; the fallback
is designed for but not built until needed.

Estimated volume: 213 pages of roughly 5 KB, around 1 MB per full snapshot. Load on the target is negligible
with the default politeness settings.

## Quality and tooling

```text
AREA               TOOL                 NOTE
-----------------  -------------------  ------------------------------------------------
Environment        uv                   pyproject.toml plus a reproducible uv.lock
Lint and format    ruff                 One binary for both jobs
Types              mypy                 Strict mode
Tests              pytest               Unit tests on local fixtures, no network
Network tests      pytest markers       Marked network, excluded from CI by default
Commit hooks       pre-commit           ruff and mypy before every commit
Integration        GitHub Actions       Lint, types and tests on every push
```

## Delivery phases

```text
PHASE  CONTENT                                                        MILESTONE
-----  -------------------------------------------------------------  -------------------------
0      Git repo, uv, layout, tooling, CI                              Installable project
1      Engine and ad-hoc CLI                                          Any site is scrapable
2      Registry, YAML and Python profiles, save-profile, inspect      Recurring targets
3      Generic versioning and the claude-docs profile                 First real target
4      Full crawler coverage, tests, documentation                    Project closed
```

## Accepted risks

- The structure of `claude.com/docs` may change and break the profile. Mitigated by the manifest, which
  makes degradation visible instead of silent.
- The `.md` variant could disappear. Mitigated by the HTML fallback in the design.
- Playwright downloads around 400 MB of browsers in phase 4. Free, costs only disk.
- Sites behind aggressive anti-bot protection fall outside what this toolkit can reasonably reach without
  paid proxies, which were explicitly ruled out.

## Out of scope

- The Apify Cloud platform.
- Paid proxies.
- LLM-assisted extraction.
- A custom scheduler, web dashboard and notifications.
- A database: storage is the filesystem plus git.

Monetary cost of the project: zero. The whole stack is open source and runs locally.
