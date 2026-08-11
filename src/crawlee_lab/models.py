"""Data contracts shared across every layer of the toolkit."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CrawlerKind(StrEnum):
    """Which Crawlee crawler drives a run."""

    HTTP = 'http'
    BEAUTIFULSOUP = 'beautifulsoup'
    PARSEL = 'parsel'
    PLAYWRIGHT = 'playwright'
    ADAPTIVE = 'adaptive'

    @property
    def needs_browser(self) -> bool:
        return self in {CrawlerKind.PLAYWRIGHT, CrawlerKind.ADAPTIVE}


class ExtractionMode(StrEnum):
    """What to pull out of a page when no explicit selectors are given."""

    AUTO = 'auto'
    TEXT = 'text'
    HTML = 'html'
    LINKS = 'links'
    JSONLD = 'jsonld'
    NONE = 'none'


class OutputFormat(StrEnum):
    """Serialisation format for the items produced by a run."""

    JSON = 'json'
    JSONL = 'jsonl'
    CSV = 'csv'
    MARKDOWN = 'md'


class LinkStrategy(StrEnum):
    """How far link following is allowed to wander from the start URLs."""

    ALL = 'all'
    SAME_DOMAIN = 'same-domain'
    SAME_HOSTNAME = 'same-hostname'
    SAME_ORIGIN = 'same-origin'


class PageStatus(StrEnum):
    """Final outcome recorded for a single URL."""

    OK = 'ok'
    FAILED = 'failed'
    SKIPPED = 'skipped'


def utcnow() -> datetime:
    return datetime.now(UTC)


class ScrapedItem(BaseModel):
    """One record produced from one page."""

    model_config = ConfigDict(extra='ignore')

    url: str
    label: str | None = None
    depth: int = 0
    status_code: int | None = None
    fetched_at: datetime = Field(default_factory=utcnow)
    title: str | None = None
    content: str | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    links: list[str] = Field(default_factory=list)

    def flatten(self) -> dict[str, Any]:
        """Collapse nested fields into a single level, suitable for CSV output."""
        flat: dict[str, Any] = {
            'url': self.url,
            'label': self.label,
            'depth': self.depth,
            'status_code': self.status_code,
            'fetched_at': self.fetched_at.isoformat(),
            'title': self.title,
            'content': self.content,
            'links': ' '.join(self.links),
        }
        for key, value in self.fields.items():
            flat[key] = ' | '.join(str(v) for v in value) if isinstance(value, list) else value
        return flat


class FailureRecord(BaseModel):
    """A URL the crawler could not handle after exhausting its retries."""

    url: str
    error: str
    status_code: int | None = None
    failed_at: datetime = Field(default_factory=utcnow)


class RunSpec(BaseModel):
    """Everything needed to execute one crawl, whether it came from flags or from a profile."""

    model_config = ConfigDict(extra='forbid')

    name: str
    start_urls: list[str] = Field(default_factory=list)
    sitemap_urls: list[str] = Field(default_factory=list)
    fetch_suffix: str | None = None

    crawler: CrawlerKind = CrawlerKind.ADAPTIVE
    extract: ExtractionMode = ExtractionMode.AUTO
    selectors: dict[str, str] = Field(default_factory=dict)

    max_depth: int = Field(default=0, ge=0)
    max_pages: int | None = Field(default=None, gt=0)
    link_selector: str = 'a'
    strategy: LinkStrategy = LinkStrategy.SAME_HOSTNAME
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)

    respect_robots: bool = True
    user_agent: str | None = None
    stealth: bool = False
    max_concurrency: int | None = Field(default=None, ge=1)
    max_requests_per_minute: float | None = Field(default=None, gt=0)
    max_request_retries: int | None = Field(default=None, ge=0)

    headless: bool = True
    block_resources: list[str] = Field(default_factory=lambda: ['image', 'media', 'font'])

    formats: list[OutputFormat] = Field(default_factory=lambda: [OutputFormat.JSON])

    snapshot: bool = False
    min_success_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    min_coverage: float | None = Field(default=None, ge=0.0, le=1.0)
    trim_boilerplate: bool = True

    @model_validator(mode='after')
    def _require_a_source(self) -> RunSpec:
        if not self.start_urls and not self.sitemap_urls:
            raise ValueError('a run needs at least one start URL or one sitemap URL')
        return self

    @property
    def follows_links(self) -> bool:
        return self.max_depth > 0

    @property
    def seeded_by_sitemap(self) -> bool:
        return bool(self.sitemap_urls)
