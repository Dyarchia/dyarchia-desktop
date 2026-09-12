# crawlee

A crawling toolkit that snapshots a corpus, reports what moved between rounds, and a Dyarchia
Desktop panel that drives it. Two layers: the engine knows nothing about any specific site, and a
profile describes what to look for without touching the Crawlee API. That boundary is what makes a
new target a data change rather than a code change.

**This package runs from the workspace.** The shell scans `plugins/` and finds the panel there, so
there is nothing to install, and a packaged build does not carry it. The panel shells out to the
CLI rather than importing the toolkit, because the shell spawns one Python process per plugin with
whatever `py -3` resolves to and that interpreter has none of these dependencies. The CLI is also
the surface the tests cover, so a button that is a prompt cannot disagree with a prompt.


## Setup

Python 3.12 or newer, and uv. Browser-backed crawlers additionally need Playwright's Chromium, a
one-off download of roughly 400 MB.

```bash
uv sync --dev
uv run playwright install chromium
```

**Moving this package invalidates the venv.** The editable install records an absolute path,
so a `.venv` that travels with the folder still points at where the folder used to be and
every import of `dyarchia_crawlee` fails. `uv sync --dev` again rewrites it.

Nothing this toolkit produces lives in this repository. The corpora, the profiles that define them
and every run's output sit in their own checkout, named by `DYARCHIA_CRAWLEE_DATA_DIR`,
`DYARCHIA_CRAWLEE_PROFILES_DIR` and `DYARCHIA_CRAWLEE_OUTPUT_DIR`; Crawlee's working directory is
scratch and goes to a temporary path through `DYARCHIA_CRAWLEE_STORAGE_DIR`. All four take absolute
paths. See `.env.example`. **The matching `.gitignore` entries are guards, not homes:** they catch a
run started without a `.env`, which would otherwise drop a corpus into the tool's own tree.


## Corpus repositories

**A corpus repository is a directory with `profiles/`, `data/` and `output/` in it, versioned on
its own.** One holds one body of documentation and the rules that define it, and its history is the
history of that corpus rather than of the tool. A machine can hold several, and they share this
tool and nothing else.

`DYARCHIA_CRAWLEE_REPOSITORIES_DIR` names the folder they sit in. Every subdirectory of it holding
a `profiles/` is one, so adding a corpus is a clone into that folder rather than an edit to a
configuration file. The folder is created when it is named and not there, and never filled: an
empty repository is not a repository, and a `profiles/` of examples enrols somebody in crawling
sites they did not choose.

    with the variable                            without it
    -----------------------------------------    ------------------------------------------
    every repository under the folder, plus      one repository, the one data_dir,
    the one the other three name                 profiles_dir and output_dir name

Leaving it unset is the whole of the second column, which is what every command did before the
variable existed. Nothing about a single repository changes either way.

What each command does with more than one:

    Command     Across repositories
    ---------   ---------------------------------------------------------------------------
    profiles    lists all of them, with the repository column shown only when there are two
    state       reports every repository, and marks the one the settings name as default
    digest      one document covering the round, whichever repositories it touched
    watch       one round per repository: its own lock, its own report, its own exit code,
                and the worst of them is what the command exits with
    crawl       a named profile is crawled into the repository that defines it, never into
                whichever one the environment happened to name

**Two repositories defining one profile name is refused, not resolved.** Whichever answer the tool
picked, it would be writing somebody's corpus into somebody else's, and it would do it quietly. An
edit saved through `profile save` lands where the profile already is, for the same reason; only a
name that exists nowhere yet is new, and new goes to the default repository.


## Commands

    Command      Purpose
    ---------    -----------------------------------------------------------------------
    crawl        Scrape URLs directly, or run a saved profile
    inspect      Probe a target: robots, sitemaps, markdown variants, rendering, advice
    diff         Show what changed on a target the last time it was snapshotted
    digest       Bundle those changes into something a later step can read
    watch        Sweep every tracked target once and report whether anything moved
    urls         Report which URLs a snapshotted target holds, broken down by section
    state        Report every corpus across every repository, in one answer
    profiles     List the profiles this project knows about
    profile      Print one profile as written, or save one from standard input
    version      Print the installed version

