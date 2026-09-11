"""Snapshot writing, including the guards that stop a bad run from corrupting the history."""

from __future__ import annotations

import pytest

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.errors import RunAbortedError
from dyarchia_crawlee.models import FailureRecord, RunSpec, ScrapedItem
from dyarchia_crawlee.storage.snapshots import churn_warnings, take_snapshot
from dyarchia_crawlee.versioning.diffing import ChangeKind, ChangeReport, PageChange

BASE = 'https://site.example/docs/'


def item(slug: str, content: str) -> ScrapedItem:
    return ScrapedItem(url=f'{BASE}{slug}', title=slug, content=content)


def snapshot_spec(**overrides: object) -> RunSpec:
    return RunSpec(name='demo', start_urls=[BASE], snapshot=True, **overrides)  # type: ignore[arg-type]


def test_first_snapshot_writes_the_tree(settings: Settings) -> None:
    result = take_snapshot([item('a', 'Alpha'), item('b', 'Beta')], [], snapshot_spec(), settings, 1.0)

    assert result.report.is_first_run
    assert len(result.written) == 2
    assert (result.directory / 'pages' / 'site.example' / 'docs' / 'a.md').read_text() == 'Alpha\n'
    assert (result.directory / 'manifest.json').is_file()
    assert (result.directory / 'CHANGES.md').is_file()


def test_a_group_nests_the_target_inside_it(settings: Settings) -> None:
    """A grouped target keeps its own name; the group is the folder it sits in."""
    result = take_snapshot([item('a', 'Alpha')], [], snapshot_spec(group='docs-labs'), settings, 1.0)

    assert result.directory == settings.resolve(settings.data_dir) / 'docs-labs' / 'demo'
    assert (result.directory / 'manifest.json').is_file()


def test_an_unchanged_rerun_writes_nothing(settings: Settings) -> None:
    items = [item('a', 'Alpha')]
    take_snapshot(items, [], snapshot_spec(), settings, 1.0)
    second = take_snapshot(items, [], snapshot_spec(), settings, 1.0)

    assert second.written == []
    assert second.persisted is False
    assert not second.report.changes


def test_a_changed_page_is_rewritten_and_reported(settings: Settings) -> None:
    take_snapshot([item('a', 'Alpha')], [], snapshot_spec(), settings, 1.0)
    second = take_snapshot([item('a', 'Alpha revised')], [], snapshot_spec(), settings, 1.0)

    assert second.persisted
    assert len(second.report.modified) == 1
    diff = second.report.modified[0].diff
    assert diff is not None
    assert '+Alpha revised' in diff


def test_a_vanished_page_is_deleted_from_the_tree(settings: Settings) -> None:
    take_snapshot([item('a', 'Alpha'), item('b', 'Beta')], [], snapshot_spec(), settings, 1.0)
    second = take_snapshot([item('a', 'Alpha')], [], snapshot_spec(), settings, 1.0)

    assert len(second.deleted) == 1
    assert not (second.directory / 'pages' / 'site.example' / 'docs' / 'b.md').exists()


def test_a_failed_page_keeps_its_stored_content(settings: Settings) -> None:
    take_snapshot([item('a', 'Alpha'), item('b', 'Beta')], [], snapshot_spec(), settings, 1.0)
    failure = FailureRecord(url=f'{BASE}b', error='HttpStatusCodeError: 503')
    second = take_snapshot(
        [item('a', 'Alpha')], [failure], snapshot_spec(min_success_rate=0.5), settings, 0.5
    )

    assert second.deleted == []
    assert (second.directory / 'pages' / 'site.example' / 'docs' / 'b.md').is_file()
    assert second.report.removed == []


def test_a_run_below_the_threshold_writes_nothing(settings: Settings) -> None:
    with pytest.raises(RunAbortedError, match='below the'):
        take_snapshot([item('a', 'Alpha')], [], snapshot_spec(min_success_rate=0.9), settings, 0.4)

    assert not (settings.resolve(settings.data_dir) / 'demo').exists()


