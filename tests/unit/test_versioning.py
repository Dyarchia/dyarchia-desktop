"""Hashing, manifests and change reports."""

from __future__ import annotations

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from dyarchia_crawlee.errors import CrawleeLabError
from dyarchia_crawlee.models import PageStatus
from dyarchia_crawlee.versioning.diffing import (
    ChangeKind,
    compare,
    is_reordering,
    load_report,
    save_report,
)
from dyarchia_crawlee.versioning.hashing import content_hash, normalise
from dyarchia_crawlee.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest
from dyarchia_crawlee.versioning.report import render_markdown, summary_line
from dyarchia_crawlee.versioning.vcs import commit_path, repository_root


def record(url: str, sha: str, status: PageStatus = PageStatus.OK) -> PageRecord:
    return PageRecord(url=url, status=status, sha256=sha, path=f'pages/{url[-6:]}.md', title=url)


def manifest(name: str = 'demo', **pages: PageRecord) -> RunManifest:
    return RunManifest(name=name, pages={page.url: page for page in pages.values()})


def test_normalise_ignores_line_endings_and_trailing_space() -> None:
    assert normalise('a  \r\nb\r\n\n') == normalise('a\nb\n')


def test_hash_is_stable_across_incidental_differences() -> None:
    assert content_hash('a  \r\nb') == content_hash('a\nb\n')


def test_hash_still_notices_real_differences() -> None:
    assert content_hash('a\nb') != content_hash('a\nc')


def test_first_run_reports_everything_as_added() -> None:
    current = manifest(one=record('https://s/one', 'aaa'))
    report = compare(None, current, {}, {'https://s/one': 'body'})
    assert report.is_first_run
    assert len(report.added) == 1
    assert summary_line(report) == 'first snapshot: 1 pages stored'


def test_identical_manifests_report_no_changes() -> None:
    previous = manifest(one=record('https://s/one', 'aaa'))
    current = manifest(one=record('https://s/one', 'aaa'))
    report = compare(previous, current, {}, {})
    assert not report.changes
    assert report.unchanged == 1


def test_a_moved_hash_is_a_modification_with_a_diff() -> None:
    previous = manifest(one=record('https://s/one', 'aaa'))
    current = manifest(one=record('https://s/one', 'bbb'))
    report = compare(previous, current, {'https://s/one': 'old line'}, {'https://s/one': 'new line'})

    assert len(report.modified) == 1
    diff = report.modified[0].diff
    assert diff is not None
    assert '-old line' in diff
    assert '+new line' in diff


def test_a_vanished_page_is_a_removal() -> None:
    previous = manifest(one=record('https://s/one', 'aaa'), two=record('https://s/two', 'bbb'))
    current = manifest(one=record('https://s/one', 'aaa'))
    report = compare(previous, current, {}, {})
    assert [change.url for change in report.removed] == ['https://s/two']


def test_a_failed_page_is_not_reported_as_removed() -> None:
    """The distinction the manifest exists for: a bad network day is not a mass deletion."""
    previous = manifest(one=record('https://s/one', 'aaa'), two=record('https://s/two', 'bbb'))
    current = manifest(
        one=record('https://s/one', 'aaa'),
        two=PageRecord(url='https://s/two', status=PageStatus.FAILED, error='timeout'),
    )
    report = compare(previous, current, {}, {})

    assert report.removed == []
    assert report.failed == ['https://s/two']


def test_manifest_round_trips(tmp_path: Path) -> None:
    original = manifest(one=record('https://s/one', 'aaa'))
    save_manifest(original, tmp_path)
    restored = load_manifest(tmp_path)

    assert restored is not None
    assert restored.pages['https://s/one'].sha256 == 'aaa'


def test_missing_manifest_reads_as_none(tmp_path: Path) -> None:
    assert load_manifest(tmp_path) is None


def test_corrupt_manifest_reads_as_none(tmp_path: Path) -> None:
    (tmp_path / 'manifest.json').write_text('{not json', encoding='utf-8')
    assert load_manifest(tmp_path) is None


def test_report_round_trips(tmp_path: Path) -> None:
    previous = manifest(one=record('https://s/one', 'aaa'))
    current = manifest(one=record('https://s/one', 'bbb'))
    report = compare(previous, current, {'https://s/one': 'old'}, {'https://s/one': 'new'})

    save_report(report, tmp_path)
    restored = load_report(tmp_path)

    assert restored is not None
    assert len(restored.modified) == 1
    assert restored.modified[0].kind is ChangeKind.MODIFIED