```bash
uv run dyarchia-crawlee inspect https://docs.example.com/guide/overview
uv run dyarchia-crawlee crawl https://docs.example.com/guide/overview \
    --crawler parsel --select title=h1 --depth 2 --max-pages 40 --follow /guide/ --format csv
uv run dyarchia-crawlee crawl https://docs.example.com/x --select title=h1 --save-profile my-site
uv run dyarchia-crawlee crawl --profile my-site --snapshot --commit
uv run dyarchia-crawlee diff my-site --unified
```

`--save-profile` writes only the fields that differ from the defaults. Running a profile takes it
as the baseline and **only flags actually typed override it** — a flag left alone never overrides,
even when its default differs.

    Crawler          Use when
    -------------    ----------------------------------------------------------------
    http             The response is already what you want: markdown, JSON, plain text
    beautifulsoup    Ordinary HTML, tolerant parsing of messy markup
    parsel           Ordinary HTML, faster on large documents
    playwright       Content only exists after JavaScript runs
    adaptive         You do not know, and would rather not pay for a browser by default

`adaptive` is the default: it runs the cheap static path first and escalates to a browser only when
that path comes back empty.


## Extraction

    Mode       Result
    -------    -----------------------------------------------------------------
    auto       Main content as markdown, with navigation and boilerplate removed
    text       Plain text of the whole document
    html       The markup as fetched
    links      Every link on the page, resolved to absolute URLs
    jsonld     schema.org structured data
    none       Nothing, useful when only the selectors matter

The header and footer nearly every page of a run shares are removed once the run is collected, not
per page: **a single page cannot tell its banner from its content; the corpus can.**
`--keep-boilerplate` opts out.

Three repairs exist because their absence was measured, and each refuses to act unless it
demonstrably works. A document fetched as markdown from its publisher is never touched by any of
them — that one is stored as published.

- **A renderer emitting one bare `div` per line of a sample** offers no `pre` for extraction to
  recognise, so the sample is dropped as layout. Five recipe pages carried 1,411 lines of code and
  extraction kept 134; rewriting such a run as the one `pre` it was meant to be brought the same
  five to 1,305.
- **A one-line `pre` renders as inline code** and glues the next opening fence onto the end of that
  line. 26 pages of one corpus were inverted from that point on, with 444 lines of prose fenced
  between them. The second newline goes inside the innermost `code`, since one outside it stops the
  glue and leaves the sample inline.
- **Extraction can close a paragraph and open a code block on one line**, leaving a delimiter no
  parser sees and inverting every fence after it. The repair attempts every document rather than
  only those ending mid-fence, because a page where it happened twice is inverted and balanced at
  once: 50 such lines sat in the corpora reading as healthy. 49 are repaired; the one that is not
  sits on a page broken for another reason, where a guess is worth less than the break.

MDX pages that define their component ahead of the prose have that definition removed outright and
the invocation kept — where a widget stood is worth knowing, the four hundred lines that built it
are not. Code fences are exempt throughout: a page teaching JavaScript is a page whose
`export const` is the lesson.


## Profiles

A profile is a named, reusable target definition carrying exactly the fields a command line
carries, so nothing can be expressed in one and not the other. Two sources share one namespace:
YAML in `profiles/`, and Python modules under `src/dyarchia_crawlee/sites/` exposing a `PROFILE`.
YAML wins over a Python module of the same name. **Unknown keys are rejected rather than ignored**,
so a typo is a loud error and not a setting that quietly never applied.

Profiles are not tracked by git: a profile describes somebody's corpus rather than the tool, so it
lives in the repository that holds the pages it describes. The package ships one worked example,
and it deliberately does not ask to be snapshotted — it is present in every corpus repository, so
one that asked would enrol itself in every round swept on the machine.

Sources. At least one of `start_urls` or `sitemap_urls` is required.

    Field           Type      Default     Meaning
    ------------    ------    --------    ------------------------------------------------
    name            string    filename    Profile name, also used for output filenames
    group           string    none        Folder this target's files are kept under
    description     string    none        Shown when listing profiles
    start_urls      list      empty       URLs the crawl begins from
    sitemap_urls    list      empty       Sitemaps to seed requests from
    fetch_suffix    string    none        The markdown twin of a page

