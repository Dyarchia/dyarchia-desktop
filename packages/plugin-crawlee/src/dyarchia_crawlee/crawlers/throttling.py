"""Per-domain throttling so robots.txt crawl-delay and HTTP 429 backoff are actually honoured.

Crawlee reads `Crawl-delay` from robots.txt but can only enforce it when the crawler is driven by a
`ThrottlingRequestManager`; without one it logs a warning and ignores the directive. The delays here
are reactive, not a fixed pause: an ordinary crawl runs at full speed and only slows down for a
domain that asked for it or that answered 429.
"""

from __future__ import annotations

from urllib.parse import urlparse

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
