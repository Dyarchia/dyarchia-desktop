# dyarchia-crawlee

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
uv run dyarchia-crawlee inspect https://code.claude.com/docs/en/overview
```

Scrape a page with no configuration at all:

```bash
uv run dyarchia-crawlee crawl https://code.claude.com/docs/en/overview
```

Pull specific fields, follow links, write CSV:

```bash
uv run dyarchia-crawlee crawl https://code.claude.com/docs/en/overview \
    --crawler parsel \
    --select title=h1 \
    --depth 2 \
    --max-pages 40 \
    --follow /docs/en/ \
    --format csv
```

Freeze that run and replay it later:

```bash
uv run dyarchia-crawlee crawl https://code.claude.com/docs/en/overview \
    --select title=h1 --save-profile my-site
uv run dyarchia-crawlee crawl --profile my-site
```

Track a target over time:

```bash
uv run dyarchia-crawlee crawl --profile claude-docs --snapshot --commit
uv run dyarchia-crawlee diff claude-docs --unified
```

## Commands

    Command      Purpose
    ---------    -----------------------------------------------------------------------
    crawl        Scrape URLs directly, or run a saved profile
    inspect      Probe a target: robots, sitemaps, markdown variants, rendering, advice
    diff         Show what changed on a target the last time it was snapshotted
    digest       Bundle those changes into something a later step can read
    watch        Sweep every tracked target once and report whether anything moved
    urls         Report which URLs a snapshotted target is holding, broken down by section
    state        Report every corpus across every repository, in one answer
    profiles     List the profiles this project knows about
    profile      Print one profile as it is written, or save one from standard input
    version      Print the installed version

Run `uv run dyarchia-crawlee crawl --help` for the full option list.

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

Code blocks are rebuilt before extraction rather than repaired after it, in two passes over the
HTML. A renderer that emits one bare `div` per line of a sample offers no `pre` and no `code` for
extraction to recognise, so it drops the sample as layout: five Claude Cookbook recipes carried
1,411 lines of code between them and extraction kept 134. Such a run of lines is rewritten as the
one `pre` it was meant to be, which brought the same five to 1,305.

A block holding a single line is then given a second one, because extraction renders a one-line
`pre` as inline code and glues the opening fence of the block after it to the end of that line. 26
mistral-docs pages were inverted from that point on, with 444 lines of prose fenced between them;
afterwards, none. The newline goes inside the innermost `code` element, since a newline outside it
stops the glue and leaves the sample inline. A page that marks its code up properly is not touched
by either pass.

Markdown extracted from HTML is repaired before it is stored. Extraction can close a paragraph and
open the code block after it on one line, which leaves a fence delimiter no parser can see and
inverts every fence that follows, so a page's prose is read as code and its code as prose. A page
where that happened twice is inverted and balanced at once, which is why the repair attempts every
document rather than only the ones that end mid-fence: 50 such lines were sitting in the corpora,
nearly all of them read as healthy because their delimiters paired up. 49 are repaired; the one that
is not sits on a page broken for another reason, and a guess there is worth less than the break.

Both repairs refuse to act unless they demonstrably work, and a document fetched as markdown from its
publisher is never touched by either: that one is stored as published.

## Deciding what is worth keeping

A sitemap will happily hand over the whole site. `urls` reads the manifest back and reports what a
target is actually holding, grouped by the path that holds each page and ordered by weight, so the
sections that are paying their way are separated from the ones that are only bulk:

```bash
uv run dyarchia-crawlee urls openai-docs --depth 1
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
is on disk, committed or not.

Nothing this toolkit produces lives in this repository. The corpora, the profiles that define them
and every run's output sit in their own checkout alongside it, which `DYARCHIA_CRAWLEE_DATA_DIR`,
`DYARCHIA_CRAWLEE_PROFILES_DIR` and `DYARCHIA_CRAWLEE_OUTPUT_DIR` point at; Crawlee's working directory is
scratch and goes to a temporary path through `DYARCHIA_CRAWLEE_STORAGE_DIR`. All four accept absolute
paths. The matching entries in `.gitignore` are guards rather than homes: they catch a run started
without a `.env`, which would otherwise drop a corpus back into the tool's tree. See `.env.example`.