`fetch_suffix` asks for the variant of a page rather than the page, and where it goes depends on the
publisher, so more than one place is tried: `page` is looked for at `page.md` then `page/index.md`,
and `page.html` at `page.md` first, because a site naming the extension is saying the twin replaces
it. The manifest still records the page by the URL the sitemap gave, so a corpus points at pages
that exist.

**The page itself is always the last candidate**, because a publisher that mirrors most of its
pages does not mirror all of them, and a page with no twin is still content. Asking for it is also
what tells the two failures apart: a 404 there means the site serves nothing at that URL, so the
sitemap entry is stale, and that is the only one of the two worth reporting. One sweep of
learn.chatgpt.com had both: two pages that publish no twin, and one URL the site had dropped.

A group is a folder and a round in one: snapshots go under `data/<group>/<name>/`, output to
`output/<group>/<name>.jsonl`, and the target joins `watch --group <group>`. **Changing the group of
a profile does not move the files it already wrote.** Move `data/<name>/` into `data/<group>/`
yourself, or the next run finds no manifest, calls itself a first snapshot and rewrites the corpus
with no change detected. Reading tolerates the gap; writing does not.

    Field                     Type       Default          Meaning
    ----------------------    -------    -------------    ------------------------------------
    crawler                   enum       adaptive         http, beautifulsoup, parsel,
                                                          playwright, adaptive
    extract                   enum       auto             auto, text, html, links, jsonld, none
    selectors                 mapping    empty            Field name to selector expression
    max_depth                 int        0                Link hops to follow, 0 means none
    max_pages                 int        none             Stop after this many pages
    link_selector             string     a                CSS selector for links to follow
    strategy                  enum       same-hostname    all, same-domain, same-hostname,
                                                          same-origin
    include                   list       empty            Patterns a URL must match to be followed
    exclude                   list       empty            Patterns a URL must not match
    respect_robots            bool       true             Honour robots.txt, including Crawl-delay
    user_agent                string     none             Overrides the configured User-Agent
    stealth                   bool       false            Impersonate a browser instead
    max_concurrency           int        none             Cap on parallel requests
    max_requests_per_minute   float      none             Cap on request rate
    max_request_retries       int        none             Retries per request
    headless                  bool       true             Run the browser without a window
    block_resources           list       image/media/font Resource types to abort
    formats                   list       json             json, jsonl, csv, md
    snapshot                  bool       false            Store content under data/, report changes
    min_success_rate          float      none             Below this share of successes, no snapshot
    min_coverage              float      none             Below this share of the previous corpus
    trim_boilerplate          bool       true             Drop the shared header and footer

**The two thresholds answer different questions.** `min_success_rate` asks how many of the pages
this run attempted came back; `min_coverage` asks how much of the previous snapshot this run reached
at all. A run capped by `--max-pages` scores a perfect success rate and would delete everything it
never visited, which is what coverage is there to stop.

Selectors are a small extension of CSS, so a whole extraction fits on a command line:

    Expression             Result
    -------------------    --------------------------------------------------
    h1                     Text of the first match
    .price@data-value      An attribute of the first match
    all:.tag               A list with the text of every match
    all:a@href             A list with an attribute of every match

Attributes carrying URLs (`href`, `src`, `data-src`, `srcset`, `poster`, `action`) are resolved
against the page they were found on. A selector matching nothing yields `null`, or an empty list
under `all:`; the field is always present, which keeps CSV columns stable across pages.

