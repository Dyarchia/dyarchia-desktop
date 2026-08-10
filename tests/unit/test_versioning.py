"""Hashing, manifests and change reports."""

from __future__ import annotations

from pathlib import Path

from crawlee_lab.models import PageStatus
from crawlee_lab.versioning.diffing import ChangeKind, compare, load_report, save_report
from crawlee_lab.versioning.hashing import content_hash, normalise
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest
from crawlee_lab.versioning.report import render_markdown, summary_line


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
    assert not report.has_changes
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
