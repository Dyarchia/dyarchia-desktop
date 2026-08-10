"""Snapshot writing, including the guards that stop a bad run from corrupting the history."""

from __future__ import annotations

import pytest

from crawlee_lab.config import Settings
from crawlee_lab.errors import RunAbortedError
from crawlee_lab.models import FailureRecord, RunSpec, ScrapedItem
from crawlee_lab.storage.snapshots import take_snapshot

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


def test_an_unchanged_rerun_writes_nothing(settings: Settings) -> None:
    items = [item('a', 'Alpha')]
    take_snapshot(items, [], snapshot_spec(), settings, 1.0)
    second = take_snapshot(items, [], snapshot_spec(), settings, 1.0)

    assert second.written == []
    assert second.persisted is False
    assert not second.report.has_changes


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


def test_items_without_content_are_not_stored(settings: Settings) -> None:
    empty = ScrapedItem(url=f'{BASE}a', content=None)
    result = take_snapshot([empty], [], snapshot_spec(), settings, 1.0)

    assert result.written == []
    assert result.manifest.pages == {}
