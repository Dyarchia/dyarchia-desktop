# Cheatsheet

Every command and every option of crawlee-lab on one page. Generated against the installed CLI, not
from memory. Regenerate any section with `uv run crawlee-lab <command> --help`.

## Index

- [1. Setup](#1-setup)
- [2. Commands at a glance](#2-commands-at-a-glance)
- [3. crawl](#3-crawl)
- [4. inspect](#4-inspect)
- [5. diff](#5-diff)
- [6. profiles](#6-profiles)
- [7. version](#7-version)
- [8. Selector syntax](#8-selector-syntax)
- [9. URL pattern syntax](#9-url-pattern-syntax)
- [10. Environment variables](#10-environment-variables)
- [11. Where files land](#11-where-files-land)
- [12. Recipes](#12-recipes)
- [13. Development commands](#13-development-commands)

## 1. Setup

```bash
uv sync --dev
uv run playwright install chromium
uv run pre-commit install
```

Everything below assumes the `uv run` prefix. Drop it inside an activated virtual environment.

## 2. Commands at a glance

    Command     Purpose
    --------    ----------------------------------------------------------------------
    crawl       Scrape URLs directly, or run a saved profile
    inspect     Probe a target before committing to a crawl
    diff        Show what changed the last time a target was snapshotted
    profiles    List the profiles this project knows about
    version     Print the installed version

## 3. crawl

```text
crawlee-lab crawl [OPTIONS] [URLS]...
```

URLs are optional when `--profile` is given. Anything typed on the command line overrides the
profile; anything left alone comes from the profile.

Source and identity.

    Option                  Value                Default    Meaning
    --------------------    -----------------    -------    -----------------------------------
    URLS                    one or more URLs     none       Start URLs, positional
    --profile               profile name         none       Run a saved profile
    --save-profile          profile name         none       Save this run as a reusable profile
    --name                  string               from URL   Run name, used for output filenames

What to fetch and parse.

    Option                  Value                                             Default
    --------------------    ----------------------------------------------    -----------
    --crawler               http, beautifulsoup, parsel, playwright,          adaptive
                            adaptive
    --extract               auto, text, html, links, jsonld, none             auto
    --select                NAME=SELECTOR, repeatable                         none
    --keep-boilerplate      flag, keeps the header and footer every page      off
                            of the run shares

Every mode except `html` also reduces a response that arrives as layout markup, as MDX sites serve
for their landing pages, to the prose and links inside it. Headings living in component attributes
are kept and fenced code blocks are left untouched. Use `--extract html` for the document as fetched.

How far to go.

    Option                  Value                                             Default
    --------------------    ----------------------------------------------    ---------------
    --depth                 integer, 0 means do not follow links               0
    --max-pages             integer                                           unlimited
    --follow                pattern a URL must match, repeatable               none
    --exclude               pattern a URL must not match, repeatable           none
    --strategy              all, same-domain, same-hostname, same-origin       same-hostname
    --link-selector         CSS selector for links to follow                   a

Politeness and transport.

    Option                  Value                                             Default
    --------------------    ----------------------------------------------    ---------------
    --user-agent            string                                            identifies the tool
    --stealth               flag, impersonate a real browser                   off
    --ignore-robots         flag, do not honour robots.txt                     off
    --concurrency           integer, maximum parallel requests                 8
    --rate                  float, maximum requests per minute                 60
    --retries               integer, retries per request                       3

Browser.

    Option                  Value                                             Default
    --------------------    ----------------------------------------------    ------------------
    --headful               flag, show the browser window                      off
    --block                 resource type, repeatable                          image, media, font

Output and history.

    Option                  Value                                             Default
    --------------------    ----------------------------------------------    ---------
    --format                json, jsonl, csv, md, repeatable                   json
    --output-dir            path                                              output/
    --snapshot              flag, store content under data/ and diff it        off
    --commit                flag, commit the snapshot when it changed          off
    --verbose, -v           flag, verbose logging                              off

## 4. inspect

```text
crawlee-lab inspect [--render] URL
```

    Option      Meaning
    ---------   ---------------------------------------------------------------
    --render    Also render in a browser to confirm the static diagnosis

Reports HTTP status and content type, page title, HTML size, link count, whether robots.txt allows
the URL, any declared crawl delay, discovered sitemaps, whether a markdown variant of the page
exists, how much content survives static extraction, and which crawler that implies.

## 5. diff

```text
crawlee-lab diff [OPTIONS] NAME
```

    Option           Value      Default    Meaning
    -------------    -------    -------    --------------------------------------
    --unified, -u    flag       off        Show the unified diff for modified pages
    --limit          integer    20         Maximum entries per section

`NAME` is the profile or run name that was snapshotted. For the history beyond the last run, use
git directly:

```bash
git log -- data/claude-docs
git diff HEAD~1 -- data/claude-docs/CHANGES.md
```

## 6. profiles

```text
crawlee-lab profiles
```

Lists every profile, from `profiles/*.yaml` and from `src/crawlee_lab/sites/*.py`, with its crawler,
first target and description.

## 7. version

```text
crawlee-lab version
```

## 8. Selector syntax

    Expression            Result
    ------------------    -------------------------------------------
    h1                    Text of the first match
    .price@data-value     An attribute of the first match
    all:.tag              A list with the text of every match
    all:a@href            A list with an attribute of every match

Attributes carrying URLs (`href`, `src`, `data-src`, `srcset`, `poster`, `action` and similar) are
resolved against the page they were found on. A selector that matches nothing yields null, or an
empty list with `all:`.

## 9. URL pattern syntax

Applies to `--follow` and `--exclude`.

    Pattern                      Meaning
    -------------------------    ---------------------------------------------------
    /docs/                       The URL contains this text
    /docs/*.html                 Contains this glob, where * stops at a separator
    /docs/**                     Contains this glob, where ** crosses separators
    https://site.com/docs/**     Starts with this glob, matched against the whole URL
    re:^https://site\.com/\d+    An explicit regular expression, anchored at the start

## 10. Environment variables

Read from the environment or from a `.env` file. All are prefixed `CRAWLEE_LAB_`.

    Variable                                Default
    ------------------------------------    ----------------------------------
    CRAWLEE_LAB_USER_AGENT                  crawlee-lab/0.1 (+...)
    CRAWLEE_LAB_MIN_CONCURRENCY             1
    CRAWLEE_LAB_DESIRED_CONCURRENCY         3
    CRAWLEE_LAB_MAX_CONCURRENCY             8
    CRAWLEE_LAB_MAX_REQUESTS_PER_MINUTE     60
    CRAWLEE_LAB_MAX_REQUEST_RETRIES         3
    CRAWLEE_LAB_REQUEST_TIMEOUT_SECONDS     60
    CRAWLEE_LAB_RESPECT_ROBOTS              true
    CRAWLEE_LAB_MIN_SUCCESS_RATE            0.9
    CRAWLEE_LAB_HEADLESS                    true
    CRAWLEE_LAB_DATA_DIR                    data
    CRAWLEE_LAB_OUTPUT_DIR                  output
    CRAWLEE_LAB_PROFILES_DIR                profiles

## 11. Where files land

    Path                            Tracked by git    Contents
    ----------------------------    --------------    ----------------------------------
    output/<name>.json              no                Run output in the chosen formats
    output/<name>/*.md              no                One file per page, markdown format
    profiles/<name>.yaml            yes               Saved profiles
    data/<name>/pages/**            no                Snapshot payloads
    data/<name>/manifest.json       yes               Every URL with its status and hash
    data/<name>/changes.json        yes               Last change report, machine readable
    data/<name>/CHANGES.md          yes               Last change report, with diffs
    storage/                        no                Crawlee's own working directory

## 12. Recipes

Scout a target before writing anything:

```bash
uv run crawlee-lab inspect https://site.example/docs/intro
```

Grab one page as clean markdown:

```bash
uv run crawlee-lab crawl https://site.example/article --extract auto --format md
```

Extract structured fields across a catalogue:

```bash
uv run crawlee-lab crawl https://books.toscrape.com/ \
    --crawler parsel \
    --select title=h1 \
    --select price=.price_color \
    --select cover='#product_gallery img@src' \
    --depth 2 \
    --follow /catalogue/ \
    --exclude /category/ \
    --format csv
```

Scrape a page that only exists after JavaScript runs:

```bash
uv run crawlee-lab crawl https://quotes.toscrape.com/js/ \
    --crawler playwright \
    --select quotes='all:.quote .text'
```

Harvest structured data instead of prose:

```bash
uv run crawlee-lab crawl https://site.example/product/1 --extract jsonld
```

Collect every link on a page:

```bash
uv run crawlee-lab crawl https://site.example/ --extract links
```

Freeze a working run and replay it:

```bash
uv run crawlee-lab crawl https://site.example/ --select title=h1 --save-profile my-site
uv run crawlee-lab crawl --profile my-site --max-pages 10
```

Track a documentation site over time:

```bash
uv run crawlee-lab crawl --profile claude-docs --commit
uv run crawlee-lab diff claude-docs --unified
```

Go slower on a fragile target:

```bash
uv run crawlee-lab crawl https://site.example/ --concurrency 1 --rate 10 --depth 2
```

Scrape something you own, ignoring its robots.txt:

```bash
uv run crawlee-lab crawl https://staging.mysite.internal/ --ignore-robots
```

## 13. Development commands

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest -m "not network and not browser"
uv run pytest
uv run pytest --cov=crawlee_lab --cov-report=term-missing
```
