# Cheatsheet

Every command and every option of dyarchia-crawlee on one page. Generated against the installed CLI, not
from memory. Regenerate any section with `uv run dyarchia-crawlee <command> --help`.

## Index

- [1. Setup](#1-setup)
- [2. Commands at a glance](#2-commands-at-a-glance)
- [3. crawl](#3-crawl)
- [4. inspect](#4-inspect)
- [5. diff](#5-diff)
- [6. digest](#6-digest)
- [7. watch](#7-watch)
- [8. profiles and profile](#8-profiles-and-profile)
- [9. urls](#9-urls)
- [10. state](#10-state)
- [11. version](#11-version)
- [12. Selector syntax](#12-selector-syntax)
- [13. URL pattern syntax](#13-url-pattern-syntax)
- [14. Environment variables](#14-environment-variables)
- [15. Where files land](#15-where-files-land)
- [16. Recipes](#16-recipes)
- [17. Development commands](#17-development-commands)
- [18. The panel](#18-the-panel)

## 1. Setup

```bash
uv sync --dev
uv run playwright install chromium
```

Everything below assumes the `uv run` prefix. Drop it inside an activated virtual environment.

There are no commit hooks. The checks run when you ask for them, in
[section 17](#17-development-commands), and on every push in CI.

## 2. Commands at a glance

    Command     Purpose
    --------    ----------------------------------------------------------------------
    crawl       Scrape URLs directly, or run a saved profile
    inspect     Probe a target before committing to a crawl
    diff        Show what changed the last time a target was snapshotted
    digest      Bundle those changes for whatever step runs after the sweep
    watch       Sweep every tracked target once, in one locked round
    profiles    List the profiles this project knows about
    profile     Show one profile as written, or save one from standard input
    urls        Report what a snapshotted target is holding, by section
    state       Report every corpus across every repository, in one answer
    version     Print the installed version

## 3. crawl

```text
dyarchia-crawlee crawl [OPTIONS] [URLS]...
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
dyarchia-crawlee inspect [--render] URL
```

    Option      Meaning
    ---------   ---------------------------------------------------------------
    --render    Also render in a browser to confirm the static diagnosis

Reports HTTP status and content type, page title, HTML size, link count, whether robots.txt allows
the URL, any declared crawl delay, discovered sitemaps, whether a markdown variant of the page
exists, how much content survives static extraction, and which crawler that implies.

The variant probe offers the same places a run would fetch from, `fetch_suffix` included: the
extension replaced, then the suffix appended, and both forms of a section root. A site that
serves `guide/page.md` for `guide/page.html` is therefore reported as having one, where asking
only for `guide/page.html.md` would have said it has none.

## 5. diff

```text
dyarchia-crawlee diff [OPTIONS] NAME
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
dyarchia-crawlee digest [OPTIONS] [NAMES...]
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

Every section stops at `--limit`, and a document that was cut says so in its header rather than only
at the cut, which is thousands of lines below the sentence promising every page. Section headings
carry the true count either way, and the target's own `CHANGES.md` holds the untruncated list. A
digest that fits under the limit says nothing about one.

Pages that only reordered are listed under their own heading and never counted as a change, so a
digest of a sweep that found nothing but shuffled table rows says "no change".

Neither is a change report older than the last sweep. A run that finds nothing rewrites nothing, so
the report left on disk can be weeks old; when `WATCH.json` shows a sweep newer than the report, the
target is reported as unchanged and its stale pages are not carried forward.

```bash
dyarchia-crawlee digest --changed --group docs-labs --out digest.md
dyarchia-crawlee digest xai-docs --json
dyarchia-crawlee digest --no-diffs --limit 10
```

## 7. watch

```text
dyarchia-crawlee watch [OPTIONS] [NAMES...]
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
    30          another round over this group is running, so this one did nothing

A first snapshot exits 0, not 10. There is nothing yet for it to differ from. Neither is a page
that only reordered: it is stored, listed and labelled, and left out of the verdict.

One round over a group at a time. The lock is held by the operating system for the life of the
process, in `<output>/locks/`, so a round that is killed leaves nothing to clean up. A refused round
says who holds it and does nothing else.

A round is started by a person. The change reports a sweep writes are overwritten by the next one,
so a sweep that changed is bundled in the same sitting:

```bash
uv run dyarchia-crawlee watch --group docs-labs --commit
uv run dyarchia-crawlee digest --changed --group docs-labs --out digest.md
```

## 8. profiles and profile

```text
dyarchia-crawlee profiles [--json]
dyarchia-crawlee profile show NAME
dyarchia-crawlee profile save NAME [--allow-untracked]
```

`profiles` lists every profile, from `profiles/*.yaml` and from `src/dyarchia_crawlee/sites/*.py`,
with its crawler, target and description. The target is the profile's first start URL, or its first
sitemap when it is sitemap-driven. `--json` emits the same list as data, for a front end.

`profile` operates on exactly one, as the text it is on disk. `show` prints it verbatim, comments
included, because a profile's comments hold the measurements that justify its rules and a rendering
from the model drops every one of them. A profile that ships as a Python module has no file, so that
one is rendered and says so on stderr rather than in the document.

`save` reads YAML from standard input and writes it exactly as given, after parsing it to refuse a
broken one before it lands: an unknown key, a profile that names no source, or a name that would not
be found again are each rejected with nothing written. It commits, and refuses to save where it
cannot; `--allow-untracked` is for a corpus that is deliberately not versioned.

```bash
dyarchia-crawlee profile show claude-docs > claude-docs.yaml
$EDITOR claude-docs.yaml
dyarchia-crawlee profile save claude-docs < claude-docs.yaml
```

## 9. urls

```text
dyarchia-crawlee urls [NAMES...] [OPTIONS]
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

## 10. state

```text
dyarchia-crawlee state [OPTIONS]
```

    Option         Value   Default        Meaning
    ------------   -----   ------------   ---------------------------------------------
    --repository   path    from .env      A corpus repository to read. Repeatable.
    --json         flag    off            Emit JSON instead of a table

One answer for every repository asked about: each corpus with its group, pages, size, when its last
change report was written, and whether that report is current, stale, quiet or unreadable. Each
repository also reports its git head and whether it has uncommitted work.

It exists so that whatever reads it next -- a panel, a script, another tool -- does not have to walk
the manifests, rediscover where a grouped corpus lives, or decide for itself whether a change report
describes the latest sweep. The JSON names every root, so nothing has to derive them from the
convention either.

```bash
dyarchia-crawlee state
dyarchia-crawlee state --repository ../crawlee-lab-data --repository ../crawlee-salesforce-data
dyarchia-crawlee state --json
```

## 11. version

```text
dyarchia-crawlee version
```

## 12. Selector syntax

    Expression            Result
    ------------------    -------------------------------------------
    h1                    Text of the first match
    .price@data-value     An attribute of the first match
    all:.tag              A list with the text of every match
    all:a@href            A list with an attribute of every match

Attributes carrying URLs (`href`, `src`, `data-src`, `srcset`, `poster`, `action` and similar) are
resolved against the page they were found on. A selector that matches nothing yields null, or an
empty list with `all:`.

## 13. URL pattern syntax

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

## 14. Environment variables

Read from the environment or from a `.env` file. All are prefixed `DYARCHIA_CRAWLEE_`.

    Variable                                Default
    ------------------------------------    ----------------------------------
    DYARCHIA_CRAWLEE_USER_AGENT                  dyarchia-crawlee/0.1 (+...)
    DYARCHIA_CRAWLEE_MIN_CONCURRENCY             1
    DYARCHIA_CRAWLEE_DESIRED_CONCURRENCY         3
    DYARCHIA_CRAWLEE_MAX_CONCURRENCY             8
    DYARCHIA_CRAWLEE_MAX_REQUESTS_PER_MINUTE     60
    DYARCHIA_CRAWLEE_MAX_REQUEST_RETRIES         3
    DYARCHIA_CRAWLEE_REQUEST_TIMEOUT_SECONDS     60
    DYARCHIA_CRAWLEE_RESPECT_ROBOTS              true
    DYARCHIA_CRAWLEE_MIN_SUCCESS_RATE            0.9
    DYARCHIA_CRAWLEE_MIN_COVERAGE                0.5
    DYARCHIA_CRAWLEE_HEADLESS                    true
    DYARCHIA_CRAWLEE_DATA_DIR                    data
    DYARCHIA_CRAWLEE_OUTPUT_DIR                  output
    DYARCHIA_CRAWLEE_PROFILES_DIR                profiles

## 15. Where files land

    Path                            Root                        Contents
    ----------------------------    ------------------------    ----------------------------------
    <profiles>/<name>.yaml          DYARCHIA_CRAWLEE_PROFILES_DIR    Saved profiles
    <data>/<name>/pages/**          DYARCHIA_CRAWLEE_DATA_DIR        Snapshot payloads
    <data>/<name>/manifest.json     DYARCHIA_CRAWLEE_DATA_DIR        Every URL with its status and hash
    <data>/<name>/changes.json      DYARCHIA_CRAWLEE_DATA_DIR        Last change report, machine readable
    <data>/<name>/CHANGES.md        DYARCHIA_CRAWLEE_DATA_DIR        Last change report, with diffs
    <data>/WATCH.md                 DYARCHIA_CRAWLEE_DATA_DIR        Last sweep across every target
    <data>/WATCH.json               DYARCHIA_CRAWLEE_DATA_DIR        The same sweep, as data
    <data>/<group>/**               DYARCHIA_CRAWLEE_DATA_DIR        The same, for a grouped target
    <output>/<name>.json            DYARCHIA_CRAWLEE_OUTPUT_DIR      Run output in the chosen formats
    <output>/<name>/*.md            DYARCHIA_CRAWLEE_OUTPUT_DIR      One file per page, markdown format
    <output>/<group>/<name>.jsonl   DYARCHIA_CRAWLEE_OUTPUT_DIR      Run output for a grouped target
    <output>/watch-<name>.log       DYARCHIA_CRAWLEE_OUTPUT_DIR      One line per sweep of that task
    <output>/watch-<name>.out       DYARCHIA_CRAWLEE_OUTPUT_DIR      That sweep's own output, as it arrives
    <output>/watch-<name>.week      DYARCHIA_CRAWLEE_OUTPUT_DIR      The week, attempts, whether it finished
    <output>/digest-<name>.md       DYARCHIA_CRAWLEE_OUTPUT_DIR      What -OnChange is handed, when it runs
    <storage>/run-<pid>/            DYARCHIA_CRAWLEE_STORAGE_DIR     Crawlee's working directory, per run

None of those roots is this checkout. The corpora, the profiles and the output live in a sibling
repository, where the first two are tracked and the third is deliberately not; the working directory
is scratch and goes to a temporary path. Each root defaults to a folder of that name under the
project root, which is what a fresh clone with no `.env` gets. `--commit` writes to whichever
repository owns the data directory.

## 16. Recipes

Scout a target before writing anything:

```bash
uv run dyarchia-crawlee inspect https://site.example/docs/intro
```

Grab one page as clean markdown:

```bash
uv run dyarchia-crawlee crawl https://site.example/article --extract auto --format md
```

Extract structured fields across a catalogue:

```bash
uv run dyarchia-crawlee crawl https://site.example/catalogue/ \
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
uv run dyarchia-crawlee crawl https://site.example/app/listing \
    --crawler playwright \
    --select rows='all:.row .label'
```

Harvest structured data instead of prose:

```bash
uv run dyarchia-crawlee crawl https://site.example/product/1 --extract jsonld
```

Collect every link on a page:

```bash
uv run dyarchia-crawlee crawl https://site.example/ --extract links
```

Freeze a working run and replay it:

```bash
uv run dyarchia-crawlee crawl https://site.example/ --select title=h1 --save-profile my-site
uv run dyarchia-crawlee crawl --profile my-site --max-pages 10
```

Track a documentation site over time:

```bash
uv run dyarchia-crawlee crawl --profile claude-docs --commit
uv run dyarchia-crawlee diff claude-docs --unified
```

Go slower on a fragile target:

```bash
uv run dyarchia-crawlee crawl https://site.example/ --concurrency 1 --rate 10 --depth 2
```

Scrape something you own, ignoring its robots.txt:

```bash
uv run dyarchia-crawlee crawl https://staging.mysite.internal/ --ignore-robots
```

Find the bulk in a corpus and cut it out:

```bash
uv run dyarchia-crawlee urls my-site --depth 1
uv run dyarchia-crawlee urls my-site --list | grep /blog/
```

Remove the section from the profile's `include`, or add it to `exclude`, then re-run the crawl. The
next snapshot reports the pages as removed and the corpus loses them.

## 17. Development commands

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest -m "not browser"
uv run pytest
uv run pytest --cov=dyarchia_crawlee --cov-report=term-missing
```


## 18. The panel

The Dyarchia Desktop plugin in `dyarchia-plugin/`: the corpus in front of you, a round on a button,
and a target written or edited without leaving the window.

```bash
py scripts/install_plugin.py
py scripts/install_plugin.py --uninstall
```

It installs into `%APPDATA%/dyarchia/plugins/dyarchia/` with a `home` file naming this checkout.
Restart the shell afterwards: main modules are imported once, at startup.

    Channel     Runs                              Answers
    ---------   -------------------------------   --------------------------------------
    state       state --json                      every corpus, in place
    profiles    profiles --json                   the list, in place
    show        profile show NAME                 the YAML, in place
    save        profile save NAME                 what was written, in place
    start       watch ... or inspect URL          streams, then a verdict on `done`
    stop        kills the running process         whether there was one

The panel holds no crawling logic and no schema. Everything it does, the CLI does, which is why a
button and a prompt cannot disagree about what a round is.
