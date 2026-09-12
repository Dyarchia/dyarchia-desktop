"""Handing the throttler the crawl-delay that crawlee only applies for a non-seeded run."""

from __future__ import annotations

import logging
from typing import Any, cast

import pytest
from crawlee._utils.robots import RobotsTxtFile
from crawlee.request_loaders import ThrottlingRequestManager

from dyarchia_crawlee.crawlers import throttling
from dyarchia_crawlee.crawlers.throttling import (
    CRAWL_DELAY_WARNING,
    apply_robots_crawl_delay,
    crawl_delay_is_ours,
    silence_crawl_delay_warning,
    target_domains,
)
from dyarchia_crawlee.models import RunSpec

ASKS_FOR_TWO = 'User-agent: *\nCrawl-delay: 2\nAllow: /\n'
ASKS_FOR_NOTHING = 'User-agent: *\nAllow: /\n'


class Recorder:
    """A stand-in for the throttler that records what it was told, and nothing else."""

    def __init__(self) -> None:
        self.delays: list[tuple[str, int]] = []

    def set_crawl_delay(self, url: str, delay_seconds: int) -> None:
        self.delays.append((url, delay_seconds))


def recorder() -> Any:
    """Typed as the throttler because apply_robots_crawl_delay refuses anything else."""
    instance = Recorder()
    instance.__class__ = type('ThrottlingRecorder', (Recorder, ThrottlingRequestManager), {})
    return cast('Any', instance)


def serve(monkeypatch: pytest.MonkeyPatch, bodies: dict[str, str]) -> None:
    async def find(url: str, _client: Any, *_args: Any, **_kwargs: Any) -> RobotsTxtFile:
        host = url.split('/')[2]
        if host not in bodies:
            raise OSError(f'no robots.txt for {host}')
        return await RobotsTxtFile.from_content(url, bodies[host])

    monkeypatch.setattr(throttling.RobotsTxtFile, 'find', find)


def spec_for(**overrides: Any) -> RunSpec:
    return RunSpec(name='demo', **overrides)


def test_target_domains_are_unique_and_sorted() -> None:
    urls = ['https://b.example/a', 'https://a.example/x', 'https://b.example/c']
    assert target_domains(urls) == ['a.example', 'b.example']


async def test_a_declared_crawl_delay_reaches_the_throttler(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, {'slow.example': ASKS_FOR_TWO})
    manager = recorder()

    applied = await apply_robots_crawl_delay(
        manager, spec_for(sitemap_urls=['https://slow.example/sitemap.xml']), cast('Any', object())
    )

    assert applied == ['slow.example: 2s']
    assert manager.delays == [('https://slow.example/sitemap.xml', 2)]


async def test_a_domain_that_asks_for_nothing_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, {'fast.example': ASKS_FOR_NOTHING})
    manager = recorder()

    applied = await apply_robots_crawl_delay(
        manager, spec_for(start_urls=['https://fast.example/']), cast('Any', object())
    )

    assert applied == []
    assert manager.delays == []


async def test_one_lookup_per_domain_however_many_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, {'slow.example': ASKS_FOR_TWO})
    manager = recorder()

    applied = await apply_robots_crawl_delay(
        manager,
        spec_for(start_urls=['https://slow.example/a', 'https://slow.example/b', 'https://slow.example/c']),
        cast('Any', object()),
    )

    assert applied == ['slow.example: 2s']
    assert len(manager.delays) == 1


async def test_a_domain_with_no_robots_txt_does_not_stop_the_others(monkeypatch: pytest.MonkeyPatch) -> None:
    """The crawler treats an absent robots.txt as permission, so neither may this raise."""
    serve(monkeypatch, {'slow.example': ASKS_FOR_TWO})
    manager = recorder()

    applied = await apply_robots_crawl_delay(
        manager,
        spec_for(start_urls=['https://silent.example/', 'https://slow.example/']),
        cast('Any', object()),
    )

    assert applied == ['slow.example: 2s']


async def test_a_run_that_opted_out_of_robots_is_never_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, {'slow.example': ASKS_FOR_TWO})
    manager = recorder()

    applied = await apply_robots_crawl_delay(
        manager, spec_for(start_urls=['https://slow.example/'], respect_robots=False), cast('Any', object())
    )

    assert applied == []
    assert manager.delays == []


async def test_without_a_throttler_there_is_nothing_to_tell(monkeypatch: pytest.MonkeyPatch) -> None:
    serve(monkeypatch, {'slow.example': ASKS_FOR_TWO})

    spec = spec_for(start_urls=['https://slow.example/'])
    assert await apply_robots_crawl_delay(None, spec, cast('Any', object())) == []


def tandem() -> Any:
    """Whatever the crawler ends up holding on the seeded path, which is not the throttler."""
    return cast('Any', object())


def throttler() -> Any:
    return recorder()


def test_the_seeded_shape_owns_the_delay() -> None:
    spec = spec_for(sitemap_urls=['https://slow.example/sitemap.xml'])
    assert crawl_delay_is_ours(spec, tandem()) is True


def test_a_bare_throttler_leaves_it_to_crawlee() -> None:
    spec = spec_for(start_urls=['https://slow.example/'])
    assert crawl_delay_is_ours(spec, throttler()) is False


def test_no_domains_means_the_warning_is_the_truth() -> None:
    """A URL with no hostname builds no throttler, so nothing enforces the directive and the
    warning should survive. The model accepts such a URL, which is what makes this reachable."""
    assert crawl_delay_is_ours(spec_for(start_urls=['file:///tmp/pages']), tandem()) is False


def test_opting_out_of_robots_owns_nothing() -> None:
    spec = spec_for(start_urls=['https://slow.example/'], respect_robots=False)
    assert crawl_delay_is_ours(spec, tandem()) is False


def test_the_filter_drops_the_warning_and_keeps_everything_else() -> None:
    logger = logging.getLogger('test-crawler-log')
    crawler = cast('Any', type('Crawler', (), {'log': logger})())
    silence_crawl_delay_warning(crawler)

    def emitted(message: str) -> bool:
        record = logger.makeRecord(logger.name, logging.WARNING, __file__, 1, message, None, None)
        return all(candidate.filter(record) for candidate in logger.filters)

    assert emitted(f'The option is enabled, but {CRAWL_DELAY_WARNING}. To enable it, do x.') is False
    assert emitted('Request to https://site.example/a failed and reached maximum retries') is True
