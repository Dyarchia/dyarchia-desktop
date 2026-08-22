# Architecture

How crawlee-lab is put together, and the reasoning behind the parts that are not obvious.

## Index

- [1. Two layers](#1-two-layers)
- [2. Module map](#2-module-map)
- [3. The path of a run](#3-the-path-of-a-run)
- [4. One DOM interface over four parsers](#4-one-dom-interface-over-four-parsers)
- [5. Crawlee behaviours that had to be handled](#5-crawlee-behaviours-that-had-to-be-handled)
- [6. Snapshots and the change history](#6-snapshots-and-the-change-history)
- [7. Failure handling](#7-failure-handling)
- [8. Running unattended](#8-running-unattended)
- [9. Testing strategy](#9-testing-strategy)

## 1. Two layers

The engine knows nothing about any specific site. Profiles never touch the Crawlee API. A profile
describes what to look for; the engine decides how to obtain it.

That boundary is what makes a new target a data change rather than a code change. It also means
anything a target needs that a profile cannot express belongs in the engine as a reusable feature,
never as a per-site escape hatch. The claude-docs profile needed sitemap seeding and URL suffix
rewriting; both landed in the engine and both are now available to every target.

## 2. Module map

    Module                  Responsibility                                  Depends on
    --------------------    -------------------------------------------    -------------------
    cli                     Command parsing, run orchestration              config, registry
    config                  Settings from environment and .env              nothing
    models                  Data contracts between layers                   nothing
    errors                  Exception hierarchy                             nothing
    urls                    Suffix rewriting, snapshot path derivation      nothing
    patterns                URL matching for link following                 nothing
    registry                Discovery of YAML and Python profiles           profiles, sites
    runtime                 Crawlee state and working directory per run    nothing
    recon                   Target reconnaissance for the inspect command   extraction
    watch                   Sweeping every tracked target unattended        registry, engine
    inventory               Reading a manifest back as a per-section        config,
                            report of what a target is holding              versioning.manifest
    engine                  Running a crawl end to end                      almost everything
    crawlers.factory        Building the requested crawler                  settings, hooks
    crawlers.settings       Concurrency, rate limit, transport              config
    crawlers.throttling     Per-domain delay and 429 backoff                models
    crawlers.hooks          Pre-navigation resource blocking                context
    crawlers.adaptive       Static-result sufficiency check                 models
    crawlers.context        Safe access to optional context members         nothing
    extraction.dom          One DOM interface, field selector language      nothing
    extraction.strategies   Extraction modes                                dom, models
    extraction.boilerplate  Removal of the header and footer every page     nothing
                            of a run shares
    extraction.markup       Cleaning of markup embedded in documents        nothing
                            that arrive as markdown
    extraction.frontmatter  Splitting a metadata block off a document       nothing
                            so the corpus judges only its prose
    profiles.schema         On-disk profile shape                           models
    profiles.loader         Reading and writing profile files               schema, errors
    storage.exporters       Output as json, jsonl, csv, markdown            models
    storage.snapshots       Snapshot writing and pruning                    versioning
    versioning.hashing      Content fingerprints                            nothing
    versioning.manifest     Per-target record of status and hashes          models
    versioning.diffing      Manifest comparison into a change report        manifest
    versioning.report       Rendering a change report                       diffing
    versioning.vcs          Committing a snapshot                           errors
    sites.claude_docs       The one profile the package ships, and the      profiles.schema
                            worked example of a Python definition

Dependencies point towards `models` and `config`, never towards `cli`.

## 3. The path of a run

```mermaid
flowchart TD
    A[CLI flags or profile] --> B[RunSpec]
    B --> C[Reset Crawlee storage state]
    C --> D[Build request source]
    D --> E[Build crawler]
    E --> F[Crawlee runs the crawl]
    F --> G[Normalise context into RawPage]
    G --> H[Apply extraction mode and selectors]
    H --> I[Push ScrapedItem to the dataset]
    I --> J{Follow links?}
    J -- "yes" --> F
    J -- "no" --> K[Collect items from the dataset]
    K --> L[Export to the requested formats]
    L --> M{Snapshot?}
    M -- "no" --> N[Report]
    M -- "yes" --> O[Write snapshots, compare, report changes]
    O --> N
```

`RunSpec` is the single contract. A profile and a command line produce the same object, which is why
`--profile` and ad-hoc flags compose rather than being two separate code paths.

Overrides are resolved through Click's parameter source rather than by comparing values against
defaults. A flag that happens to equal its default must not silently win over the profile that set
it deliberately.

## 4. One DOM interface over four parsers

Crawlee hands back a different object depending on the crawler: a BeautifulSoup document, a Parsel
selector, a live Playwright page, or raw bytes. `extraction.dom` defines the minimum a parsed
document must offer, and `engine.to_raw_page` is the single place that knows about the difference.

Adapters exist for BeautifulSoup and Parsel. A browser page is read through `page.content()` and
adapted as HTML. Anything not recognised falls through to the response body, where the content type
decides whether there is a DOM to build at all.

Extraction that starts from HTML can lean on structure to separate content from chrome. Text that
arrives already clean, such as a publisher's own markdown, has no structure left to lean on, so a
banner injected into every page survives into the snapshot. `extraction.boilerplate` closes that gap
from the other direction: a block of lines opening or closing at least ninety per cent of a run's
pages is chrome by definition, whatever it says. Detection therefore happens once the whole run is
collected, because the corpus is the evidence. Removing it is also free for change tracking, since
content identical on every page is constant and constant content never appears in a diff.

A second gap opens on the same kind of target. Sites built on MDX serve their prose pages as prose
and their landing pages as the layout that produced them: class names, wrapper elements, inline SVG
path coordinates. Nothing is missing from such a page, but nudging an icon by a pixel would read as
a content change. `extraction.markup` reduces a markup-heavy document to the prose and links inside
it, and the ratio test keeps it away from ordinary pages. Two details in it are what make it lossless
rather than merely tidy: component syntax puts real headings in attributes, so `title`, `label` and
`href` are rescued instead of stripped with the tag, and fenced code blocks are left untouched,
because an HTML example inside a fence is the content rather than the chrome.

The ratio test is not the whole answer, because two different faults arrive looking like one. A
landing page is markup all the way down and the ratio finds it. A prose page that happens to define
its interactive component carries a block of JavaScript instead, and it fails the ratio precisely
because it is mostly prose; no amount of tag-stripping reaches a `useMemo` call in any case. That
definition is removed outright and its invocation kept, so a reader still learns that a widget stood
there. A code fence again exempts everything inside it, since a page teaching JavaScript is a page
whose `export const` is the lesson.

Extraction from HTML has a failure of its own, and it is corrected where it is made rather than
where it is noticed. Collapsing a paragraph and the code block after it onto one line leaves a fence
delimiter mid-line, which no parser can see; from there every delimiter reads as the opposite of
what it is, and the page's prose is stored as code. Both repairs refuse to act unless the result is
demonstrably better than the input, and neither touches a document fetched as markdown from its
publisher: that one is stored as published, which is the only promise a snapshot of it makes.

## 5. Crawlee behaviours that had to be handled

Four behaviours of the library are easy to get wrong and are handled explicitly. Each one was
verified against the installed version rather than assumed.

### 5.1 Globs never cross the scheme separator

Crawlee matches include and exclude patterns against the whole URL, anchored at the start, using a
path-style glob translation. The obvious pattern `**/docs/**` therefore matches nothing, because
`**` refuses to cross the empty segment inside `https://`. It fails silently: the crawl simply
follows no links.

`patterns.to_matcher` gives the CLI its own contract instead. A bare pattern means the URL contains
this glob, a pattern with a scheme keeps Crawlee's own semantics, and a `re:` prefix is an explicit
regular expression.

### 5.2 Adaptive rendering does not update the parsed document

On a browser run, `AdaptivePlaywrightCrawlingContext.parsed_content` is parsed from the raw
navigation response body, not from the rendered DOM. Reading it would return the pre-JavaScript
shell of exactly the pages that needed a browser in the first place.

The engine therefore prefers the live page and falls back to `parsed_content`. Because that page is
a property that raises when the request was served by the static sub-crawler, access goes through
`crawlers.context.safe_page`.

### 5.3 The adaptive crawler needs a result checker to adapt

Without one it accepts whatever the cheap static path produced, including an empty shell.
`crawlers.adaptive.make_result_checker` rejects a static result carrying no signal, which is what
forces a browser render. It is aware of the run: a run that asked for nothing extractable accepts
any result, so `--extract none` does not render every page in a browser.

### 5.4 Crawl-delay is read but not enforced

`respect_robots_txt_file` reads `Crawl-delay` from robots.txt, then logs a warning and ignores it
unless the crawler is driven by a `ThrottlingRequestManager`. One is wired whenever robots.txt is
respected. The delays are reactive, from 429 responses and from robots directives, so an ordinary
crawl still runs at full speed.

## 6. Snapshots and the change history

Content lands under `data/<name>/pages/`, mirroring the URL structure, so a diff reads like a tour
of the site. A manifest beside the pages records per-URL status and hash, which is what allows a
report without invoking git, and what allows a page that disappeared to be told apart from a page
that failed to download.

A profile may name a `group`, which nests that target one level deeper, at `data/<group>/<name>/`,
and sends its output to `output/<group>/`. The group is a folder and a round at once: it is also
what `watch --group` sweeps, so the targets that share a subject share a schedule, and a corpus
added later joins neither by accident. That double duty is the point. A machine watching several
corpora otherwise has one flat data directory and one round that quietly grows to whatever asked
for snapshots most recently.

Writing derives the path from the profile alone, and reading does not. A profile that joins a group
does not carry its files with it, so `inventory.directory_for` tries the group, then the data root,
then any group folder that actually holds the manifest. Half a move therefore reports what is on
disk instead of declaring the corpus missing and crawling it again from nothing. The tolerance
belongs on the reading side only: a write that guessed would scatter one target across two folders.

Git is optional, and in this repository it is declined: `data/` is ignored in full. That is worth
being precise about, because it sounds like it should break change tracking and does not. Detection
compares the incoming run against the manifest and pages already on disk, so it works identically
whether or not anything is committed. What git adds is duration. Without it, a target keeps its
current state and the report of the most recent run; with it, every change acquires a date and an
author trail.

Removing `data/` from `.gitignore` restores that. `--commit` then stages a snapshot only when its
content fingerprint moved, and `versioning.vcs` refuses with an explanation rather than a git error
when the directory it was asked to commit is ignored.

Manifest timestamps move on every run, so comparing manifests directly would produce a commit per
run and turn the history into a record of how often the scraper ran. Snapshots are therefore
compared on a content fingerprint of status and hash. Unchanged pages are not rewritten, and the
manifest and report are only persisted when that fingerprint moves.

## 7. Failure handling

Retries with backoff belong to Crawlee. On top of that:

- Every URL gets a final status in the manifest, so a partial failure neither deletes valid
  snapshots nor pollutes the diff with false removals.
- A run whose success rate falls below its threshold writes no snapshot at all.
- A run that reaches far fewer pages than the snapshot it would replace writes nothing either. The
  success rate cannot see this: a run capped at three pages downloads three of three, scores a
  hundred per cent, and deletes everything it never visited. Coverage asks whether the run saw the
  target or only a corner of it, which is the failure mode of a page limit, a mistyped include
  pattern, or a sitemap that came back truncated.
- Extraction errors are isolated per page; one broken page does not abort the run.
- Snapshot paths are sanitised and resolved, so a target cannot steer writes outside its own
  directory through traversal in its URLs.

Crawlee caches storage instances, and the locks guarding them, in a process-global service locator.
Those locks bind to the event loop that created them, so a second run in the same process fails.
`runtime.reset_storage_state` is called when a run starts, which makes the engine usable from a test
suite or a scheduler and not only from a CLI that exits afterwards. It also implies runs are
sequential within a process; concurrent crawls in one process were never safe under a global service
locator.

Two processes are the other half of that, and the half that does not announce itself. Crawlee keeps
its request queue on disk under one directory for the whole checkout, so a crawl started while
another is running takes requests from the other's queue and hands over its own. Neither run errors,
neither reports anything unusual, and both write a corpus: one of them holding pages that belong to
somebody else's target while its own are recorded as removed. `runtime.use_private_storage` names
that directory after the process, which makes the collision impossible rather than unlikely. It was
written after a ten-page test crawl of one site emptied 236 pages out of another site's corpus and
left ten of its own behind.

## 8. Running unattended

A change detector that only detects when somebody remembers to launch it is a script rather than a
monitor. `watch` closes that gap, and it is shaped by what a scheduler can actually consume.

It sweeps every profile that asks for snapshots, one after another rather than concurrently: these
are polite crawls of whole documentation sites, and running five at once would multiply the request
rate against hosts that have done nothing to deserve it. A target that raises is recorded and the
sweep continues, because one unreachable host must not hide the state of the other four.

The verdict is the exit code, which is the only thing Task Scheduler reads without help:

    Code    Meaning
    ----    ----------------------------------------------------------------
    0       nothing changed
    10      at least one target changed
    1       at least one target failed, so the sweep cannot vouch for itself

A failure outranks a change deliberately. A target that did not answer may be sitting on a change
nobody can see, so the sweep must not report success. A first snapshot deliberately does not count
as a change: there is nothing yet for it to differ from, and a monitor that fires on its own first
run teaches its reader to ignore it.

Everything Windows-specific lives in `scripts/`, outside the package: `watch.ps1` adds the log and
the desktop notification, and `register-watch-task.ps1` registers the weekly task. Neither runs
itself. Installing dependencies so a tool works is one kind of action; changing what a machine does
at every logon is another, and that one gets proposed rather than performed.

The weekly cadence is not a weekly trigger. Task Scheduler fires the task at every logon and the
wrapper decides whether the week is owed a sweep, comparing the current ISO week against the last
one it recorded. A trigger tied to an hour asks the machine to be awake at that hour, and a machine
that was off on Monday morning loses the week; a trigger tied to logon cannot lose it, because the
first logon of the week is by definition the first moment there is anyone to notify. The record is
written only after a sweep that finished, so a week whose sweep failed is still owed one and the
next logon takes it. The wrapper reports a skipped run as 20, which no sweep returns, so the task
history distinguishes a week that was quiet from a week that was already done.

The record and the log are keyed by the task's name rather than fixed, because one machine may
watch several sets of profiles on different schedules. Two tasks sharing a name would share the
record, and the second would spend the week believing the first had been its own run.

## 9. Testing strategy

Unit tests run against local fixtures with no network at all, and cover the parts where correctness
is subtle: pattern semantics, selector parsing, extraction modes, path derivation, manifest
comparison, snapshot guards, profile loading.

Integration tests drive the real command line entry point against a fixture site served from
`tests/fixtures/site` on localhost for the duration of the session. It is deliberately small and
deliberately awkward: static pages with selectable structure, a catalogue to follow links into, a
page outside it that a filter must exclude, a page published twice so the markdown probe has
something to find, and one page whose quotes only exist after JavaScript runs. That last one is the
case that motivated the adaptive result checker, and it is asserted from both sides: the static
crawler sees an empty shell where the browser-backed one sees ten quotes.

Nothing in the suite leaves the machine. Tests needing Playwright carry the `browser` mark, which is
the only reason to deselect anything. An earlier version pointed these tests at public scraping
sandboxes; the fixture answers the same questions without making the suite depend on someone else's
uptime, or on the machine having a network at all.
