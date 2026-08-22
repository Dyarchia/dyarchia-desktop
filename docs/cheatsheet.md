# Cheatsheet

Every command and every option of crawlee-lab on one page. Generated against the installed CLI, not
from memory. Regenerate any section with `uv run crawlee-lab <command> --help`.

## Index

- [1. Setup](#1-setup)
- [2. Commands at a glance](#2-commands-at-a-glance)
- [3. crawl](#3-crawl)
- [4. inspect](#4-inspect)
- [5. diff](#5-diff)
- [6. watch](#6-watch)
- [7. profiles](#7-profiles)
- [8. urls](#8-urls)
- [9. version](#9-version)
- [10. Selector syntax](#10-selector-syntax)
- [11. URL pattern syntax](#11-url-pattern-syntax)
- [12. Environment variables](#12-environment-variables)
- [13. Where files land](#13-where-files-land)
- [14. Recipes](#14-recipes)
- [15. Development commands](#15-development-commands)

## 1. Setup

```bash
uv sync --dev
uv run playwright install chromium
```

Everything below assumes the `uv run` prefix. Drop it inside an activated virtual environment.

There are no commit hooks. The checks run when you ask for them, in
[section 15](#15-development-commands), and on every push in CI.

## 2. Commands at a glance

    Command     Purpose
    --------    ----------------------------------------------------------------------
    crawl       Scrape URLs directly, or run a saved profile
    inspect     Probe a target before committing to a crawl
    diff        Show what changed the last time a target was snapshotted
    watch       Sweep every tracked target once, for a scheduler to call
    profiles    List the profiles this project knows about
    urls        Report what a snapshotted target is holding, by section
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
    --group                 folder to keep this target under                   none
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

## 6. watch

```text
crawlee-lab watch [OPTIONS] [NAMES...]
```

    Option      Value    Default    Meaning
    ---------   ------   --------   -----------------------------------------------
    --commit    flag     off        Commit the sweep, when data/ is versioned

`NAMES` defaults to every profile with `snapshot: true`, or to the ones in `--group GROUP`. One failing target costs only itself; the
rest of the sweep still runs. A summary lands in `data/WATCH.md`.

    Exit code   Meaning
    ---------   ----------------------------------------------------------------
    0           nothing changed
    10          at least one target changed
    1           at least one target failed, so the sweep cannot vouch for itself

A first snapshot exits 0, not 10. There is nothing yet for it to differ from.

On Windows:

```powershell
.\scripts\watch.ps1                                  # sweep, log, notify only if 10 or 1
.\scripts\register-watch-task.ps1 -Name labs-docs -Group docs-labs
.\scripts\register-watch-task.ps1 -Name labs-docs -Unregister
Start-ScheduledTask -TaskName 'labs-docs' -TaskPath '\crawlee-lab\'
Get-ScheduledTaskInfo -TaskName 'labs-docs' -TaskPath '\crawlee-lab\'
```

The task fires at every logon; the wrapper sweeps only if the current ISO week has not been swept
yet, and exits 20 without sweeping if it has. `-Group` is what the round covers, `-Profiles` names
targets instead, and neither means every profile that asks for snapshots. The task's name keys
`output/watch-<name>.log` and `output/watch-<name>.week`, the record of the last week swept, so
rounds must not share one.

## 7. profiles

```text
crawlee-lab profiles
```

Lists every profile, from `profiles/*.yaml` and from `src/crawlee_lab/sites/*.py`, with its crawler,
target and description. The target is the profile's first start URL, or its first sitemap when it is
sitemap-driven.

## 8. urls

```text
crawlee-lab urls [NAMES...] [OPTIONS]
```

Reads the manifest of every named target back and reports what it is holding, grouped by the path
that holds each page and ordered by weight. With no name, every snapshotted target is reported.

    Option            Default     Effect
    --------------    --------    -----------------------------------------------------------
    --list, -l        off         Print one URL per line and nothing else, for piping
    --depth N         off         Group by the first N path segments instead of the parent path
    --limit N         20          Maximum sections shown per target

```text
                   openai-docs: 532 pages, 26.5 MB
    section                                  pages       size   share
    --------------------------------------   -----   --------   -----
    developers.openai.com/cookbook             309    23.0 MB     58%
    developers.openai.com/api                  174     3.1 MB     33%
    developers.openai.com/plugins               30   376.4 KB      6%
```

The section is the level an `include` or `exclude` rule is written against, which is what makes the
report actionable: narrow the profile, re-run the crawl, and the pages drop out of the corpus. A
target that has never been snapshotted exits 1 and says so.

## 9. version

```text
crawlee-lab version
```

## 10. Selector syntax

    Expression            Result
    ------------------    -------------------------------------------
    h1                    Text of the first match
    .price@data-value     An attribute of the first match
    all:.tag              A list with the text of every match
    all:a@href            A list with an attribute of every match

Attributes carrying URLs (`href`, `src`, `data-src`, `srcset`, `poster`, `action` and similar) are
resolved against the page they were found on. A selector that matches nothing yields null, or an
empty list with `all:`.

## 11. URL pattern syntax

Applies to `--follow` and `--exclude`.

    Pattern                      Meaning
    -------------------------    ---------------------------------------------------
    /docs/                       The URL contains this text
    /docs/*.html                 Contains this glob, where * stops at a separator
    /docs/**                     Contains this glob, where ** crosses separators
    https://site.com/docs/**     Starts with this glob, matched against the whole URL
    re:^https://site\.com/\d+    An explicit regular expression, anchored at the start

In Git Bash or any other MSYS shell on Windows, an argument that starts with `/` is rewritten into a
Windows path before the command sees it: `--follow /docs/` arrives as `--follow C:/Program
Files/Git/docs/` and quietly matches nothing. Prefix the run with `MSYS2_ARG_CONV_EXCL='*'`, or use
PowerShell, where the pattern is passed through untouched. Quoting the pattern does not help.

## 12. Environment variables

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
    CRAWLEE_LAB_MIN_COVERAGE                0.5
    CRAWLEE_LAB_HEADLESS                    true
    CRAWLEE_LAB_DATA_DIR                    data
    CRAWLEE_LAB_OUTPUT_DIR                  output
    CRAWLEE_LAB_PROFILES_DIR                profiles

## 13. Where files land

    Path                            Tracked by git    Contents
    ----------------------------    --------------    ----------------------------------
    output/<name>.json              no                Run output in the chosen formats
    output/<name>/*.md              no                One file per page, markdown format
    profiles/<name>.yaml            no                Saved profiles
    data/<name>/pages/**            no                Snapshot payloads
    data/<name>/manifest.json       no                Every URL with its status and hash
    data/<name>/changes.json        no                Last change report, machine readable
    data/<name>/CHANGES.md          no                Last change report, with diffs
    data/WATCH.md                   no                Last sweep across every tracked target
    data/<group>/**                 no                The same, for a target that names a group
    output/<group>/<name>.jsonl     no                Run output for a grouped target
    output/watch-<name>.log         no                One line per sweep of that task
    output/watch-<name>.week        no                The last ISO week that task swept
    storage/run-<pid>/              no                Crawlee's working directory, one per run

`data/` is ignored in full, so change detection runs entirely off the local files and `--commit` has
nothing to record. Remove the entry from `.gitignore` to keep a dated history instead.

## 14. Recipes

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
uv run crawlee-lab crawl https://site.example/catalogue/ \
    --crawler parsel \
    --select title=h1 \
    --select price=.price \
    --select cover='#gallery img@src' \
    --depth 2 \
    --follow /catalogue/ \
    --exclude /catalogue/archive/ \
    --format csv
```

Scrape a page that only exists after JavaScript runs:

```bash
uv run crawlee-lab crawl https://site.example/app/listing \
    --crawler playwright \
    --select rows='all:.row .label'
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

Find the bulk in a corpus and cut it out:

```bash
uv run crawlee-lab urls my-site --depth 1
uv run crawlee-lab urls my-site --list | grep /blog/
```

Remove the section from the profile's `include`, or add it to `exclude`, then re-run the crawl. The
next snapshot reports the pages as removed and the corpus loses them.

## 15. Development commands

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest -m "not browser"
uv run pytest
uv run pytest --cov=crawlee_lab --cov-report=term-missing
```
