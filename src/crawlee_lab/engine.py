"""Run orchestration: turn a `RunSpec` into fetched pages, records and files on disk."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from crawlee.statistics import FinalStatistics

from crawlee_lab.config import Settings, get_settings
from crawlee_lab.crawlers.context import safe_page
from crawlee_lab.crawlers.factory import AnyCrawler, build_crawler
from crawlee_lab.crawlers.throttling import build_request_manager
from crawlee_lab.errors import BrowserNotInstalledError
from crawlee_lab.extraction.dom import SoupAdapter, adapt
from crawlee_lab.extraction.strategies import RawPage, build_item
from crawlee_lab.models import FailureRecord, RunSpec, ScrapedItem
from crawlee_lab.patterns import to_matchers
from crawlee_lab.storage.exporters import export_items

_DATASET_PAGE_SIZE = 500
_MISSING_BROWSER_MARKERS = ("executable doesn't exist", 'please run the following command to download')


@dataclass(slots=True)
class RunResult:
    """Everything a caller needs to report on, or act upon, after a crawl."""

    spec: RunSpec
    items: list[ScrapedItem] = field(default_factory=list)
    failures: list[FailureRecord] = field(default_factory=list)
    outputs: list[Path] = field(default_factory=list)
    statistics: FinalStatistics | None = None

    @property
    def attempted(self) -> int:
        return len(self.items) + len(self.failures)

    @property
    def success_rate(self) -> float:
        return 1.0 if self.attempted == 0 else len(self.items) / self.attempted


def _status_code(context: Any) -> int | None:
    http_response = getattr(context, 'http_response', None)
    if http_response is not None:
        code = getattr(http_response, 'status_code', None)
        return int(code) if code is not None else None

    response = getattr(context, 'response', None)
    status = getattr(response, 'status', None)
    return int(status) if status is not None else None


def _looks_like_html(context: Any, body: str) -> bool:
    http_response = getattr(context, 'http_response', None)
    headers = getattr(http_response, 'headers', None) or {}
    content_type = str(headers.get('content-type', '')).lower()
    if content_type:
        return 'html' in content_type or 'xml' in content_type
    return '<html' in body[:2048].lower()


async def to_raw_page(context: Any) -> RawPage:
    """Flatten any of Crawlee's crawling contexts into one shape the extractors understand.

    The live page is checked first and it matters that it is. On a browser run the adaptive context
    still parses `parsed_content` from the raw navigation body, so trusting it would hand back the
    pre-JavaScript shell of exactly the pages that needed a browser in the first place.
    """
    request = context.request
    depth = int(getattr(request, 'crawl_depth', 0) or 0)
    label = getattr(request, 'label', None)
    status_code = _status_code(context)

    page = safe_page(context)
    if page is not None:
        html = await page.content()
        return RawPage(
            url=request.url,
            status_code=status_code,
            dom=SoupAdapter.from_html(html),
            depth=depth,
            label=label,
        )

    parsed = getattr(context, 'parsed_content', None)
    if parsed is not None:
        return RawPage(
            url=request.url,
            status_code=status_code,
            dom=adapt(parsed),
            depth=depth,
            label=label,
        )

    body = (await context.http_response.read()).decode('utf-8', errors='replace')
    dom = SoupAdapter.from_html(body) if _looks_like_html(context, body) else None
    return RawPage(
        url=request.url,
        status_code=status_code,
        dom=dom,
        body_text=None if dom is not None else body,
        depth=depth,
        label=label,
    )


async def enqueue_next(context: Any, spec: RunSpec) -> None:
    """Follow links from the current page within the configured boundaries."""
    options: dict[str, Any] = {'selector': spec.link_selector, 'strategy': spec.strategy.value}
    if spec.include:
        options['include'] = to_matchers(spec.include)
    if spec.exclude:
        options['exclude'] = to_matchers(spec.exclude)
    if spec.max_pages is not None:
        options['limit'] = spec.max_pages
    await context.enqueue_links(**options)


async def collect_items(crawler: AnyCrawler) -> list[ScrapedItem]:
    """Read back everything the run pushed into the default dataset."""
    items: list[ScrapedItem] = []
    offset = 0
    while True:
        page = await crawler.get_data(offset=offset, limit=_DATASET_PAGE_SIZE)
        if not page.items:
            break
        items.extend(ScrapedItem.model_validate(raw) for raw in page.items)
        offset += len(page.items)
        if offset >= page.total:
            break
    return items


def _translate_browser_error(error: Exception) -> Exception:
    message = str(error).lower()
    if any(marker in message for marker in _MISSING_BROWSER_MARKERS):
        return BrowserNotInstalledError()
    return error


async def execute(spec: RunSpec, settings: Settings | None = None) -> RunResult:
    """Run one crawl end to end and write its output."""
    settings = settings or get_settings()
    failures: list[FailureRecord] = []

    async def handle_page(context: Any) -> None:
        page = await to_raw_page(context)
        item = build_item(page, spec)
        await context.push_data(item.model_dump(mode='json'))
        if spec.follows_links:
            await enqueue_next(context, spec)

    async def handle_failure(context: Any, error: Exception) -> None:
        failures.append(
            FailureRecord(
                url=context.request.url,
                error=f'{type(error).__name__}: {error}',
                status_code=_status_code(context),
            )
        )

    request_manager = await build_request_manager(spec)
    crawler = build_crawler(spec, settings, handle_page, handle_failure, request_manager)

    try:
        statistics = await crawler.run(spec.start_urls)
    except Exception as error:
        raise _translate_browser_error(error) from error

    items = await collect_items(crawler)
    outputs = export_items(items, spec, settings.resolve(settings.output_dir))

    return RunResult(
        spec=spec,
        items=items,
        failures=failures,
        outputs=outputs,
        statistics=statistics,
    )