`--commit` stages a snapshot when, and only when, its content fingerprint moved, and it writes to
whichever repository owns the data directory rather than to this one. It is never implicit.
Deleting the corpus costs the comparison baseline rather than the ability to run.

A run that failed too often writes nothing, because half a snapshot would read as a mass deletion on
the next comparison. A run that found nothing rewrites nothing, so an unchanged target leaves its
files untouched.

## Corpora

Profiles are not tracked by git. A profile describes somebody's corpus rather than the tool, so it
lives on the machine that crawls it; the package ships `claude-docs` under `src/dyarchia_crawlee/sites/`
as the worked example, and `docs/profiles.md` documents the format. The example does not ask to be
snapshotted: it is present in every corpus repository, so one that asked would enrol itself in
every round swept on the machine. The nine this toolkit was built against, in the group
`docs-labs`:

    Profile                Target                          Pages
    -------------------    ----------------------------    -----
    claude-docs            claude.com/docs                   194
    claude-code-docs       code.claude.com                   170
    claude-api-docs        platform.claude.com               678
    claude-cookbook        platform.claude.com, HTML          96
    openai-docs            developers.openai.com             541
    chatgpt-docs           learn.chatgpt.com, Codex          257
    gemini-docs            ai.google.dev, HTML               225
    xai-docs               docs.x.ai, Grok                   176
    mistral-docs           docs.mistral.ai, HTML             443

Every corpus is English only. A publisher's other locales are a translation of pages already
tracked, so they double the disk and the crawl for a diff that reports a retranslation as a change.
Keeping them out is a rule about these corpora rather than about the toolkit: it is expressed as an
`include` anchored at the first path segment, or an `exclude` on the locale, in each profile that
needs one.

All but three fetch the markdown variant the site publishes, so the snapshot is the document rather
than an extractor's reading of it. `ai.google.dev` publishes none, `docs.mistral.ai` publishes one
for two of its eight sections, and the cookbook answers 404 with an application shell at every
suffix, so `gemini-docs`, `mistral-docs` and `claude-cookbook` are extracted from HTML instead. Each
was kept only after two runs hashed identically, which is the test an extractor's reading has to
pass and a published document does not.

`claude-cookbook` is a second target on `platform.claude.com` rather than a section of
`claude-api-docs`, because the recipes appear in no sitemap that target reads and publish no
markdown twin. They are in a sitemap of their own, declared in `robots.txt` and nowhere else.

Page counts are from the last run of each and move every week.

Each group is a folder and a round: its profiles share `<data>/<group>/`, `<output>/<group>/` and
one weekly sweep. A corpus on a neighbouring topic gets its own group, and with it its own folder
and its own schedule, rather than joining an existing one by having asked for snapshots.

Groups divide one repository, and some things should not be in one repository at all. Two bodies of
work that share nothing but a scraper get two, because the toolkit resolves a single data root and
a round can only see the profiles in its own. `developer.salesforce.com` is tracked that way, in
`crawlee-salesforce-data`, and reached with `-Repository` rather than filed alongside the labs: one
is a lab over what the AI providers publish, the other is the platform the work is done on. The
separation is also what stops a Salesforce round from noticing a Claude profile and quietly
building a corpus nobody asked for.

## Sweeping a corpus

`watch` is the command that sweeps a whole corpus in one round. It covers every profile that asks
for snapshots, lets one failing target cost only its own target, writes `WATCH.md` and `WATCH.json`
describing the sweep, and answers through its exit code:

    Code    Meaning
    ----    ----------------------------------------------------------------
    0       nothing changed, and nothing needs reading
    10      at least one target changed
    1       at least one target failed, so the sweep cannot vouch for itself

A first snapshot is deliberately not a change. There is nothing yet for it to differ from, and a
monitor that cries on its own first run teaches you to ignore it.

Neither is a reordering. A page whose lines are the same as before in a different order — a pricing
table that shuffled its rows — is classified as `reordered`, listed everywhere it would have been
listed anyway, and left out of the verdict. It rewrites the stored page, because the page did
change; it does not raise the exit code, because nothing it says did. Three of them woke a
notification on one real sweep and told nobody anything.

```bash
uv run dyarchia-crawlee watch
uv run dyarchia-crawlee watch claude-docs claude-code-docs
```