def test_the_fetch_suffix_is_stripped_from_stored_urls(settings: Settings) -> None:
    fetched = ScrapedItem(url=f'{BASE}a.md', content='Alpha')
    result = take_snapshot([fetched], [], snapshot_spec(fetch_suffix='.md'), settings, 1.0)

    assert f'{BASE}a' in result.manifest.pages
    assert (result.directory / 'pages' / 'site.example' / 'docs' / 'a.md').is_file()


def test_a_run_that_reached_far_fewer_pages_writes_nothing(settings: Settings) -> None:
    """A capped or mis-filtered run downloads everything it asked for and would delete the rest."""
    full = [item(str(index), f'Body {index}') for index in range(10)]
    take_snapshot(full, [], snapshot_spec(), settings, 1.0)

    with pytest.raises(RunAbortedError, match='coverage'):
        take_snapshot(full[:2], [], snapshot_spec(max_pages=2), settings, 1.0)

    assert len(list((settings.resolve(settings.data_dir) / 'demo' / 'pages').rglob('*.md'))) == 10


def test_the_coverage_message_names_the_page_limit(settings: Settings) -> None:
    full = [item(str(index), f'Body {index}') for index in range(10)]
    take_snapshot(full, [], snapshot_spec(), settings, 1.0)

    with pytest.raises(RunAbortedError, match='capped at 2 pages'):
        take_snapshot(full[:2], [], snapshot_spec(max_pages=2), settings, 1.0)


def test_a_modest_shrink_is_allowed_through(settings: Settings) -> None:
    full = [item(str(index), f'Body {index}') for index in range(10)]
    take_snapshot(full, [], snapshot_spec(), settings, 1.0)
    result = take_snapshot(full[:8], [], snapshot_spec(), settings, 1.0)

    assert len(result.report.removed) == 2


def test_a_deliberate_shrink_can_be_permitted(settings: Settings) -> None:
    full = [item(str(index), f'Body {index}') for index in range(10)]
    take_snapshot(full, [], snapshot_spec(), settings, 1.0)
    result = take_snapshot(full[:1], [], snapshot_spec(min_coverage=0.0), settings, 1.0)

    assert len(result.report.removed) == 9


def test_the_first_snapshot_has_no_coverage_to_compare(settings: Settings) -> None:
    result = take_snapshot([item('a', 'Alpha')], [], snapshot_spec(max_pages=1), settings, 1.0)
    assert result.report.is_first_run


def test_items_without_content_are_not_stored(settings: Settings) -> None:
    empty = ScrapedItem(url=f'{BASE}a', content=None)
    result = take_snapshot([empty], [], snapshot_spec(), settings, 1.0)

    assert result.written == []
    assert result.manifest.pages == {}


def report_with(modified: int, unchanged: int, removed: int = 0) -> ChangeReport:
    changes = [
        PageChange(kind=ChangeKind.MODIFIED, url=f'https://site.example/m{index}')
        for index in range(modified)
    ]
    changes += [
        PageChange(kind=ChangeKind.REMOVED, url=f'https://site.example/r{index}') for index in range(removed)
    ]
    return ChangeReport(name='target', unchanged=unchanged, changes=changes)


def test_a_handful_of_edits_says_nothing() -> None:
    assert churn_warnings(report_with(modified=5, unchanged=200)) == []


def test_most_of_the_corpus_moving_at_once_is_worth_saying_out_loud() -> None:
    """The case that took a human eye to catch: 552 of 566 pages modified in four days."""
    warnings = churn_warnings(report_with(modified=552, unchanged=0, removed=1))

    assert len(warnings) == 1
    assert '100%' in warnings[0]
    assert 'format change' in warnings[0]


def test_a_first_snapshot_cannot_churn() -> None:
    report = ChangeReport(name='target', is_first_run=True)
    assert churn_warnings(report) == []


def test_a_run_with_nothing_to_compare_says_nothing() -> None:
    assert churn_warnings(report_with(modified=0, unchanged=0)) == []
