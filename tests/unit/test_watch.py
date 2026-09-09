"""The sweep's verdict, which is what a scheduler acts on."""

from __future__ import annotations

import json
from pathlib import Path

from euripontida_crawlee.config import Settings
from euripontida_crawlee.watch import (
    EXIT_CHANGES,
    EXIT_FAILED,
    EXIT_NO_CHANGES,
    WATCH_RESULT,
    WatchEntry,
    WatchResult,
    render_markdown,
    save_report,
    watchable,
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
    assert 'euripontida-crawlee diff b --unified' in document
    assert 'euripontida-crawlee diff a' not in document


def in_group(entry: WatchEntry, group: str | None) -> WatchEntry:
    entry.group = group
    return entry


def test_a_sweep_of_one_group_files_its_report_inside_it(settings: Settings) -> None:
    """Two scheduled rounds would otherwise each overwrite the other's account of its week."""
    result = WatchResult(entries=[in_group(quiet('a'), 'docs-labs'), in_group(moved('b'), 'docs-labs')])

    document = save_report(result, settings)

    assert document == settings.resolve(settings.data_dir) / 'docs-labs' / 'WATCH.md'


def test_a_sweep_that_crossed_groups_files_its_report_at_the_root(settings: Settings) -> None:
    """No one group holds all of what it found, so no one group can claim the report."""
    result = WatchResult(entries=[in_group(quiet('a'), 'docs-labs'), in_group(quiet('b'), None)])

    document = save_report(result, settings)

    assert document == settings.resolve(settings.data_dir) / 'WATCH.md'


def watched_profile(settings: Settings, name: str, group: str | None = None, snapshot: bool = True) -> Path:
    directory = settings.resolve(settings.profiles_dir)
    directory.mkdir(parents=True, exist_ok=True)
    body = f"""
start_urls:
  - https://site.example/
snapshot: {str(snapshot).lower()}
"""
    if group:
        body += f'group: {group}'
    path = directory / f'{name}.yaml'
    path.write_text(body, encoding='utf-8')
    return path


def test_a_group_sweeps_only_its_own_corpus(settings: Settings) -> None:
    """A round must not quietly adopt every target added to the machine since it was scheduled."""
    watched_profile(settings, 'claude-docs', group='docs-labs')
    watched_profile(settings, 'openai-docs', group='docs-labs')
    watched_profile(settings, 'some-other-lab', group='docs-china')

    assert watchable(settings, 'docs-labs') == ['claude-docs', 'openai-docs']
    assert watchable(settings, 'docs-china') == ['some-other-lab']
    assert watchable(settings) == ['claude-docs', 'openai-docs', 'some-other-lab']


def test_a_profile_that_does_not_ask_for_snapshots_is_not_swept_by_its_group(settings: Settings) -> None:
    watched_profile(settings, 'tracked', group='docs-labs')
    watched_profile(settings, 'untracked', group='docs-labs', snapshot=False)

    assert watchable(settings, 'docs-labs') == ['tracked']


def shuffled(name: str) -> WatchEntry:
    """A target whose only modification was a page reordering itself."""
    return WatchEntry(
        name=name,
        summary='0 added, 0 removed, 0 modified, 3 reordered, 155 unchanged',
        pages=158,
        reordered=3,
    )


def test_a_reordering_is_not_a_change() -> None:
    """Three shuffled tables woke a desktop notification and told nobody anything."""
    result = WatchResult(entries=[quiet('a'), shuffled('b')])

    assert not shuffled('b').changed
    assert result.exit_code == EXIT_NO_CHANGES
    assert result.headline == 'no change across 2 targets'


def test_the_sweep_serialises_what_comes_after_it() -> None:
    """A step that has to parse the markdown report to find the verdict is built on prose."""
    result = WatchResult(entries=[quiet('a'), moved('b'), shuffled('c')])
    data = result.to_dict()

    assert data['exit_code'] == EXIT_CHANGES
    assert data['changed'] == ['b']
    assert data['failed'] == []
    assert [target['name'] for target in data['targets']] == ['a', 'b', 'c']
    assert data['targets'][2]['reordered'] == 3
    assert data['targets'][2]['changed'] is False


def test_the_sweep_writes_its_result_beside_the_report(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    result = WatchResult(entries=[moved('b')])
    save_report(result, settings)

    written = json.loads((tmp_path / WATCH_RESULT).read_text(encoding='utf-8'))
    assert written['changed'] == ['b']
    assert written['exit_code'] == EXIT_CHANGES


def test_the_packaged_example_does_not_enrol_itself(tmp_path: Path) -> None:
    """It ships with the package, so it is present in every corpus repository.

    One that asked to be snapshotted would join every unattended round on the machine: a repository
    tracking Salesforce documentation would find it in its weekly sweep and start building a Claude
    corpus nobody asked for.
    """
    empty = tmp_path / 'profiles'
    empty.mkdir()
    settings = Settings(data_dir=tmp_path / 'data', profiles_dir=empty)

    assert watchable(settings) == []