def test_markdown_report_names_every_section() -> None:
    previous = manifest(gone=record('https://s/gone', 'aaa'))
    current = manifest(fresh=record('https://s/fresh', 'bbb'))
    document = render_markdown(compare(previous, current, {}, {}))

    assert '## Added (1)' in document
    assert '## Removed (1)' in document


def git(repo: Path, *args: str) -> None:
    subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)


def repository(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    git(path, 'init', '-q')
    git(path, 'config', 'user.email', 'test@example.invalid')
    git(path, 'config', 'user.name', 'Test')
    return path


def test_repository_root_finds_the_repository_that_owns_the_data() -> None:
    with TemporaryDirectory() as tmp:
        root = repository(Path(tmp).resolve() / 'data-repo')
        corpus = root / 'data' / 'group' / 'lab'
        corpus.mkdir(parents=True)
        assert repository_root(corpus) == root


def test_repository_root_is_none_outside_any_repository() -> None:
    with TemporaryDirectory() as tmp:
        loose = Path(tmp).resolve() / 'loose'
        loose.mkdir()
        assert repository_root(loose) in (None, repository_root(Path(tmp).resolve()))


def test_commit_path_writes_to_the_data_repository_not_the_tool() -> None:
    with TemporaryDirectory() as tmp:
        tool = repository(Path(tmp).resolve() / 'tool')
        data = repository(Path(tmp).resolve() / 'data-repo')
        corpus = data / 'data' / 'group' / 'lab'
        corpus.mkdir(parents=True)
        (corpus / 'manifest.json').write_text('{}', encoding='utf-8')

        revision = commit_path(corpus, 'snapshot(lab): 1 page stored')
        assert revision is not None

        logged = subprocess.run(
            ['git', 'log', '--oneline'], cwd=data, capture_output=True, text=True, check=True
        )
        assert 'snapshot(lab)' in logged.stdout

        untouched = subprocess.run(
            ['git', 'log', '--oneline'], cwd=tool, capture_output=True, text=True, check=False
        )
        assert 'snapshot(lab)' not in untouched.stdout


def test_commit_path_returns_none_when_nothing_moved() -> None:
    with TemporaryDirectory() as tmp:
        data = repository(Path(tmp).resolve() / 'data-repo')
        corpus = data / 'data' / 'group' / 'lab'
        corpus.mkdir(parents=True)
        (corpus / 'manifest.json').write_text('{}', encoding='utf-8')
        commit_path(corpus, 'first')
        assert commit_path(corpus, 'second') is None


def test_commit_path_refuses_outside_a_repository() -> None:
    with TemporaryDirectory() as tmp:
        loose = Path(tmp).resolve() / 'loose'
        loose.mkdir()
        if repository_root(loose) is not None:
            return
        with pytest.raises(CrawleeLabError, match='not inside a git repository'):
            commit_path(loose, 'nowhere to write')


def test_a_shuffled_table_is_a_reordering_not_a_change() -> None:
    """A pricing table that shuffles its rows rewrites the page without saying anything."""
    before = '| a | $1 |\n| b | $2 |\n| c | $3 |\n'
    after = '| b | $2 |\n| c | $3 |\n| a | $1 |\n'
    assert is_reordering(before, after)


def test_an_edited_line_is_not_a_reordering() -> None:
    before = '| a | $1 |\n| b | $2 |\n'
    after = '| a | $9 |\n| b | $2 |\n'
    assert not is_reordering(before, after)


def test_identical_text_is_not_a_reordering() -> None:
    assert not is_reordering('a\nb\n', 'a\r\nb\n')


def test_compare_marks_a_reordering_and_keeps_it_out_of_the_verdict() -> None:
    previous = manifest(one=record('https://s/one', 'aaa'))
    current = manifest(one=record('https://s/one', 'bbb'))
    report = compare(
        previous,
        current,
        {'https://s/one': 'x\ny\n'},
        {'https://s/one': 'y\nx\n'},
    )

    assert len(report.modified) == 1
    assert report.modified[0].reordered
    assert report.reordered == report.modified
    assert report.substantive == []
    assert report.changes
    assert not report.substantive
    assert summary_line(report) == '0 added, 0 removed, 0 modified, 1 reordered, 0 unchanged'


def test_a_reordering_survives_a_round_trip_through_the_report(tmp_path: Path) -> None:
    """Whatever reads the report next has to see the classification, not re-derive it."""
    previous = manifest(one=record('https://s/one', 'aaa'))
    current = manifest(one=record('https://s/one', 'bbb'))
    report = compare(previous, current, {'https://s/one': 'x\ny\n'}, {'https://s/one': 'y\nx\n'})
    save_report(report, tmp_path)

    reloaded = load_report(tmp_path)
    assert reloaded is not None
    assert reloaded.reordered and not reloaded.substantive
