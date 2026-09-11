"""Builds the Crawlee crawler a run asks for and wires the shared handlers onto it."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any, cast

from crawlee.crawlers import (
    AdaptivePlaywrightCrawler,
    BasicCrawler,
    BeautifulSoupCrawler,
    HttpCrawler,
    ParselCrawler,
    PlaywrightCrawler,
)
from crawlee.request_loaders import RequestManager

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.crawlers.adaptive import make_result_checker
from dyarchia_crawlee.crawlers.hooks import make_resource_blocker
from dyarchia_crawlee.crawlers.settings import build_concurrency, build_http_client, effective_user_agent
from dyarchia_crawlee.errors import ConfigurationError
from dyarchia_crawlee.models import CrawlerKind, RunSpec

PageHandler = Callable[[Any], Awaitable[None]]
FailureHandler = Callable[[Any, Exception], Awaitable[None]]

AnyCrawler = BasicCrawler[Any, Any]


def _common_options(
    spec: RunSpec, settings: Settings, request_manager: RequestManager | None
) -> dict[str, Any]:
    return {
        'request_manager': request_manager,
        'http_client': build_http_client(spec, settings),
        'concurrency_settings': build_concurrency(spec, settings),
        'max_request_retries': (
            settings.max_request_retries if spec.max_request_retries is None else spec.max_request_retries
        ),
        'max_requests_per_crawl': spec.max_pages,
        'max_crawl_depth': spec.max_depth if spec.max_depth > 0 else None,
        'request_handler_timeout': timedelta(seconds=settings.request_timeout_seconds),
        'respect_robots_txt_file': spec.respect_robots,
    }


def _browser_options(spec: RunSpec, settings: Settings) -> dict[str, Any]:
    options: dict[str, Any] = {'headless': spec.headless and settings.headless}
    if not spec.stealth:
        options['fingerprint_generator'] = None
        options['browser_new_context_options'] = {'user_agent': effective_user_agent(spec, settings)}
    return options


def _instantiate(spec: RunSpec, settings: Settings, request_manager: RequestManager | None) -> AnyCrawler:
    common = _common_options(spec, settings, request_manager)

    match spec.crawler:
        case CrawlerKind.HTTP:
            return HttpCrawler(**common)
        case CrawlerKind.BEAUTIFULSOUP:
            return BeautifulSoupCrawler(**common)
        case CrawlerKind.PARSEL:
            return ParselCrawler(**common)
        case CrawlerKind.PLAYWRIGHT:
            return PlaywrightCrawler(**_browser_options(spec, settings), **common)
        case CrawlerKind.ADAPTIVE:
            return AdaptivePlaywrightCrawler.with_beautifulsoup_static_parser(
                result_checker=make_result_checker(spec),
                playwright_crawler_specific_kwargs=cast('Any', _browser_options(spec, settings)),
                **common,
            )

    raise ConfigurationError(f'unsupported crawler kind: {spec.crawler}')


def build_crawler(
    spec: RunSpec,
    settings: Settings,
    handler: PageHandler,
    failure_handler: FailureHandler | None = None,
    request_manager: RequestManager | None = None,
) -> AnyCrawler:
    """Create the crawler for this run with its default handler already registered."""
    if spec.crawler is CrawlerKind.HTTP and spec.follows_links:
        raise ConfigurationError(
            'the http crawler fetches raw bodies and cannot discover links. '
            'Use --crawler beautifulsoup, parsel, playwright or adaptive to follow links.'
        )

    crawler = _instantiate(spec, settings, request_manager)
    crawler.router.default_handler(handler)

    if failure_handler is not None:
        crawler.failed_request_handler(failure_handler)

    if spec.crawler.needs_browser and spec.block_resources:
        hook = make_resource_blocker(spec.block_resources)
        crawler.pre_navigation_hook(hook)  # type: ignore[attr-defined]

    return crawler
