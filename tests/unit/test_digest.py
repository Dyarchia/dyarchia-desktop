"""The bundle a step after the sweep reads, and what it refuses to call a change."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from euripontida_crawlee.config import Settings
from euripontida_crawlee.digest import Digest, DigestPage, DigestTarget, build, render_json, render_markdown
from euripontida_crawlee.models import PageStatus
from euripontida_crawlee.versioning.diffing import ChangeKind, ChangeReport, PageChange
from euripontida_crawlee.versioning.diffing import save_report as save_changes
from euripontida_crawlee.versioning.manifest import PageRecord, RunManifest, save_manifest
from euripontida_crawlee.watch import WATCH_RESULT


def corpus(settings: Settings, name: str, changes: list[PageChange], unchanged: int = 0) -> Path:
    """Leave behind what a snapshotted run leaves: a manifest and a change report."""
    directory = settings.data_root() / name
    directory.mkdir(parents=True, exist_ok=True)
    records = {
        change.url: PageRecord(
            url=change.url,
            status=PageStatus.OK,
            path=f'pages/{change.url.removeprefix("https://")}.md',
            title=change.title,
        )
        for change in changes
    }
    save_manifest(RunManifest(name=name, pages=records), directory)
    save_changes(ChangeReport(name=name, unchanged=unchanged, changes=changes), directory)
    return directory


def edited(url: str, title: str) -> PageChange:
    return PageChange(url=url, kind=ChangeKind.MODIFIED, title=title, diff='-old\n+new')


def shuffled(url: str, title: str) -> PageChange:
    return PageChange(url=url, kind=ChangeKind.MODIFIED, title=title, diff='-a\n+a', reordered=True)


def test_a_target_whose_pages_only_reordered_did_not_change(tmp_path: Path) -> None:
    """Three shuffled pricing tables are not news, however many bytes moved."""
    settings = Settings(data_dir=tmp_path)
    corpus(settings, 'shuffler', [shuffled('https://s/one', 'One')], unchanged=155)

    bundle = build(['shuffler'], settings)

    assert not bundle.changed
    assert bundle.headline == 'no change across 1 targets'
    assert bundle.targets[0].reordered
    assert bundle.targets[0].summary.endswith('1 reordered, 155 unchanged')


def test_a_real_edit_changes_the_target(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    corpus(settings, 'mover', [edited('https://s/one', 'One'), shuffled('https://s/two', 'Two')])

    bundle = build(['mover'], settings)

    assert [target.name for target in bundle.changed] == ['mover']
    assert len(bundle.targets[0].substantive) == 1
    assert len(bundle.targets[0].reordered) == 1


def test_the_digest_says_where_the_page_now_lives(tmp_path: Path) -> None:
    """A diff says what moved. The file says what the page now claims, which is the useful half."""
    settings = Settings(data_dir=tmp_path)
    corpus(settings, 'mover', [edited('https://s/one', 'One')])

    page = build(['mover'], settings).targets[0].pages[0]

    assert page.path == 'pages/s/one.md'


def test_a_missing_report_is_reported_rather_than_raised(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    (tmp_path / 'empty').mkdir()

    target = build(['empty'], settings).targets[0]

    assert target.error is not None
    assert not target.changed


def test_the_json_form_carries_the_verdict_and_the_diffs() -> None:
    bundle = Digest(
        targets=[
            DigestTarget(
                name='mover',
                directory=Path('/corpus/mover'),
                pages=[
                    DigestPage(url='https://s/one', kind='modified', diff='-old\n+new'),
                    DigestPage(url='https://s/two', kind='modified', reordered=True),
                ],
            )
        ]
    )
    data = json.loads(render_json(bundle))

    assert data['changed'] == ['mover']
    assert data['targets'][0]['pages'][0]['diff'] == '-old\n+new'
    assert data['targets'][0]['pages'][1]['reordered'] is True


def test_the_markdown_form_lists_reorderings_without_counting_them() -> None:
    bundle = Digest(
        targets=[
            DigestTarget(
                name='shuffler',
                directory=Path('/corpus/shuffler'),
                pages=[DigestPage(url='https://s/one', kind='modified', reordered=True)],
            )
        ]
    )
    rendered = render_markdown(bundle)

    assert 'no change across 1 targets' in rendered
    assert 'Reordered only (1)' in rendered


def sweep(settings: Settings, started: str, names: list[str], group: str | None = None) -> Path:
    """Leave the sweep report a run writes beside the corpora it covered."""
    directory = settings.data_root(group)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / WATCH_RESULT
    path.write_text(
        json.dumps({'started_at': started, 'targets': [{'name': n} for n in names]}),
        encoding='utf-8',
    )
    return path


def test_a_report_older_than_the_sweep_is_not_this_week_s_news(tmp_path: Path) -> None:
    """A run that finds nothing writes nothing, so the report on disk can be weeks old.

    Reading it back as the latest run is how a target that did not change reaches the next step as
    if it had. It happened: a target was handed to the follow-up with 105 pages of change from a
    sweep three days earlier.
    """
    settings = Settings(data_dir=tmp_path)
    directory = corpus(settings, 'quiet', [edited('https://s/one', 'One')])
    old = ChangeReport(name='quiet', generated_at=datetime(2026, 8, 28, tzinfo=UTC))
    old.changes = [edited('https://s/one', 'One')]
    save_changes(old, directory)
    sweep(settings, '2026-08-30T22:58:26+00:00', ['quiet'])

    target = build(['quiet'], settings).targets[0]

    assert target.stale
    assert not target.changed
    assert target.pages == []
    assert 'no change in the sweep of' in target.summary


def test_a_report_written_by_the_sweep_is_current(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    directory = corpus(settings, 'mover', [])
    fresh = ChangeReport(name='mover', generated_at=datetime(2026, 8, 30, 23, 6, tzinfo=UTC))
    fresh.changes = [edited('https://s/one', 'One')]
    save_changes(fresh, directory)
    sweep(settings, '2026-08-30T22:58:26+00:00', ['mover'])

    target = build(['mover'], settings).targets[0]

    assert not target.stale
    assert target.changed
    assert len(target.pages) == 1


def test_without_a_sweep_report_nothing_is_called_stale(tmp_path: Path) -> None:
    """`digest` is usable on a corpus no sweep ever covered; it just cannot check currency."""
    settings = Settings(data_dir=tmp_path)
    corpus(settings, 'lonely', [edited('https://s/one', 'One')])

    target = build(['lonely'], settings).targets[0]

    assert not target.stale
    assert target.changed


def capped_target(name: str, modified: int, reordered: int = 0, failed: int = 0) -> DigestTarget:
    return DigestTarget(
        name=name,
        directory=Path(f'/corpus/{name}'),
        pages=[DigestPage(url=f'https://s/m{i}', kind='modified') for i in range(modified)]
        + [DigestPage(url=f'https://s/r{i}', kind='modified', reordered=True) for i in range(reordered)],
        failed=[f'https://s/f{i}' for i in range(failed)],
    )


def test_a_digest_that_fits_says_nothing_about_a_limit() -> None:
    """A warning about a cap that was never reached is noise on every quiet week."""
    rendered = render_markdown(Digest(targets=[capped_target('small', modified=3)]), limit=50)

    assert 'is a sample' not in rendered
    assert '... and' not in rendered


def test_a_digest_that_was_cut_says_so_before_the_first_section() -> None:
    """The framing sentence promised every page, and the first cut is thousands of lines down.

    Two weekly reviews covered a third of their sweep and reported it as the whole sweep, because
    the reader met the promise at the top and the contradiction far below it.
    """
    rendered = render_markdown(Digest(targets=[capped_target('big', modified=120)]), limit=50)

    warning = rendered.index('is a sample')
    assert warning < rendered.index('## big')
    assert 'Modified (120)' in rendered
    assert '- ... and 70 more' in rendered
    assert 'CHANGES.md' in rendered


def test_the_quiet_sections_admit_their_cut_too() -> None:
    """Reordered and failed used to stop at the limit and say nothing at all."""
    bundle = Digest(targets=[capped_target('noisy', modified=0, reordered=60, failed=70)])
    rendered = render_markdown(bundle, limit=50)

    assert '- ... and 10 more' in rendered
    assert '- ... and 20 more' in rendered


def test_one_capped_target_warns_for_the_whole_document() -> None:
    bundle = Digest(targets=[capped_target('small', modified=2), capped_target('big', modified=80)])
    rendered = render_markdown(bundle, limit=50)

    assert rendered.count('is a sample') == 1
