# Profiles

A profile is a named, reusable target definition. It carries exactly the fields a command line
carries, so nothing can be expressed in one and not the other.

## Index

- [1. Where profiles live](#1-where-profiles-live)
- [2. Creating a profile](#2-creating-a-profile)
- [3. Running a profile](#3-running-a-profile)
- [4. Field reference](#4-field-reference)
- [5. Selector syntax](#5-selector-syntax)
- [6. URL pattern syntax](#6-url-pattern-syntax)
- [7. Worked examples](#7-worked-examples)

## 1. Where profiles live

Two sources share one namespace:

- YAML files in `profiles/`, one per target, named after the file.
- Python modules under `src/crawlee_lab/sites/` exposing a module-level `PROFILE` of type
  `ProfileSpec`.

A YAML file wins over a Python module of the same name, so a bundled definition can be overridden
locally without editing the package.

The YAML files are not tracked by git. A profile describes somebody's corpus, not the tool, so it
lives on the machine that crawls it; the repository ships one Python profile as the worked example.
List what is available with:

```bash
uv run crawlee-lab profiles
```

Python is worth reaching for when the definition benefits from explanation, from constants, or from
being version controlled with the code that depends on it. It is not an escape hatch: a Python
profile is still a declaration, and it cannot call into Crawlee.

## 2. Creating a profile

The intended route is to get a run working ad-hoc and then freeze it:

```bash
uv run crawlee-lab crawl https://code.claude.com/docs/en/overview \
    --crawler parsel \
    --select title=h1 \
    --depth 2 \
    --follow /docs/en/ \
    --save-profile claude-code
```

That writes `profiles/claude-code.yaml` containing only the fields that differ from the defaults. Add a
`description` by hand afterwards; it shows up in `crawlee-lab profiles`.

Writing one from scratch works too. Unknown keys are rejected rather than ignored, so a typo is a
loud error and not a setting that quietly never applied.

## 3. Running a profile

```bash
uv run crawlee-lab crawl --profile books
```

The profile supplies the baseline. Any flag typed on the same command line overrides it:

```bash
uv run crawlee-lab crawl --profile books --max-pages 5 --format csv
```

Only flags actually typed override. A flag left alone never overrides the profile, even when its
default happens to differ from what the profile set.

## 4. Field reference

Sources. At least one of `start_urls` or `sitemap_urls` is required.

    Field           Type            Default    Meaning
    ------------    -----------    -------    ------------------------------------------------
    name            string          filename   Profile name, also used for output filenames
    group           string          none       Folder this target's files are kept under
    description     string          none       Shown when listing profiles
    start_urls      list            empty      URLs the crawl begins from
    sitemap_urls    list            empty      Sitemaps to seed requests from
    fetch_suffix    string          none       The markdown twin of a page: appended to the path,
                                               or swapped for an extension the path already has

`fetch_suffix` asks for the variant of a page rather than the page. Where it goes depends on the
publisher, so more than one place is tried and the fetch decides: `page` is looked for at `page.md`
and then at `page/index.md`, and `page.html` at `page.md` first, because a site that names the
extension is saying the twin replaces it rather than follows it. developer.salesforce.com lists
`guide/get-started.html` in its sitemap and serves `guide/get-started.md`; asking for
`get-started.html.md` would find nothing there. The manifest still records the page by the URL the
sitemap gave, so a corpus points at pages that exist.

A group is a folder and a round in one. `group: docs-labs` puts this target's snapshots under
`data/docs-labs/<name>/` and its output under `output/docs-labs/<name>.jsonl`, and makes it part of
what `crawlee-lab watch --group docs-labs` sweeps. Targets that share a subject therefore share a
folder and a schedule, and a corpus added later joins neither until its profile says so. The value
is a single folder name in lowercase, digits and hyphens: it becomes a path segment, so it may not
be one that walks out of the data directory.

Changing the group of a profile does not move the files it already wrote. Move
`data/<name>/` into `data/<group>/` yourself, or the next run finds no manifest, calls itself a
first snapshot and rewrites the corpus with no change detected. Reading tolerates the gap and finds
the files wherever they still are; writing does not.

Crawling.

    Field                 Type       Default          Meaning
    ------------------    -------    -------------    ----------------------------------------
    crawler               enum       adaptive         http, beautifulsoup, parsel, playwright,
                                                      adaptive
    extract               enum       auto             auto, text, html, links, jsonld, none
    selectors             mapping    empty            Field name to selector expression
    max_depth             int        0                Link hops to follow, 0 means no following
    max_pages             int        none             Stop after this many pages
    link_selector         string     a                CSS selector for links to follow
    strategy              enum       same-hostname    all, same-domain, same-hostname,
                                                      same-origin
    include               list       empty            Patterns a URL must match to be followed
    exclude               list       empty            Patterns a URL must not match

Politeness and transport.

    Field                     Type      Default    Meaning
    ----------------------    ------    -------    -------------------------------------------
    respect_robots            bool      true       Honour robots.txt, including Crawl-delay
    user_agent                string    none       Overrides the configured User-Agent
    stealth                   bool      false      Impersonate a browser instead of identifying
    max_concurrency           int       none       Cap on parallel requests
    max_requests_per_minute   float     none       Cap on request rate
    max_request_retries       int       none       Retries per request

Browser.

    Field              Type    Default                 Meaning
    ---------------    ----    --------------------    -----------------------------------
    headless           bool    true                    Run the browser without a window
    block_resources    list    image, media, font      Resource types to abort

Output.

    Field               Type     Default    Meaning
    ----------------    -----    -------    ----------------------------------------------
    formats             list     json       json, jsonl, csv, md
    snapshot            bool     false      Store content under data/ and report changes
    min_success_rate    float    none       Below this share of successes, no snapshot
    min_coverage        float    none       Below this share of the previous corpus, no snapshot
    trim_boilerplate    bool     true       Drop the header and footer every page shares

The two thresholds answer different questions. `min_success_rate` asks how many of the pages this run
attempted came back; `min_coverage` asks how much of the previous snapshot this run reached at all. A
run capped by `--max-pages` scores a perfect success rate and would delete everything it never
visited, which is what coverage is there to stop.

## 5. Selector syntax

A small extension of CSS, so a whole extraction fits on a command line.

    Expression             Result
    -------------------    --------------------------------------------------
    h1                     Text of the first match
    .price@data-value      An attribute of the first match
    all:.tag               A list with the text of every match
    all:a@href             A list with an attribute of every match

Attributes that carry URLs, such as `href`, `src`, `data-src`, `srcset`, `poster` and `action`, are
resolved against the page they were found on, so a relative value comes back absolute.

A selector that matches nothing yields `null`, or an empty list when prefixed with `all:`. The field
is always present in the output, which keeps CSV columns stable across pages.

## 6. URL pattern syntax

Used by `include` and `exclude`, and by the `--follow` and `--exclude` flags.

    Pattern                       Meaning
    --------------------------    ---------------------------------------------------
    /docs/                        The URL contains this text
    /docs/*.html                  Contains this glob, where * stops at a separator
    /docs/**                      Contains this glob, where ** crosses separators
    https://site.com/docs/**      Starts with this glob, matched against the whole URL
    re:^https://site\.com/\d+     An explicit regular expression, anchored at the start

The first three forms exist because Crawlee's own globs are anchored and matched against the whole
URL. A pattern like `**/docs/**` would match nothing at all, since `**` does not cross the empty
segment inside `https://`, and it would fail silently.

## 7. Worked examples

A section of a site crawled by following links, pulling named fields rather than prose:

```yaml
name: reference-index
description: An index page and the pages it links to, reduced to a table of fields
start_urls:
  - https://example.com/reference/
crawler: beautifulsoup
extract: none
selectors:
  title: h1
  summary: .summary
  updated: 'time@datetime'
  tags: 'all:.tag'
max_depth: 2
max_pages: 40
include:
  - /reference/
exclude:
  - /reference/archive/
formats:
  - json
  - csv
```

A page whose content only exists after JavaScript runs. `extract: none` because the fields are the
point, and the blocked resources because images and fonts cost time without changing any of them:

```yaml
name: rendered-listing
description: A listing built client side, which only a browser can read
start_urls:
  - https://example.com/app/listing
crawler: playwright
extract: none
selectors:
  rows: 'all:.row .label'
  authors: 'all:.row .author'
max_depth: 1
max_pages: 10
include:
  - /app/listing
block_resources:
  - image
  - media
  - font
```

A documentation site tracked for change, seeded from its sitemap and fetched as markdown. This one
lives in Python as `src/crawlee_lab/sites/claude_docs.py`:

```python
PROFILE = ProfileSpec(
    name='claude-docs',
    description='Claude documentation, snapshotted from its markdown variants to track changes',
    sitemap_urls=['https://claude.com/docs/sitemap.xml'],
    fetch_suffix='.md',
    exclude=[r're:^https://claude\.com/docs/?$'],
    crawler=CrawlerKind.HTTP,
    extract=ExtractionMode.TEXT,
    formats=[OutputFormat.JSONL],
    max_concurrency=4,
    max_requests_per_minute=120,
    snapshot=True,
    min_success_rate=0.95,
)
```

Three decisions in that profile are worth copying for any documentation site. Seeding from the
sitemap covers the target exactly instead of wandering through link discovery. `fetch_suffix` turns
a 400 KB HTML page carrying its own hydration payload into roughly 5 KB of prose, which is the
difference between a diff you can read and one you cannot. The one sitemap entry with no markdown
variant is excluded, because a permanent known failure trains you to ignore failures.

What the profile does not need is a rule about the four-line documentation-index banner the site
puts at the top of every markdown page. `trim_boilerplate` finds it from the corpus, because a block
opening two hundred pages out of two hundred is chrome whatever it says.

Run `crawlee-lab inspect` against a new documentation site before writing a profile for it. It
reports whether a markdown variant exists and which sitemaps are published.
