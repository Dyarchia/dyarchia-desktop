"""End to end exercises of the command line.

Every test here runs offline. The ones that need a website get the fixture site from `conftest`,
served on localhost for the session, so the suite proves the crawlers work without depending on
somebody else's uptime. The `browser` marker still gates the tests that need Playwright installed.
"""

from __future__ import annotations

import contextlib
import json
import subprocess
from collections.abc import Iterator
from pathlib import Path

import pytest
from typer.testing import CliRunner

from dyarchia_crawlee.cli import app
from dyarchia_crawlee.config import get_settings

runner = CliRunner()


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
    monkeypatch.setenv('DYARCHIA_CRAWLEE_OUTPUT_DIR', str(tmp_path / 'output'))
    monkeypatch.setenv('DYARCHIA_CRAWLEE_DATA_DIR', str(tmp_path / 'data'))
    monkeypatch.setenv('DYARCHIA_CRAWLEE_PROFILES_DIR', str(tmp_path / 'profiles'))
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
    for command in ('crawl', 'inspect', 'diff', 'profiles', 'urls'):
        assert command in output(result)


def test_crawl_without_a_target_explains_itself(workspace: Path) -> None:
    result = runner.invoke(app, ['crawl'])
    assert result.exit_code == 1
    assert 'at least one URL' in output(result)


def test_an_unknown_profile_is_reported(workspace: Path) -> None:
    result = runner.invoke(app, ['crawl', '--profile', 'nope'])
    assert result.exit_code == 1
    assert 'unknown profile' in output(result)


def test_a_malformed_selector_is_rejected(workspace: Path, site: str) -> None:
    result = runner.invoke(app, ['crawl', site, '--select', 'no-equals-sign'])
    assert result.exit_code != 0


def test_profiles_lists_the_bundled_python_profile(workspace: Path) -> None:
    result = runner.invoke(app, ['profiles'])
    assert result.exit_code == 0
    assert 'claude-docs' in output(result)


def test_profiles_shows_the_sitemap_a_target_starts_from(workspace: Path) -> None:
    """Sitemap-driven profiles have no start URL, and the table must still say where they point."""
    profiles = workspace / 'profiles'
    profiles.mkdir(parents=True, exist_ok=True)
    (profiles / 'mapped.yaml').write_text(
        'name: mapped\nsitemap_urls:\n  - https://ex.co/s.xml\n',
        encoding='utf-8',
    )

    result = runner.invoke(app, ['profiles'])
    assert result.exit_code == 0
    assert 'https://ex.co/s.xml' in output(result)


def test_diff_without_a_snapshot_says_so(workspace: Path) -> None:
    result = runner.invoke(app, ['diff', 'claude-docs'])
    assert result.exit_code == 1
    assert 'no change report' in output(result)


def test_a_static_page_is_scraped_with_selectors(workspace: Path, site: str) -> None:
    result = runner.invoke(
        app,
        ['crawl', site, '--crawler', 'beautifulsoup', '--select', 'title=h1', '--name', 'catalogue'],
    )
    assert result.exit_code == 0

    items = read_items(workspace, 'catalogue')
    assert items[0]['fields'] == {'title': 'Fixture catalogue'}


def test_link_following_respects_the_filters(workspace: Path, site: str) -> None:
    """Following `/catalogue/` must reach the products and must never reach the page outside it."""
    result = runner.invoke(
        app,
        [
            'crawl',
            site,
            '--crawler',
            'parsel',
            '--depth',
            '1',
            '--max-pages',
            '4',
            '--follow',
            '/catalogue/',
            '--name',
            'deep',
        ],
    )
    assert result.exit_code == 0

    urls = [str(item['url']) for item in read_items(workspace, 'deep')]
    assert len(urls) > 1
    assert any('/catalogue/' in url for url in urls)
    assert not any('/other/' in url for url in urls)


def test_inspect_finds_the_markdown_variant(workspace: Path, site: str) -> None:
    result = runner.invoke(app, ['inspect', f'{site}guide.html'])
    assert result.exit_code == 0
    assert 'markdown variant' in output(result)
    assert '--crawler http' in output(result)


def test_inspect_finds_the_twin_that_replaced_the_extension(workspace: Path, site: str) -> None:
    """The form developer.salesforce.com serves, where appending would ask for a page that is 404.

    The fixture publishes handbook.md and no handbook.html.md, so this passes only while the probe
    offers the same candidates a run with fetch_suffix would fetch.
    """
    result = runner.invoke(app, ['inspect', f'{site}handbook.html'])
    assert result.exit_code == 0
    assert 'handbook.md' in output(result)
    assert '--crawler http' in output(result)


