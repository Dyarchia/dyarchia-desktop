"""End to end exercises of the command line.

Everything here runs offline except the tests marked `network`, which are the ones that prove the
crawlers actually work against the sandboxes they were designed for. CI runs the rest.
"""

from __future__ import annotations

import contextlib
import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from typer.testing import CliRunner

from crawlee_lab.cli import app
from crawlee_lab.config import get_settings

runner = CliRunner()

BOOKS = 'https://books.toscrape.com/'
QUOTES_JS = 'https://quotes.toscrape.com/js/'


def output(result: object) -> str:
    """Both streams with whitespace collapsed.

    Diagnostics go to stderr, and rich wraps table cells to the terminal width, so asserting on the
    raw text would make these tests fail on a phrase that merely happened to break across lines.
    """
    streams = [getattr(result, 'stdout', '') or '']
    with contextlib.suppress(ValueError):
        streams.append(getattr(result, 'stderr', '') or '')
    return ' '.join(''.join(streams).split())


@pytest.fixture
def workspace(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point every configured path at a temporary directory for the duration of one test."""
    monkeypatch.setenv('CRAWLEE_LAB_OUTPUT_DIR', str(tmp_path / 'output'))
    monkeypatch.setenv('CRAWLEE_LAB_DATA_DIR', str(tmp_path / 'data'))
    monkeypatch.setenv('CRAWLEE_LAB_PROFILES_DIR', str(tmp_path / 'profiles'))
    monkeypatch.chdir(tmp_path)
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def read_items(workspace: Path, name: str) -> list[dict[str, object]]:
    payload = (workspace / 'output' / f'{name}.json').read_text(encoding='utf-8')
    return list(json.loads(payload))


def test_help_lists_every_command() -> None:
    result = runner.invoke(app, ['--help'])
    assert result.exit_code == 0
    for command in ('crawl', 'inspect', 'diff', 'profiles'):
        assert command in output(result)


def test_crawl_without_a_target_explains_itself(workspace: Path) -> None:
    result = runner.invoke(app, ['crawl'])
    assert result.exit_code == 1
    assert 'at least one URL' in output(result)


def test_an_unknown_profile_is_reported(workspace: Path) -> None:
    result = runner.invoke(app, ['crawl', '--profile', 'nope'])
    assert result.exit_code == 1
    assert 'unknown profile' in output(result)


def test_a_malformed_selector_is_rejected(workspace: Path) -> None:
    result = runner.invoke(app, ['crawl', BOOKS, '--select', 'no-equals-sign'])
    assert result.exit_code != 0


def test_profiles_lists_the_bundled_python_profile(workspace: Path) -> None:
    result = runner.invoke(app, ['profiles'])
    assert result.exit_code == 0
    assert 'claude-docs' in output(result)


def test_diff_without_a_snapshot_says_so(workspace: Path) -> None:
    result = runner.invoke(app, ['diff', 'claude-docs'])
    assert result.exit_code == 1
    assert 'no change report' in output(result)


@pytest.mark.network
def test_a_static_page_is_scraped_with_selectors(workspace: Path) -> None:
    result = runner.invoke(
        app,
        ['crawl', BOOKS, '--crawler', 'beautifulsoup', '--select', 'title=h1', '--name', 'books'],
    )
    assert result.exit_code == 0

    items = read_items(workspace, 'books')
    assert items[0]['fields'] == {'title': 'All products'}


@pytest.mark.network
def test_link_following_respects_the_filters(workspace: Path) -> None:
    result = runner.invoke(
        app,
        [
            'crawl',
            BOOKS,
            '--crawler',
            'parsel',
            '--depth',
            '1',
            '--max-pages',
            '4',
            '--follow',
            '/catalogue/',
            '--name',
            'books-deep',
        ],
    )
    assert result.exit_code == 0

    items = read_items(workspace, 'books-deep')
    assert len(items) > 1
    assert any('/catalogue/' in str(item['url']) for item in items)


@pytest.mark.network
def test_inspect_finds_the_markdown_variant(workspace: Path) -> None:
    result = runner.invoke(app, ['inspect', 'https://claude.com/docs/claude-science/get-started'])
    assert result.exit_code == 0
    assert 'markdown variant' in output(result)
    assert '--crawler http' in output(result)


@pytest.mark.network
def test_a_run_can_be_saved_as_a_profile_and_replayed(workspace: Path) -> None:
    saved = runner.invoke(
        app,
        ['crawl', BOOKS, '--crawler', 'parsel', '--select', 'title=h1', '--save-profile', 'saved-demo'],
    )
    assert saved.exit_code == 0
    assert (workspace / 'profiles' / 'saved-demo.yaml').is_file()

    replayed = runner.invoke(app, ['crawl', '--profile', 'saved-demo'])
    assert replayed.exit_code == 0
    assert 'parsel' in output(replayed)


@pytest.mark.network
@pytest.mark.browser
def test_a_javascript_page_needs_a_browser(workspace: Path) -> None:
    """The static crawler sees an empty shell; the browser-backed ones see the quotes."""
    static = runner.invoke(
        app,
        ['crawl', QUOTES_JS, '--crawler', 'parsel', '--select', 'quotes=all:.quote .text', '--name', 's'],
    )
    assert static.exit_code == 0
    assert read_items(workspace, 's')[0]['fields'] == {'quotes': []}

    rendered = runner.invoke(
        app,
        ['crawl', QUOTES_JS, '--crawler', 'adaptive', '--select', 'quotes=all:.quote .text', '--name', 'r'],
    )
    assert rendered.exit_code == 0
    quotes = read_items(workspace, 'r')[0]['fields']
    assert isinstance(quotes, dict)
    assert len(quotes['quotes']) == 10


@pytest.mark.network
def test_a_snapshot_run_reports_no_change_on_a_rerun(workspace: Path) -> None:
    args = ['crawl', BOOKS, '--crawler', 'parsel', '--snapshot', '--name', 'snap']

    first = runner.invoke(app, args)
    assert first.exit_code == 0
    assert 'first snapshot' in output(first)

    second = runner.invoke(app, args)
    assert second.exit_code == 0
    assert '0 modified' in output(second)

    report = runner.invoke(app, ['diff', 'snap'])
    assert report.exit_code == 0
