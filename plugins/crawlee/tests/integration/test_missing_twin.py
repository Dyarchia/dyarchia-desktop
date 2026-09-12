"""What a run does when the markdown twin of a page is not there.

Both outcomes were in one real sweep of learn.chatgpt.com: two pages that exist and publish no
twin, and one URL the sitemap still lists that the site no longer serves. They are different
things and they used to be indistinguishable, because both ended as a failed request with a
traceback in the log.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.engine import execute
from dyarchia_crawlee.models import CrawlerKind, RunSpec


def run(url: str, settings: Settings) -> object:
    spec = RunSpec(name='twin-probe', start_urls=[url], crawler=CrawlerKind.HTTP, fetch_suffix='.md')
    return asyncio.run(execute(spec, settings))


def test_a_page_with_no_twin_is_fetched_as_itself(site: str, tmp_path: Path) -> None:
    """other/not-a-product.html is the fixture's page with no .md beside it under any convention."""
    settings = Settings(data_dir=str(tmp_path), output_dir=str(tmp_path), storage_dir=str(tmp_path / 's'))
    result = run(f'{site}other/not-a-product.html', settings)

    assert result.items, 'the page is there and should have been collected once its twins 404ed'
    assert not result.failures
    assert result.items[0].url == f'{site}other/not-a-product.html'


def test_a_url_the_site_does_not_serve_is_a_stale_entry(site: str, tmp_path: Path) -> None:
    settings = Settings(data_dir=str(tmp_path), output_dir=str(tmp_path), storage_dir=str(tmp_path / 's'))
    result = run(f'{site}gone/never-existed', settings)

    assert not result.items
    assert len(result.failures) == 1
    assert result.failures[0].status_code == 404
    assert 'stale' in result.failures[0].error
    assert result.failures[0].url == f'{site}gone/never-existed'
