"""Per-domain throttling so robots.txt crawl-delay and HTTP 429 backoff are actually honoured.

Crawlee reads `Crawl-delay` from robots.txt but can only enforce it when the crawler is driven by a
`ThrottlingRequestManager`; without one it logs a warning and ignores the directive. The delays here
are reactive, not a fixed pause: an ordinary crawl runs at full speed and only slows down for a
domain that asked for it or that answered 429.

Having a throttler is not enough on its own. Crawlee hands it the directive from inside
`_is_allowed_based_on_robots_txt_file`, and only when the crawler's own `request_manager` *is* a
`ThrottlingRequestManager`. A sitemap-seeded run wraps the throttler in a `RequestManagerTandem`, so
that check fails, the branch never runs and the delay is never set, while 429 backoff keeps working
because the throttler records that itself. The crawler takes no request loader beside its manager,
so the tandem is the supported shape and cannot be avoided: `apply_robots_crawl_delay` reads the
directive with crawlee's own parser and sets it on the throttler directly.
"""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlparse

from crawlee._utils.robots import RobotsTxtFile
from crawlee.http_clients import HttpClient
from crawlee.request_loaders import RequestManager, ThrottlingRequestManager
from crawlee.storages import RequestQueue

from dyarchia_crawlee.models import RunSpec


def target_domains(urls: list[str]) -> list[str]:
    return sorted({hostname for url in urls if (hostname := urlparse(url).hostname)})


async def build_request_manager(spec: RunSpec) -> RequestManager | None:
    """Wrap the default request queue in a throttler, unless this run opted out of robots.txt."""
    if not spec.respect_robots:
        return None

    domains = target_domains([*spec.start_urls, *spec.sitemap_urls])
    if not domains:
        return None

    return ThrottlingRequestManager(
        inner=await RequestQueue.open(),
        domains=domains,
        request_manager_opener=RequestQueue.open,
    )


async def apply_robots_crawl_delay(
    manager: RequestManager | None, spec: RunSpec, client: HttpClient
) -> list[str]:
    """Hand the throttler each domain's robots.txt crawl-delay, and report which domains asked.

    Crawlee only does this when its own request manager is the throttler, which a sitemap-seeded run
    never satisfies. Setting it here covers both shapes: the call is idempotent and locks the first
    value, so on the path where crawlee also sets it the second write is a no-op rather than a
    conflict. One robots.txt fetch per domain per run is the whole cost, and a domain that asks for
    nothing costs nothing after it.
    """
    if not isinstance(manager, ThrottlingRequestManager) or not spec.respect_robots:
        return []

    applied = []
    for url in _one_url_per_domain([*spec.start_urls, *spec.sitemap_urls]):
        try:
            robots = await RobotsTxtFile.find(url, client)
        except Exception:
            """A domain that will not serve robots.txt is already handled by the crawler, which
            treats the absence as permission. It must not take the run down from here."""
            continue

        delay = robots.get_crawl_delay()
        if delay is not None:
            manager.set_crawl_delay(url, delay)
            applied.append(f'{urlparse(url).hostname}: {delay}s')
    return applied


def _one_url_per_domain(urls: list[str]) -> list[str]:
    """One real URL per host, so robots.txt is looked up without guessing a scheme."""
    seen: dict[str, str] = {}
    for url in urls:
        hostname = urlparse(url).hostname
        if hostname and hostname not in seen:
            seen[hostname] = url
    return list(seen.values())


CRAWL_DELAY_WARNING = 'Crawl-delay directives from robots.txt will not be enforced'


class _CrawlDelayHandledHere(logging.Filter):
    """Drops crawlee's crawl-delay warning on the one path where it is false."""

    def filter(self, record: logging.LogRecord) -> bool:
        return CRAWL_DELAY_WARNING not in record.getMessage()


def crawl_delay_is_ours(spec: RunSpec, manager: RequestManager | None) -> bool:
    """Whether this run applies the crawl-delay itself, which is the seeded shape and only that.

    True means a throttler was built and then wrapped, so crawlee's isinstance check will fail and
    `apply_robots_crawl_delay` has already done the work. False means either the throttler is the
    manager, in which case crawlee does it, or there is no throttler at all, in which case the
    directive really is unenforced and the warning is the truth.
    """
    return (
        spec.respect_robots
        and manager is not None
        and not isinstance(manager, ThrottlingRequestManager)
        and bool(target_domains([*spec.start_urls, *spec.sitemap_urls]))
    )


def silence_crawl_delay_warning(crawler: Any) -> None:
    """Stop the crawler repeating a warning this run has already answered.

    Crawlee reports its own check rather than the outcome, so a seeded run is told on every start
    that crawl-delay will not be enforced, moments after this module enforced it. Left in place the
    line outlives everyone's memory of why it is wrong. Matched on the message because there is no
    code to match on; if upstream rewrites the sentence the warning comes back, which is noise
    rather than a defect.
    """
    crawler.log.addFilter(_CrawlDelayHandledHere())