def test_a_run_can_be_saved_as_a_profile_and_replayed(workspace: Path, site: str) -> None:
    saved = runner.invoke(
        app,
        ['crawl', site, '--crawler', 'parsel', '--select', 'title=h1', '--save-profile', 'saved-demo'],
    )
    assert saved.exit_code == 0
    assert (workspace / 'profiles' / 'saved-demo.yaml').is_file()

    replayed = runner.invoke(app, ['crawl', '--profile', 'saved-demo'])
    assert replayed.exit_code == 0
    assert 'parsel' in output(replayed)


@pytest.mark.browser
def test_a_javascript_page_needs_a_browser(workspace: Path, site: str) -> None:
    """The static crawler sees an empty shell; the browser-backed ones see the quotes."""
    quotes_url = f'{site}js/'
    select = ['--select', 'quotes=all:.quote .text']

    static = runner.invoke(app, ['crawl', quotes_url, '--crawler', 'parsel', *select, '--name', 's'])
    assert static.exit_code == 0
    assert read_items(workspace, 's')[0]['fields'] == {'quotes': []}

    rendered = runner.invoke(app, ['crawl', quotes_url, '--crawler', 'adaptive', *select, '--name', 'r'])
    assert rendered.exit_code == 0
    fields = read_items(workspace, 'r')[0]['fields']
    assert isinstance(fields, dict)
    assert len(fields['quotes']) == 10


def test_a_snapshot_run_reports_no_change_on_a_rerun(workspace: Path, site: str) -> None:
    args = ['crawl', site, '--crawler', 'parsel', '--snapshot', '--name', 'snap']

    first = runner.invoke(app, args)
    assert first.exit_code == 0
    assert 'first snapshot' in output(first)

    second = runner.invoke(app, args)
    assert second.exit_code == 0
    assert '0 modified' in output(second)

    report = runner.invoke(app, ['diff', 'snap'])
    assert report.exit_code == 0


def test_watch_sweeps_a_target_and_reports_no_change_the_second_time(workspace: Path, site: str) -> None:
    """The scheduler reads the exit code, so the exit code is what this asserts."""
    profiles = workspace / 'profiles'
    profiles.mkdir(parents=True, exist_ok=True)
    (profiles / 'local.yaml').write_text(
        f'name: local\nstart_urls:\n  - {site}\ncrawler: parsel\nsnapshot: true\n',
        encoding='utf-8',
    )

    first = runner.invoke(app, ['watch', 'local'])
    assert first.exit_code == 0
    assert 'first snapshot' in output(first)

    second = runner.invoke(app, ['watch', 'local'])
    assert second.exit_code == 0
    assert 'no change across 1 targets' in output(second)

    report = (workspace / 'data' / 'WATCH.md').read_text(encoding='utf-8')
    assert '# Watch report' in report


def test_watch_reports_a_target_that_could_not_be_reached(workspace: Path) -> None:
    profiles = workspace / 'profiles'
    profiles.mkdir(parents=True, exist_ok=True)
    (profiles / 'gone.yaml').write_text(
        'name: gone\nstart_urls:\n  - http://127.0.0.1:9/\ncrawler: parsel\nsnapshot: true\n',
        encoding='utf-8',
    )

    result = runner.invoke(app, ['watch', 'gone'])
    assert result.exit_code == 1
    assert 'failed' in output(result)


def snapshotted(site: str) -> None:
    """Snapshot the fixture catalogue, which is what the inventory then reads back."""
    result = runner.invoke(
        app,
        [
            'crawl',
            site,
            '--crawler',
            'parsel',
            '--depth',
            '1',
            '--follow',
            '/catalogue/',
            '--snapshot',
            '--name',
            'kept',
        ],
    )
    assert result.exit_code == 0


def test_urls_breaks_a_target_down_by_section(workspace: Path, site: str) -> None:
    snapshotted(site)

    result = runner.invoke(app, ['urls', 'kept'])
    assert result.exit_code == 0
    assert 'kept' in output(result)
    assert 'catalogue' in output(result)


def test_urls_can_print_the_plain_list(workspace: Path, site: str) -> None:
    snapshotted(site)

    result = runner.invoke(app, ['urls', 'kept', '--list'])
    assert result.exit_code == 0
    lines = [line for line in (result.stdout or '').splitlines() if line.strip()]
    assert lines
    assert all(line.startswith('http://') for line in lines)


