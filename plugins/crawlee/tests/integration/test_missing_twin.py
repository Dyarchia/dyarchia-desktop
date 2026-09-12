"""What a run does when a URL it was handed is not served.

Both outcomes were in one real sweep of learn.chatgpt.com: two pages that exist and publish no
twin, and one URL the sitemap still lists that the site no longer serves. They are different
things and they used to be indistinguishable, because both ended as a failed request with a
traceback in the log.

A sitemap entry that 404s is the same answer whether or not the profile asks for a twin.
mistral-docs carries no twin and its sitemap lists two URLs the site dropped, which is where the
sitemap tests come from.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.engine import execute
from dyarchia_crawlee.models import CrawlerKind, RunSpec


def settings_in(tmp_path: Path) -> Settings:
    return Settings(data_dir=str(tmp_path), output_dir=str(tmp_path), storage_dir=str(tmp_path / 's'))


def run(settings: Settings, **overrides: Any) -> Any:
    spec = RunSpec(name='probe', crawler=CrawlerKind.HTTP, **overrides)
    return asyncio.run(execute(spec, settings))


def test_a_page_with_no_twin_is_fetched_as_itself(site: str, tmp_path: Path) -> None:
    """other/not-a-product.html is the fixture's page with no .md beside it under any convention."""
    result = run(settings_in(tmp_path), start_urls=[f'{site}other/not-a-product.html'], fetch_suffix='.md')

    assert result.items, 'the page is there and should have been collected once its twins 404ed'
    assert not result.failures
    assert result.items[0].url == f'{site}other/not-a-product.html'


def test_a_sitemap_entry_the_site_dropped_is_stale_with_a_twin(site: str, tmp_path: Path) -> None:
    """The learn.chatgpt.com case: a suffixed profile whose sitemap still lists a dead URL."""
    result = run(settings_in(tmp_path), sitemap_urls=[f'{site}sitemap-stale.xml'], fetch_suffix='.md')

    assert len(result.items) == 1, 'the live entry is still collected'
    assert len(result.failures) == 1
    assert result.failures[0].status_code == 404
    assert 'stale' in result.failures[0].error
    assert result.failures[0].url == f'{site}gone/retired-last-year'


def test_a_sitemap_entry_the_site_dropped_is_stale_without_a_twin(site: str, tmp_path: Path) -> None:
    """The docs.mistral.ai case: no twin asked for, and the sitemap still lists a dead URL."""
    result = run(settings_in(tmp_path), sitemap_urls=[f'{site}sitemap-stale.xml'])

    assert len(result.items) == 1
    assert len(result.failures) == 1
    assert result.failures[0].status_code == 404
    assert 'stale' in result.failures[0].error
    assert result.failures[0].url == f'{site}gone/retired-last-year'


def test_a_live_sitemap_costs_no_failures(site: str, tmp_path: Path) -> None:
    """The control: ignoring 404 must not turn a healthy sitemap into a quiet one."""
    result = run(settings_in(tmp_path), sitemap_urls=[f'{site}sitemap-live.xml'])

    assert len(result.items) == 2
    assert not result.failures


def test_a_url_typed_by_hand_still_fails_loudly(site: str, tmp_path: Path) -> None:
    """Nobody listed it and the operator asked for it by name, so the 404 is their answer."""
    result = run(settings_in(tmp_path), start_urls=[f'{site}gone/never-existed'])

    assert not result.items
    assert len(result.failures) == 1
    assert 'stale' not in result.failures[0].error
    assert 'HttpClientStatusCodeError' in result.failures[0].error