URL patterns, used by `include`, `exclude`, `--follow` and `--exclude`:

    Pattern                       Meaning
    --------------------------    ---------------------------------------------------
    /docs/                        The URL contains this text
    /docs/*.html                  Contains this glob, where * stops at a separator
    /docs/**                      Contains this glob, where ** crosses separators
    https://site.com/docs/**      Starts with this glob, matched against the whole URL
    re:^https://site\.com/\d+     An explicit regular expression, anchored at the start

The first three forms exist because Crawlee's own globs are anchored against the whole URL: a
pattern like `**/docs/**` matches nothing, since `**` does not cross the empty segment inside
`https://`, and it fails silently.


## Snapshots and rounds

`--snapshot` writes each page to `data/<name>/pages/<host>/<path>.md`, mirroring the URL structure,
with hashes and per-URL status in a manifest beside it. **Detection does not depend on git**: the
manifest holds the previous hash and the stored pages hold the previous text, so every run reports
what was added, removed and modified against what is on disk, committed or not. `--commit` stages a
snapshot only when its content fingerprint moved, writes to whichever repository owns the data
directory, and is never implicit.

A run that failed too often writes nothing, because half a snapshot reads as a mass deletion on the
next comparison. A run that found nothing rewrites nothing.

`watch` sweeps a whole corpus in one round, letting one failing target cost only itself, and answers
through its exit code:

    Code    Meaning
    ----    ----------------------------------------------------------------
    0       nothing changed, and nothing needs reading
    10      at least one target changed
    1       at least one target failed, so the sweep cannot vouch for itself
    30      another round already holds the lock

- **A first snapshot is not a change.** There is nothing yet for it to differ from, and a monitor
  that cries on its own first run teaches you to ignore it.
- **Neither is a reordering.** A page whose lines are the same in a different order is classified
  `reordered`, listed everywhere it would have been listed, and left out of the verdict. It rewrites
  the stored page, because the page did change; it does not raise the exit code, because nothing it
  says did. Three of them woke a notification on one real sweep and told nobody anything.
- **A round is started by a person and nothing starts one by itself.** `watch` takes a lock on the
  group before crawling and exits 30 without crawling if another round holds it, so a second window
  or a second button costs nothing but the message saying who got there first.

`urls` reads the manifest back and reports what a target actually holds, grouped by path and ordered
by weight, which is how a sitemap's bulk gets separated from the sections paying their way.
`--depth` rolls the grouping up to the first N segments; `--list` prints one URL per line for
piping.


## The panel

The corpus in front of you, a round on a button, and a target written or edited without leaving the
window. `uv sync --dev` here once, or the panel has no interpreter to call and says so. Restart the
shell after changing `main.py`: main modules are imported once, at startup.

Two things to know before using it. A round is one process, so stopping it kills the crawl where it
stands, which is safe — the lock is released by the kernel and Crawlee's working directory is
scratch. And saving a target commits it: a profile lives in the repository that holds its corpus,
and the panel refuses to write one it cannot commit rather than leaving an edit nobody can find
again.


## What a run says

**A round is read as a narrative, so three recurring lines are dropped before they reach it.** Each
is matched exactly, on its own logger, and everything else those loggers emit still arrives. A run
started with `--verbose` is left alone entirely: the operator asked for DEBUG and gets it.

    dropped                              emitted by                who wanted it
    ----------------------------------   -----------------------   -----------------------------
    empty link: <target>                 trafilatura.xml           nobody: see below
    Current request statistics + table   the crawler, every 60s    the progress line above it
    current_concurrency = 0; cpu = 0     crawlee's autoscaler      the numbers it was configured
                                                                   with

`Final request statistics` stays. It is the summary of the run, printed once when a crawler
finishes, and it is the table worth reading.

`empty link` is accurate and unactionable. Trafilatura warns once per anchor whose own text is
empty, which on a documentation index is every card in the grid, and what the extraction drops is
the card's href alone: the card's text is kept, and every destination is a sitemap entry the same
run fetches on its own. Measured on `ai.google.dev/gemini-api/docs`, nine warnings for nine cards
and no prose lost. One sweep of the AI corpora emitted forty-five of them at eight lines each,
which was four fifths of everything it printed.

Silencing is not the general answer to a noisy line, and the two filters this toolkit installs are
opposite cases. Crawlee's crawl-delay warning is *wrong* on the seeded path and is dropped there
only. This one is right, and is dropped because being right about an anchor nobody can act on is
not worth burying the round in.


## A 404 is an answer, not a fault

**A run learns from a 404 when somebody else chose the URL.** A suffixed run is told that the twin
does not live there; a sitemap-seeded run is told that the site lists something it no longer
serves. Both runs set `ignore_http_error_status_codes`, so the 404 arrives at the handler as an
ordinary response and the status is read there: no exception, no traceback, nothing in
`requests_failed`, and no round claiming it cannot vouch for itself over somebody's stale index.
The entry is recorded as a failure of its own, which is what `diff` and the manifest report.

Only a run whose every URL came from the sitemap calls the entry stale. One that follows links may
have found the 404 behind a broken link on the site instead: the same outcome for the corpus, a
different thing to say about it.

**A URL typed on the command line is the exception and stays loud.** Nobody listed it, the operator
asked for it by name, and a 404 there is the answer to their question rather than a fact about
somebody's index.

    run                              a 404 is
    ------------------------------   -------------------------------------------
    crawl <url>                      an error: it raises and the run reports it
    crawl --profile, from a sitemap  a stale entry, recorded and counted
    any run with fetch_suffix        the twin is not here, so try the next place


## Politeness

robots.txt is respected by default, including `Crawl-delay`, requests are rate limited per domain
with backoff on HTTP 429, and the User-Agent identifies the tool rather than impersonating a
browser. Each can be overridden, `--ignore-robots` loudly, but the defaults assume you are a guest
on someone else's server.

**`Crawl-delay` takes one extra step here, and crawlee's own warning is wrong about it.** Crawlee
applies the directive only when the crawler's `request_manager` *is* a `ThrottlingRequestManager`,
and a sitemap-seeded run wraps that throttler in a `RequestManagerTandem` — the supported shape,
since the crawler takes no request loader beside its manager. So the check fails, the delay is never
handed over, and every seeded profile crawls at full speed no matter what robots.txt asks. 429
backoff is unaffected, because the throttler records that itself. `apply_robots_crawl_delay` reads
the directive with crawlee's parser and sets it on the throttler before the tandem hides it, and the
warning is filtered off that one path, because a line saying the opposite of what the run does
outlives everyone's memory of why it was wrong. It survives everywhere it is true: with no
throttler built — a URL with no hostname is enough — nothing enforces the directive and the
warning is the only notice you get. None of the nine profiles on this machine declares a
`Crawl-delay`, so this changed no observed behaviour and exists for the target that eventually
does.

Nothing here costs money. The whole stack is open source and runs locally; Apify Cloud, paid proxies
and LLM-assisted extraction are deliberately out of scope, and no model is consulted at any point
between a URL going in and a snapshot coming out.


## Development

```bash
uv run ruff check .
uv run ruff format .
uv run mypy
uv run pytest
uv run pytest -m "not browser"
```

The suite runs offline: tests that need a website get a fixture site served on localhost, and the
only mark is `browser`, for the tests needing Chromium. 362 tests in about a minute.

The fixture server generates its sitemaps rather than serving them from disk, because crawlee
refuses a relative `<loc>` and a static file cannot name the port the server picked at startup.
`/sitemap-live.xml` lists two pages that are there and `/sitemap-stale.xml` lists one that is not,
which is the shape both learn.chatgpt.com and docs.mistral.ai arrive in.

**Nothing the panel calls may import the crawler stack at module scope.** `crawlee.crawlers` costs
three seconds to import: it brings Playwright, and through the adaptive crawler's rendering-type
predictor it brings scikit-learn. The panel spawns a fresh process for every click, so a stray
import makes listing profiles pay for a browser and a machine-learning library — `state` measured
2.99s for reading files off disk, because it reached `digest` for a filename, which reached `watch`
for a constant, which imported `engine`. `execute` is now imported inside `sweep` and inside the two
commands that crawl, and the read paths cost 0.33s. Measure with `python -X importtime -c "import
dyarchia_crawlee.cli"` before adding an import near the top of `cli.py`, `state.py`, `digest.py` or
`watch.py`.

This was a repository of its own until 2026-09-11, when dyarchia-desktop absorbed it with its
history. Its history carries a target inventory that was taken out of the README; the repository is
private, so it is contained, and opening it is the moment to rewrite that history.
