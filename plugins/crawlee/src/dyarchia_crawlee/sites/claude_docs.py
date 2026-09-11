"""The Claude documentation, tracked for change over time.

Every page is served in a markdown variant at the same path with a `.md` suffix. Fetching that
instead of the HTML turns a 400 KB page carrying its own React hydration payload into roughly 5 KB
of prose, which is the difference between a diff you can read and a diff you cannot.

Seeding comes from the published sitemap rather than from link discovery, so the run covers the
documentation exactly and never wanders into the rest of the site.

The documentation index needs no special handling here even though its variant lives at
`docs/index.md` rather than at `docs.md`. Falling back to the index form is the engine's job, and it
applies to any target whose sections are directories.

It does not ask to be snapshotted. An example that ships with the package is present in every
corpus repository, and one that asked would enrol itself in every unattended round on the machine:
a repository tracking Salesforce documentation would find this in its weekly sweep and start
building a Claude corpus it never asked for. Naming it on a crawl, with --snapshot, still does
everything it documents.
"""

from dyarchia_crawlee.models import CrawlerKind, ExtractionMode, OutputFormat
from dyarchia_crawlee.profiles.schema import ProfileSpec

PROFILE = ProfileSpec(
    name='claude-docs',
    description='Claude documentation, snapshotted from its markdown variants to track changes',
    sitemap_urls=['https://claude.com/docs/sitemap.xml'],
    fetch_suffix='.md',
    crawler=CrawlerKind.HTTP,
    extract=ExtractionMode.TEXT,
    formats=[OutputFormat.JSONL],
    max_concurrency=4,
    max_requests_per_minute=120,
    snapshot=False,
    min_success_rate=0.95,
)