def test_urls_without_a_snapshot_says_so(workspace: Path) -> None:
    result = runner.invoke(app, ['urls', 'never-run'])
    assert result.exit_code == 1
    assert 'never-run' in output(result)


def test_profile_show_prints_the_file_verbatim(workspace: Path) -> None:
    """A profile's comments are its measurements. Anything reading one to edit it must see them."""
    profiles = workspace / 'profiles'
    profiles.mkdir(parents=True, exist_ok=True)
    text = (
        'name: measured\n'
        '# 45 of 46 pages publish a usable twin, measured 2026-09-04\n'
        'start_urls:\n'
        '  - https://s/one  # the one that mattered\n'
    )
    (profiles / 'measured.yaml').write_text(text, encoding='utf-8')

    result = runner.invoke(app, ['profile', 'show', 'measured'])

    assert result.exit_code == 0
    assert result.stdout == text


def test_profile_show_renders_the_python_profile_and_warns_off_the_document(workspace: Path) -> None:
    """The bundled profile has no file. The warning belongs on stderr so a redirect still works."""
    result = runner.invoke(app, ['profile', 'show', 'claude-docs'])

    assert result.exit_code == 0
    assert result.stdout.startswith('name: claude-docs')
    assert 'rendered' not in result.stdout


def test_profile_show_of_an_unknown_profile_fails(workspace: Path) -> None:
    result = runner.invoke(app, ['profile', 'show', 'never-written'])

    assert result.exit_code == 1
    assert 'never-written' in output(result)


def test_profile_save_refuses_what_it_cannot_commit(workspace: Path) -> None:
    """The default a save button needs: offering an edit that leaves no trace is worse than none."""
    result = runner.invoke(
        app, ['profile', 'save', 'demo'], input='name: demo\nstart_urls:\n  - https://s/one\n'
    )

    assert result.exit_code == 1
    assert 'refusing to save' in output(result)
    assert not (workspace / 'profiles' / 'demo.yaml').exists()


def test_profile_save_writes_and_commits_inside_a_repository(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = workspace / 'corpus-repo'
    root.mkdir()
    for command in (
        ('init', '-q'),
        ('config', 'user.email', 'test@example.invalid'),
        ('config', 'user.name', 'Test'),
    ):
        subprocess.run(['git', *command], cwd=root, check=True, capture_output=True)
    subprocess.run(['git', 'commit', '-q', '--allow-empty', '-m', 'start'], cwd=root, check=True)
    monkeypatch.setenv('DYARCHIA_CRAWLEE_PROFILES_DIR', str(root / 'profiles'))
    get_settings.cache_clear()

    text = 'name: demo  # kept as written\nstart_urls:\n  - https://s/one\n'
    result = runner.invoke(app, ['profile', 'save', 'demo'], input=text)

    assert result.exit_code == 0
    assert (root / 'profiles' / 'demo.yaml').read_text(encoding='utf-8') == text
    logged = subprocess.run(['git', 'log', '--oneline'], cwd=root, capture_output=True, text=True, check=True)
    assert 'profile(demo): added' in logged.stdout


def test_profile_save_refuses_an_unknown_key_without_writing(workspace: Path) -> None:
    """extra='forbid' is what lets a front end compose the YAML without owning the schema."""
    result = runner.invoke(
        app,
        ['profile', 'save', 'demo', '--allow-untracked'],
        input='name: demo\nstart_urls:\n  - https://s/one\nmax_deph: 2\n',
    )

    assert result.exit_code == 1
    assert 'max_deph' in output(result)
    assert not (workspace / 'profiles' / 'demo.yaml').exists()


def test_profile_save_refuses_a_profile_that_names_no_source(workspace: Path) -> None:
    result = runner.invoke(
        app, ['profile', 'save', 'demo', '--allow-untracked'], input='name: demo\nmax_depth: 2\n'
    )

    assert result.exit_code == 1
    assert not (workspace / 'profiles' / 'demo.yaml').exists()


def test_profile_save_allows_an_unversioned_corpus_when_told_to(workspace: Path) -> None:
    result = runner.invoke(
        app,
        ['profile', 'save', 'demo', '--allow-untracked'],
        input='name: demo\nstart_urls:\n  - https://s/one\n',
    )

    assert result.exit_code == 0
    assert (workspace / 'profiles' / 'demo.yaml').is_file()
    assert 'not versioned' in output(result)
