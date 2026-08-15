"""Run orchestration: turn a `RunSpec` into fetched pages, records and files on disk."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from crawlee import Request, RequestOptions, RequestTransformAction
from crawlee.request_loaders import RequestManager, SitemapRequestLoader
from crawlee.statistics import FinalStatistics

from crawlee_lab.config import Settings, get_settings
from crawlee_lab.crawlers.context import safe_page
from crawlee_lab.crawlers.factory import AnyCrawler, build_crawler
from crawlee_lab.crawlers.settings import build_http_client
from crawlee_lab.crawlers.throttling import build_request_manager
from crawlee_lab.errors import BrowserNotInstalledError
from crawlee_lab.extraction.boilerplate import trim_shared_boilerplate
from crawlee_lab.extraction.dom import SoupAdapter, adapt
from crawlee_lab.extraction.strategies import RawPage, build_item
from crawlee_lab.models import FailureRecord, RunSpec, ScrapedItem
from crawlee_lab.patterns import to_matchers
from crawlee_lab.runtime import reset_storage_state
from crawlee_lab.storage.exporters import export_items
from crawlee_lab.storage.snapshots import SnapshotResult, take_snapshot
from crawlee_lab.urls import CANONICAL_URL_KEY, collapse_slashes, suffix_candidates

_DATASET_PAGE_SIZE = 500
_REMAINING_KEY = 'suffix_candidates_left'
_MISSING_BROWSER_MARKERS = ("executable doesn't exist", 'please run the following command to download')


@dataclass(slots=True)
class RunResult:
    """Everything a caller needs to report on, or act upon, after a crawl."""

    spec: RunSpec
    items: list[ScrapedItem] = field(default_factory=list)
    failures: list[FailureRecord] = field(default_factory=list)
    outputs: list[Path] = field(default_factory=list)
    statistics: FinalStatistics | None = None
    snapshot: SnapshotResult | None = None

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


def _canonical_url(request: Any) -> str:
    """The page this request stands for, which is not the URL when a suffix was applied."""
    user_data = getattr(request, 'user_data', None) or {}
    canonical = user_data.get(CANONICAL_URL_KEY)
    url = str(canonical) if isinstance(canonical, str) else str(request.url)
    return collapse_slashes(url)


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

    `HttpCrawler` also exposes `parsed_content`, but its parser is a no-op that hands back raw
    bytes, so anything that is not a parsed document falls through to the response body path where
    the content type decides whether there is a DOM to build at all.
    """
    request = context.request
    depth = int(getattr(request, 'crawl_depth', 0) or 0)
    label = getattr(request, 'label', None)
    status_code = _status_code(context)
    url = _canonical_url(request)

    page = safe_page(context)
    if page is not None:
        html = await page.content()
        return RawPage(
            url=url,
            status_code=status_code,
            dom=SoupAdapter.from_html(html),
            depth=depth,
            label=label,
        )

    parsed = getattr(context, 'parsed_content', None)
    if isinstance(parsed, bytes | str):
        parsed = None

    if parsed is not None:
        return RawPage(
            url=url,
            status_code=status_code,
            dom=adapt(parsed),
            depth=depth,
            label=label,
        )

    body = (await context.http_response.read()).decode('utf-8', errors='replace')
    dom = SoupAdapter.from_html(body) if _looks_like_html(context, body) else None
    return RawPage(
        url=url,
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


def _suffix_request(url: str, suffix: str) -> tuple[str, dict[str, Any]]:
    """The URL to fetch first, plus the state needed to fall back and to stay keyed by the page."""
    page = collapse_slashes(url)
    candidates = suffix_candidates(page, suffix)
    return candidates[0], {CANONICAL_URL_KEY: page, _REMAINING_KEY: candidates[1:]}


def _suffix_transform(suffix: str) -> Callable[[RequestOptions], RequestOptions | RequestTransformAction]:
    """Rewrite each discovered URL to its suffixed variant, remembering the page it came from."""

    def transform(options: RequestOptions) -> RequestOptions | RequestTransformAction:
        rewritten, state = _suffix_request(options['url'], suffix)
        options['url'] = rewritten
        options['user_data'] = {**options.get('user_data', {}), **state}
        return options

    return transform


async def retry_next_candidate(context: Any, spec: RunSpec) -> bool:
    """Try the next place a suffixed variant might live. Returns whether one was queued.

    This is why a section root is not lost: `section.md` is the right guess for almost every page
    and the wrong one for exactly the pages that are directories, and only the fetch can tell.
    """
    if not spec.fetch_suffix:
        return False

    user_data = dict(getattr(context.request, 'user_data', None) or {})
    remaining = list(user_data.get(_REMAINING_KEY) or [])
    if not remaining:
        return False

    following, rest = remaining[0], remaining[1:]
    await context.add_requests([Request.from_url(following, user_data={**user_data, _REMAINING_KEY: rest})])
    return True


async def build_request_source(spec: RunSpec, settings: Settings) -> RequestManager | None:
    """Assemble the request manager: per-domain throttling, plus sitemap seeding when configured."""
    throttler = await build_request_manager(spec)
    if not spec.seeded_by_sitemap:
        return throttler

    loader = SitemapRequestLoader(
        sitemap_urls=spec.sitemap_urls,
        http_client=build_http_client(spec, settings),
        include=to_matchers(spec.include) or None,
        exclude=to_matchers(spec.exclude) or None,
        transform_request_function=_suffix_transform(spec.fetch_suffix) if spec.fetch_suffix else None,
    )
    return await loader.to_tandem(throttler)


def seed_requests(spec: RunSpec) -> list[str | Request]:
    """The start URLs as they will actually be fetched."""
    if not spec.fetch_suffix:
        return list(spec.start_urls)

    seeds: list[str | Request] = []
    for url in spec.start_urls:
        fetched, state = _suffix_request(url, spec.fetch_suffix)
        seeds.append(Request.from_url(fetched, user_data=state))
    return seeds


def trim_run_boilerplate(items: list[ScrapedItem]) -> None:
    """Strip the header and footer this run's pages all share, in place.

    This runs once the whole run is collected, because the corpus is what identifies the boilerplate
    in the first place. A single page cannot tell its banner apart from its content.
    """
    indexed = [(index, item.content) for index, item in enumerate(items) if item.content]
    if not indexed:
        return

    trimmed = trim_shared_boilerplate([content for _, content in indexed])
    for (index, _), content in zip(indexed, trimmed, strict=True):
        items[index].content = content


def _translate_browser_error(error: Exception) -> Exception:
    message = str(error).lower()
    if any(marker in message for marker in _MISSING_BROWSER_MARKERS):
        return BrowserNotInstalledError()
    return error


async def execute(spec: RunSpec, settings: Settings | None = None) -> RunResult:
    """Run one crawl end to end and write its output."""
    settings = settings or get_settings()
    reset_storage_state()
    failures: list[FailureRecord] = []

    async def handle_page(context: Any) -> None:
        page = await to_raw_page(context)
        item = build_item(page, spec)
        await context.push_data(item.model_dump(mode='json'))
        if spec.follows_links:
            await enqueue_next(context, spec)

    async def handle_failure(context: Any, error: Exception) -> None:
        if await retry_next_candidate(context, spec):
            return
        failures.append(
            FailureRecord(
                url=_canonical_url(context.request),
                error=f'{type(error).__name__}: {error}',
                status_code=_status_code(context),
            )
        )

    request_manager = await build_request_source(spec, settings)
    crawler = build_crawler(spec, settings, handle_page, handle_failure, request_manager)

    try:
        statistics = await crawler.run(seed_requests(spec) or None)
    except Exception as error:
        raise _translate_browser_error(error) from error

    items = await collect_items(crawler)
    if spec.trim_boilerplate:
        trim_run_boilerplate(items)
    outputs = export_items(items, spec, settings.resolve(settings.output_dir))

    result = RunResult(
        spec=spec,
        items=items,
        failures=failures,
        outputs=outputs,
        statistics=statistics,
    )

    if spec.snapshot:
        result.snapshot = take_snapshot(items, failures, spec, settings, result.success_rate)

    return result
