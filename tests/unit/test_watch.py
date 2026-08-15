"""The sweep's verdict, which is what a scheduler acts on."""

from __future__ import annotations

from crawlee_lab.watch import (
    EXIT_CHANGES,
    EXIT_FAILED,
    EXIT_NO_CHANGES,
    WatchEntry,
    WatchResult,
    render_markdown,
)


def quiet(name: str) -> WatchEntry:
    return WatchEntry(name=name, summary='0 added, 0 removed, 0 modified, 40 unchanged', pages=40)


def moved(name: str) -> WatchEntry:
    return WatchEntry(name=name, summary='1 added, 0 removed, 2 modified', pages=40, added=1, modified=2)


def broke(name: str) -> WatchEntry:
    return WatchEntry(name=name, error='the target refused every request')


def test_an_unchanged_sweep_says_nothing_happened() -> None:
    result = WatchResult(entries=[quiet('a'), quiet('b')])
    assert result.exit_code == EXIT_NO_CHANGES
    assert result.headline == 'no change across 2 targets'


def test_a_changed_target_raises_the_exit_code() -> None:
    result = WatchResult(entries=[quiet('a'), moved('b')])
    assert result.exit_code == EXIT_CHANGES
    assert 'b' in result.headline


def test_a_failure_outranks_a_change() -> None:
    """A target that did not answer may be hiding a change, so the sweep cannot report success."""
    result = WatchResult(entries=[moved('a'), broke('b')])
    assert result.exit_code == EXIT_FAILED
    assert 'failed' in result.headline


def test_a_first_snapshot_is_not_a_change() -> None:
    """There is nothing yet for it to differ from, so it must not wake anybody up."""
    entry = WatchEntry(
        name='new', summary='first snapshot: 40 pages stored', pages=40, added=40, first_run=True
    )
    result = WatchResult(entries=[entry])
    assert entry.changed is False
    assert result.exit_code == EXIT_NO_CHANGES


def test_the_document_names_what_moved_and_how_to_look() -> None:
    document = render_markdown(WatchResult(entries=[quiet('a'), moved('b')]))
    assert '# Watch report' in document
    assert 'crawlee-lab diff b --unified' in document
    assert 'crawlee-lab diff a' not in document
