"""The Claude documentation, tracked for change over time.

Every page is served in a markdown variant at the same path with a `.md` suffix. Fetching that
instead of the HTML turns a 400 KB page carrying its own React hydration payload into roughly 5 KB
of prose, which is the difference between a diff you can read and a diff you cannot.

Seeding comes from the published sitemap rather than from link discovery, so the run covers the
documentation exactly and never wanders into the rest of the site.
"""

from crawlee_lab.models import CrawlerKind, ExtractionMode, OutputFormat
from crawlee_lab.profiles.schema import ProfileSpec

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
    snapshot=True,
    min_success_rate=0.95,
)
