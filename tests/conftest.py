"""Shared fixtures."""

from __future__ import annotations

from collections.abc import Iterator
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.models import RunSpec

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture
def catalogue_html() -> str:
    return (FIXTURES / 'catalogue.html').read_text(encoding='utf-8')


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings pointed entirely at a temporary directory, so tests never touch the real project."""
    return Settings(
        data_dir=tmp_path / 'data',
        output_dir=tmp_path / 'output',
        profiles_dir=tmp_path / 'profiles',
    )


@pytest.fixture
def spec() -> RunSpec:
    return RunSpec(name='test-run', start_urls=['https://example.com/'])


class _QuietHandler(SimpleHTTPRequestHandler):
    """The fixture site, served without narrating every request into the test output."""

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, directory=str(FIXTURES / 'site'), **kwargs)  # type: ignore[arg-type]

    def log_message(self, format: str, *args: object) -> None:
        del format, args


@pytest.fixture(scope='session')
def site() -> Iterator[str]:
    """A miniature website on localhost, so the integration suite never leaves the machine.

    Crawling a real sandbox proved the crawlers worked, but it made the suite depend on somebody
    else's uptime and on a network the machine may not have. The fixture site answers the same
    questions offline: static pages with selectable structure, a catalogue to follow links into, a
    page outside it that filters must exclude, and one page whose content only exists after
    JavaScript runs.
    """
    server = ThreadingHTTPServer(('127.0.0.1', 0), _QuietHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/'
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
