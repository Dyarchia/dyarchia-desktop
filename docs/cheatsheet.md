# Cheatsheet

Every command and every option of crawlee-lab on one page. Generated against the installed CLI, not
from memory. Regenerate any section with `uv run crawlee-lab <command> --help`.

## Index

- [1. Setup](#1-setup)
- [2. Commands at a glance](#2-commands-at-a-glance)
- [3. crawl](#3-crawl)
- [4. inspect](#4-inspect)
- [5. diff](#5-diff)
- [6. digest](#6-digest)
- [7. watch](#7-watch)
- [8. profiles](#8-profiles)
- [9. urls](#9-urls)
- [10. version](#10-version)
- [11. Selector syntax](#11-selector-syntax)
- [12. URL pattern syntax](#12-url-pattern-syntax)
- [13. Environment variables](#13-environment-variables)
- [14. Where files land](#14-where-files-land)
- [15. Recipes](#15-recipes)
- [16. Development commands](#16-development-commands)

## 1. Setup

```bash
uv sync --dev
uv run playwright install chromium
```

Everything below assumes the `uv run` prefix. Drop it inside an activated virtual environment.

There are no commit hooks. The checks run when you ask for them, in
[section 16](#16-development-commands), and on every push in CI.

## 2. Commands at a glance

    Command     Purpose
    --------    ----------------------------------------------------------------------
    crawl       Scrape URLs directly, or run a saved profile
    inspect     Probe a target before committing to a crawl
    diff        Show what changed the last time a target was snapshotted
    digest      Bundle those changes for whatever step runs after the sweep
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

`NAME` is the profile or run name that was snapshotted. `changes.json` and `CHANGES.md` hold the
last run and nothing before it, because every run overwrites them. For anything earlier, use git in
the repository that holds the corpora:

```bash
git -C ../crawlee-lab-data log -- data/docs-labs/claude-docs
git -C ../crawlee-lab-data diff HEAD~1 -- data/docs-labs/claude-docs/CHANGES.md
```

## 6. digest

```text
crawlee-lab digest [OPTIONS] [NAMES...]
```

    Option        Value    Default   Meaning
    -----------   ------   -------   ---------------------------------------------------
    --group       str      none      Digest only the targets in this group
    --changed     flag     off       Leave out the targets that did not change
    --json        flag     off       Emit JSON instead of markdown
    --no-diffs    flag     on        Leave the per-page diffs out
    --limit       int      50        Maximum pages listed per section
    --out         path     stdout    Write to this file instead of standard output

`NAMES` defaults to every profile with `snapshot: true`. Each changed page is listed with its URL,
its diff and the path to the file holding its current text, so a step that reads this can read the
page in full instead of inferring it from the diff.

Pages that only reordered are listed under their own heading and never counted as a change, so a
digest of a sweep that found nothing but shuffled table rows says "no change".

```bash
crawlee-lab digest --changed --group docs-labs --out digest.md
crawlee-lab digest xai-docs --json
crawlee-lab digest --no-diffs --limit 10
```

## 7. watch

```text
crawlee-lab watch [OPTIONS] [NAMES...]
```

    Option      Value    Default    Meaning
    ---------   ------   --------   -----------------------------------------------
    --commit    flag     off        Commit the sweep, when data/ is versioned

`NAMES` defaults to every profile with `snapshot: true`, or to the ones in `--group GROUP`. One failing target costs only itself; the
rest of the sweep still runs. A summary lands in `WATCH.md`, and the same verdict as data in
`WATCH.json`, which is what a step after the sweep should read.

    Exit code   Meaning
    ---------   ----------------------------------------------------------------
    0           nothing changed
    10          at least one target changed
    1           at least one target failed, so the sweep cannot vouch for itself

A first snapshot exits 0, not 10. There is nothing yet for it to differ from. Neither is a page
that only reordered: it is stored, listed and labelled, and left out of the verdict.

On Windows:

```powershell
.\scripts\watch.ps1                                  # sweep, log, notify only if 10 or 1
.\scripts\register-watch-task.ps1 -Name labs-docs -Group docs-labs
.\scripts\register-watch-task.ps1 -Name labs-docs -Unregister
Start-ScheduledTask -TaskName 'labs-docs' -TaskPath '\crawlee-lab\'
Get-ScheduledTaskInfo -TaskName 'labs-docs' -TaskPath '\crawlee-lab\'
```

    Parameter       Applies to             Meaning                                 Default
    -------------   --------------------   -------------------------------------   ---------
    -Name           both scripts           names the task, the log and the record   labs-docs
    -Group          both scripts           sweep only that group                    none
    -Profiles       both scripts           sweep only those profiles                all
    -Commit         both scripts           commit every snapshot that moved         no
    -OnChange       both scripts           script to run when something changed     none
    -OncePerWeek    watch.ps1              skip a week already swept                no
    -MaxAttempts    watch.ps1              attempts per week before giving up       2
    -Hours          register-...ps1        the task's execution time limit          3
    -Delay          register-...ps1        wait after logon before firing           PT2M
    -Unregister     register-...ps1        delete the task of that name             no

The task fires at every logon; the wrapper sweeps only if the current ISO week has not been swept
yet, and exits 20 without sweeping if it has. A week that is attempted and does not finish is
attempted again, up to `-MaxAttempts`, and then given up on with one desktop notification: without
that bound, a sweep that cannot finish starts again at every logon for the rest of the week. The task passes `-OncePerWeek`; running the wrapper by
hand does not, so a manual sweep always sweeps. `-Group` is what the round covers, `-Profiles` names
targets instead, and neither means every profile that asks for snapshots. The task's name keys
`output/watch-<name>.log` and `output/watch-<name>.week`, the record of the last week swept, so
rounds must not share one.

`-OnChange` runs only on exit 10. The wrapper writes `<output>/digest-<name>.md` first and hands
that path to the script as its one argument; a follow-up that fails is logged and announced rather
than swallowed. It takes a path and not a command line because what to do with a change belongs
outside this toolkit. See `scripts/on-change.example.ps1`.

```powershell
.\scripts\watch.ps1 -Group docs-labs -OncePerWeek -Commit -OnChange .\scripts\on-change.ps1
```

## 8. profiles

```text
crawlee-lab profiles
```

Lists every profile, from `profiles/*.yaml` and from `src/crawlee_lab/sites/*.py`, with its crawler,
target and description. The target is the profile's first start URL, or its first sitemap when it is
sitemap-driven.

## 9. urls

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

## 10. version

```text
crawlee-lab version
```

## 11. Selector syntax

    Expression            Result
    ------------------    -------------------------------------------
    h1                    Text of the first match
    .price@data-value     An attribute of the first match
    all:.tag              A list with the text of every match
    all:a@href            A list with an attribute of every match

Attributes carrying URLs (`href`, `src`, `data-src`, `srcset`, `poster`, `action` and similar) are
resolved against the page they were found on. A selector that matches nothing yields null, or an
empty list with `all:`.

## 12. URL pattern syntax

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

## 13. Environment variables

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

## 14. Where files land

    Path                            Root                        Contents
    ----------------------------    ------------------------    ----------------------------------
    <profiles>/<name>.yaml          CRAWLEE_LAB_PROFILES_DIR    Saved profiles
    <data>/<name>/pages/**          CRAWLEE_LAB_DATA_DIR        Snapshot payloads
    <data>/<name>/manifest.json     CRAWLEE_LAB_DATA_DIR        Every URL with its status and hash
    <data>/<name>/changes.json      CRAWLEE_LAB_DATA_DIR        Last change report, machine readable
    <data>/<name>/CHANGES.md        CRAWLEE_LAB_DATA_DIR        Last change report, with diffs
    <data>/WATCH.md                 CRAWLEE_LAB_DATA_DIR        Last sweep across every target
    <data>/WATCH.json               CRAWLEE_LAB_DATA_DIR        The same sweep, as data
    <data>/<group>/**               CRAWLEE_LAB_DATA_DIR        The same, for a grouped target
    <output>/<name>.json            CRAWLEE_LAB_OUTPUT_DIR      Run output in the chosen formats
    <output>/<name>/*.md            CRAWLEE_LAB_OUTPUT_DIR      One file per page, markdown format
    <output>/<group>/<name>.jsonl   CRAWLEE_LAB_OUTPUT_DIR      Run output for a grouped target
    <output>/watch-<name>.log       CRAWLEE_LAB_OUTPUT_DIR      One line per sweep of that task
    <output>/watch-<name>.out       CRAWLEE_LAB_OUTPUT_DIR      That sweep's own output, as it arrives
    <output>/watch-<name>.week      CRAWLEE_LAB_OUTPUT_DIR      The week, attempts, whether it finished
    <output>/digest-<name>.md       CRAWLEE_LAB_OUTPUT_DIR      What -OnChange is handed, when it runs
    <storage>/run-<pid>/            CRAWLEE_LAB_STORAGE_DIR     Crawlee's working directory, per run

None of those roots is this checkout. The corpora, the profiles and the output live in a sibling
repository, where the first two are tracked and the third is deliberately not; the working directory
is scratch and goes to a temporary path. Each root defaults to a folder of that name under the
project root, which is what a fresh clone with no `.env` gets. `--commit` writes to whichever
repository owns the data directory.

## 15. Recipes

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

## 16. Development commands

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest -m "not browser"
uv run pytest
uv run pytest --cov=crawlee_lab --cov-report=term-missing
```