A round covers one corpus repository, the one this machine's `.env` names. `--group` narrows it
further, to the profiles inside that repository that belong to a group; naming profiles covers
exactly those and nothing else:

```bash
uv run dyarchia-crawlee watch --group docs-labs --commit
```

A round is started by a person and nothing starts one by itself. The lock is what makes that safe:
`watch` takes one on the group before it crawls and exits 30 without crawling if another round
already holds it, so a second window, or a second button, costs nothing but the message saying who
got there first.

`--commit` is worth adding to any round whose history matters. The corpora live in their own
repositories, so git is the only copy of what a previous round found.

## The panel

`dyarchia-plugin/` is a panel for [Dyarchia Desktop](https://github.com/Dyarchia/dyarchia-desktop):
the same two things a prompt does, with the corpus in front of you while you decide. It reads the
state of every corpus, starts a round and streams it as it happens, and lets a target be written or
edited without leaving the window.

```bash
py scripts/install_plugin.py
py scripts/install_plugin.py --uninstall
```

It installs into the shell's plugin folder and carries a file naming this checkout, because it does
not import the toolkit: it runs the CLI under this project's own interpreter and shows what comes
back. That is the whole design. The panel holds no crawling logic, no schema and no second copy of
the lock, so a button and a prompt cannot disagree about what a round is, and anything the panel
can do is something you can also do by hand.

Restart the shell after installing. Main modules are imported once, at startup.

Two things to know before using it:

- A round is one process. Stopping it kills the crawl where it stands, which is safe: the lock is
  released by the kernel and Crawlee's working directory is scratch.
- Saving a target commits it. A profile lives in the repository that holds its corpus, and the
  panel refuses to write one it cannot commit rather than leaving an edit nobody can find again.

Every surface the panel paints belongs to Dyarchia's design system: `dya-tabs`, `dya-table`,
`dya-badge` for a corpus verdict, `dya-entry` for the target list and its selected row, `dya-field`,
`dya-checkbox`, `dya-button`, `dya-empty`, and `dya-mono` and `dya-key-label` for text. No colour,
font or radius is written literally and no rule of the system is restyled, so the panel follows
whichever theme the shell has mounted without knowing which one it is.

Five things the system does not have yet are proposed to it in
[docs/design/dyarchia-ui-proposal.md](docs/design/dyarchia-ui-proposal.md): a `[hidden]` rule in the
reset, a `dya-log` output surface, status modifiers on `dya-text`, an inset `dya-bar` and a
`dya-field` that sizes to its content. The panel's markup already names all five. Until they ship,
each is held up by one prefixed rule marked `until upstream` in the renderer, and the proposal lists
exactly which rule dies with which proposal. Everything else the panel declares is layout: flex and
grid containers, widths, scroll boxes and the proportions of the two panes.

## The step after the sweep

A sweep that finds a change is only useful if something reads it. Two artefacts exist for that, and
neither is prose:

- `WATCH.json`, beside `WATCH.md`, holding the same verdict the exit code carries plus, per target,
  its counts and the path to its change report.
- `dyarchia-crawlee digest`, which bundles the last snapshot's changes into one document: what changed,
  the diff, and the file holding each page's current text. The diff says what moved; the file says
  what the page now claims, and a step that only sees the diff writes a changelog instead of an
  answer.

```bash
uv run dyarchia-crawlee digest --changed --group docs-labs --out digest.md
uv run dyarchia-crawlee digest xai-docs --json
```

The digest is a file, and that is the whole interface. What to do with a change is an editorial
decision, so nothing in this toolkit calls a model, holds a key or knows a provider exists: it
writes the document and stops. Whatever reads it next lives outside.

The digest reads the change reports the sweep just wrote, and the next sweep overwrites them, so it
belongs in the same sitting as the round that produced it rather than at some later hour.

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
- `docs/design/specs/` — the approved design
- `docs/design/dyarchia-ui-proposal.md` — five additions the panel asks of Dyarchia's design system

## Cost

Nothing here costs money. The whole stack is open source and runs locally. Apify Cloud, paid
proxies and LLM-assisted extraction are all deliberately out of scope: no model is consulted at any
point between a URL going in and a snapshot coming out.

## License

MIT
