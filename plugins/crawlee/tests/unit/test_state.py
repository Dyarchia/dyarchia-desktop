"""The one answer a front end reads, so it never has to rediscover the conventions itself."""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.models import PageStatus
from dyarchia_crawlee.state import build, render_json
from dyarchia_crawlee.versioning.diffing import ChangeKind, ChangeReport, PageChange
from dyarchia_crawlee.versioning.diffing import save_report as save_changes
from dyarchia_crawlee.versioning.manifest import PageRecord, RunManifest, save_manifest
from dyarchia_crawlee.watch import WATCH_RESULT


def repository(root: Path, name: str, group: str, pages: dict[str, str]) -> Path:
    """Build a corpus repository the way the split left one: data, profiles, output."""
    directory = root / 'data' / group / name
    records: dict[str, PageRecord] = {}
    for url, body in pages.items():
        relative = f'pages/{url.removeprefix("https://")}.md'
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        records[url] = PageRecord(url=url, status=PageStatus.OK, path=relative, title=url)
    save_manifest(RunManifest(name=name, pages=records), directory)

    profiles = root / 'profiles'
    profiles.mkdir(parents=True, exist_ok=True)
    (profiles / f'{name}.yaml').write_text(
        f'name: {name}\ngroup: {group}\nstart_urls:\n  - https://s/one\nsnapshot: true\n',
        encoding='utf-8',
    )
    return directory


def test_state_reads_a_repository_it_was_pointed_at(tmp_path: Path) -> None:
    root = tmp_path / 'corpus-repo'
    repository(root, 'alpha', 'a-group', {'https://s/one': 'one\n', 'https://s/two': 'two\n'})

    snapshot = build([root])

    assert len(snapshot.repositories) == 1
    corpus = snapshot.repositories[0].corpora[0]
    assert corpus.name == 'alpha'
    assert corpus.group == 'a-group'
    assert corpus.pages == 2
    assert corpus.bytes > 0


def test_state_aggregates_several_repositories(tmp_path: Path) -> None:
    """A machine that keeps two unrelated corpora apart still wants one answer about both."""
    first = tmp_path / 'one'
    second = tmp_path / 'two'
    repository(first, 'alpha', 'a-group', {'https://s/one': 'one\n'})
    repository(second, 'beta', 'b-group', {'https://s/two': 'two\n'})

    snapshot = build([first, second])

    assert [r.root.name for r in snapshot.repositories] == ['one', 'two']
    assert sorted(c.name for c in snapshot.corpora) == ['alpha', 'beta']
    assert snapshot.headline.startswith('2 corpora')


def test_state_carries_the_currency_rule(tmp_path: Path) -> None:
    """A corpus whose report predates the sweep is not reported as changed, here either."""
    root = tmp_path / 'corpus-repo'
    directory = repository(root, 'alpha', 'a-group', {'https://s/one': 'one\n'})
    old = ChangeReport(name='alpha', generated_at=datetime(2026, 8, 28, tzinfo=UTC))
    old.changes = [PageChange(url='https://s/one', kind=ChangeKind.MODIFIED, diff='-a\n+b')]
    save_changes(old, directory)
    (root / 'data' / 'a-group' / WATCH_RESULT).write_text(
        json.dumps({'started_at': '2026-08-30T22:58:26+00:00', 'targets': [{'name': 'alpha'}]}),
        encoding='utf-8',
    )

    corpus = build([root]).repositories[0].corpora[0]

    assert corpus.stale
    assert not corpus.changed
    assert corpus.modified == 0


def test_state_reports_whether_the_corpora_are_versioned(tmp_path: Path) -> None:
    root = tmp_path / 'corpus-repo'
    repository(root, 'alpha', 'a-group', {'https://s/one': 'one\n'})

    loose = build([root]).repositories[0]
    assert not loose.versioned
    assert loose.head is None

    subprocess.run(['git', 'init', '-q'], cwd=root, check=True, capture_output=True)
    tracked = build([root]).repositories[0]
    assert tracked.versioned
    assert tracked.dirty


def test_the_json_form_names_every_root_a_caller_needs(tmp_path: Path) -> None:
    """A front end is given the paths rather than left to derive them from the convention."""
    root = tmp_path / 'corpus-repo'
    repository(root, 'alpha', 'a-group', {'https://s/one': 'one\n'})

    data = json.loads(render_json(build([root])))
    repo = data['repositories'][0]

    assert Path(repo['data']) == (root / 'data').resolve()
    assert Path(repo['profiles']) == (root / 'profiles').resolve()
    assert Path(repo['output']) == (root / 'output').resolve()
    assert data['repositories'][0]['corpora'][0]['name'] == 'alpha'


def test_the_default_is_the_repository_the_settings_name(tmp_path: Path) -> None:
    root = tmp_path / 'corpus-repo'
    repository(root, 'alpha', 'a-group', {'https://s/one': 'one\n'})
    settings = Settings.for_repository(root)

    snapshot = build(settings=settings)

    assert [c.name for c in snapshot.corpora] == ['alpha']


def test_the_state_says_which_folder_it_read(settings: Settings, tmp_path: Path) -> None:
    """The one fact the panel cannot deduce from the rest of the payload.

    A repositories directory that holds nothing hides every corpus but the fallback, and a state
    that does not name it reports the smaller number as confidently as the true one.
    """
    corpora = tmp_path / 'corpora'
    named = settings.model_copy(update={'repositories_dir': corpora})

    payload = build(settings=named).to_dict()

    assert payload['folder'] == str(corpora)


def test_a_machine_that_names_no_folder_says_so(settings: Settings) -> None:
    assert build(settings=settings).to_dict()['folder'] is None
