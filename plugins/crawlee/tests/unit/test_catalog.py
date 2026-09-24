"""The profiles the plugin ships, and what installing a group of them does to the disk.

Loaded by path for the reason `test_plugin_paths` gives: the panel's module is not a package.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

PLUGIN = Path(__file__).resolve().parents[2] / 'main.py'


@pytest.fixture
def panel() -> ModuleType:
    spec = importlib.util.spec_from_file_location('dyarchia_crawlee_panel_catalog', PLUGIN)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_every_shipped_profile_names_itself_after_its_file(panel: ModuleType) -> None:
    shelves = panel._catalog({})
    assert {shelf['group'] for shelf in shelves} == {'docs-labs', 'salesforce-ai'}
    for shelf in shelves:
        for profile in shelf['profiles']:
            path = panel.CATALOG / shelf['group'] / f'{profile["name"]}.yaml'
            assert path.is_file()
            assert profile['description']
            assert f'group: {shelf["group"]}' in path.read_text(encoding='utf-8')


def test_installed_profiles_are_marked(panel: ModuleType) -> None:
    shelves = {shelf['group']: shelf for shelf in panel._catalog({'claude-docs': '/somewhere'})}
    marked = {p['name']: p['installed'] for p in shelves['docs-labs']['profiles']}
    assert marked['claude-docs'] is True
    assert marked['openai-docs'] is False


def test_a_new_group_gets_a_repository_named_after_it(panel: ModuleType, tmp_path: Path) -> None:
    done = panel._install('salesforce-ai', {}, str(tmp_path))
    repository = tmp_path / 'salesforce-ai'
    assert done['repository'] == str(repository)
    assert sorted(path.stem for path in (repository / 'profiles').glob('*.yaml')) == sorted(done['installed'])
    assert len(done['installed']) == len(list((panel.CATALOG / 'salesforce-ai').glob('*.yaml')))


def test_a_group_joins_the_repository_it_already_lives_in(panel: ModuleType, tmp_path: Path) -> None:
    home = tmp_path / 'crawlee-lab-data'
    (home / 'profiles').mkdir(parents=True)
    edited = home / 'profiles' / 'claude-docs.yaml'
    edited.write_text('name: claude-docs\n# edited by hand\n', encoding='utf-8')

    done = panel._install('docs-labs', {'claude-docs': str(home)}, str(tmp_path))

    assert done['repository'] == str(home)
    assert 'claude-docs' not in done['installed']
    assert edited.read_text(encoding='utf-8') == 'name: claude-docs\n# edited by hand\n'
    assert (home / 'profiles' / 'openai-docs.yaml').is_file()
    assert not (tmp_path / 'docs-labs').exists()


def test_a_group_outside_the_catalogue_is_refused(panel: ModuleType, tmp_path: Path) -> None:
    with pytest.raises(RuntimeError):
        panel._install('../tests', {}, str(tmp_path))


def test_the_cli_runs_from_the_source_that_shipped(
    panel: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv('PYTHONPATH', 'elsewhere')
    entries = panel._source_path(tmp_path).split(panel.os.pathsep)
    assert entries == [str(tmp_path / 'src'), 'elsewhere']


def test_a_round_that_reported_nothing_is_described_by_its_verdict(panel: ModuleType) -> None:
    silent = {'total': 0, 'done': 0, 'changed': 0, 'failed': 0}
    assert panel._finished_body(10, silent, 12) == 'something changed, 12 min'
    heard = {'total': 14, 'done': 14, 'changed': 3, 'failed': 0}
    assert panel._finished_body(10, heard, 12) == '14 of 14 targets, 3 changed, 12 min'
