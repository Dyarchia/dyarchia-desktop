"""The bundle a step after the sweep reads, and what it refuses to call a change."""

from __future__ import annotations

import json
from pathlib import Path

from crawlee_lab.config import Settings
from crawlee_lab.digest import Digest, DigestPage, DigestTarget, build, render_json, render_markdown
from crawlee_lab.models import PageStatus
from crawlee_lab.versioning.diffing import ChangeKind, ChangeReport, PageChange
from crawlee_lab.versioning.diffing import save_report as save_changes
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, save_manifest


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
