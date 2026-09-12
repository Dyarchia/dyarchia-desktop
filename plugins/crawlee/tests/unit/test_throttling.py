"""Handing the throttler the crawl-delay that crawlee only applies for a non-seeded run."""

from __future__ import annotations

from typing import Any, cast

import pytest
from crawlee._utils.robots import RobotsTxtFile
from crawlee.request_loaders import ThrottlingRequestManager

from dyarchia_crawlee.crawlers import throttling
from dyarchia_crawlee.crawlers.throttling import apply_robots_crawl_delay, target_domains
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
