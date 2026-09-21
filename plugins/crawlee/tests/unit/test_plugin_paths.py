"""What an installed copy of the plugin tells the toolkit about where the corpora are.

The panel's own module is not importable as a package: it sits beside `pyproject.toml` because the
shell runs it by path. Loading it here by path is what lets the one function that answers this
question be tested at all, and it imports nothing but the standard library.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest

PLUGIN = Path(__file__).resolve().parents[2] / 'main.py'


def _plugin() -> ModuleType:
    spec = importlib.util.spec_from_file_location('dyarchia_crawlee_panel', PLUGIN)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def panel() -> ModuleType:
    return _plugin()


@pytest.fixture
def corpora(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """An installation, and the folder its corpus repositories go in when nothing says otherwise.

    None of the toolkit's own variables are answered yet: what a machine already carries is kept,
    and a test inheriting the developer's own environment would be testing that instead.
    """
    for name in (
        'DYARCHIA_CRAWLEE_REPOSITORIES_DIR',
        'DYARCHIA_CRAWLEE_DATA_DIR',
        'DYARCHIA_CRAWLEE_PROFILES_DIR',
        'DYARCHIA_CRAWLEE_OUTPUT_DIR',
        'DYARCHIA_CRAWLEE_INDEX_DIR',
        'DYARCHIA_CRAWLEE_STORAGE_DIR',
    ):
        monkeypatch.delenv(name, raising=False)

    monkeypatch.setenv('DYARCHIA_DATA_HOME', str(tmp_path / 'data'))
    monkeypatch.setenv('DYARCHIA_USER_DATA', str(tmp_path / 'state'))
    return tmp_path / 'data' / 'crawlee'


def _repository(root: Path) -> Path:
    (root / 'profiles').mkdir(parents=True)
    return root


def test_a_checkout_is_left_alone(panel: ModuleType, corpora: Path, tmp_path: Path) -> None:
    checkout = tmp_path / 'checkout'
    checkout.mkdir()
    (checkout / '.env').write_text('DYARCHIA_CRAWLEE_DATA_DIR=somewhere\n', encoding='utf-8')

    assert panel._installed_paths(checkout) == {}


def test_a_machine_holding_no_corpus_gets_local(panel: ModuleType, corpora: Path, tmp_path: Path) -> None:
    settings = panel._installed_paths(tmp_path / 'app')

    assert settings['DYARCHIA_CRAWLEE_REPOSITORIES_DIR'] == str(corpora)
    assert settings['DYARCHIA_CRAWLEE_DATA_DIR'] == str(corpora / 'local' / 'data')
    assert Path(settings['DYARCHIA_CRAWLEE_PROFILES_DIR']).is_dir()


def test_an_existing_repository_is_preferred_over_a_new_local(
    panel: ModuleType, corpora: Path, tmp_path: Path
) -> None:
    corpus = _repository(corpora / 'crawlee-lab-data')

    settings = panel._installed_paths(tmp_path / 'app')

    assert settings['DYARCHIA_CRAWLEE_DATA_DIR'] == str(corpus / 'data')
    assert not (corpora / 'local').exists()


def test_the_first_repository_in_order_is_the_fallback(
    panel: ModuleType, corpora: Path, tmp_path: Path
) -> None:
    _repository(corpora / 'crawlee-salesforce-data')
    first = _repository(corpora / 'crawlee-lab-data')

    settings = panel._installed_paths(tmp_path / 'app')

    assert settings['DYARCHIA_CRAWLEE_OUTPUT_DIR'] == str(first / 'output')


def test_a_named_repositories_directory_still_gets_a_fallback(
    panel: ModuleType, corpora: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The defect this file exists for.

    Naming the repositories directory used to skip the three variables below it, which left them
    resolving against the toolkit's own directory — inside the application — and the panel reported
    no corpora on a machine whose repositories directory was right.
    """
    elsewhere = tmp_path / 'elsewhere'
    corpus = _repository(elsewhere / 'crawlee-lab-data')
    monkeypatch.setenv('DYARCHIA_CRAWLEE_REPOSITORIES_DIR', str(elsewhere))

    settings = panel._installed_paths(tmp_path / 'app')

    assert 'DYARCHIA_CRAWLEE_REPOSITORIES_DIR' not in settings
    assert settings['DYARCHIA_CRAWLEE_DATA_DIR'] == str(corpus / 'data')
    assert settings['DYARCHIA_CRAWLEE_PROFILES_DIR'] == str(corpus / 'profiles')
    assert settings['DYARCHIA_CRAWLEE_OUTPUT_DIR'] == str(corpus / 'output')


def test_a_value_the_environment_carries_is_kept(
    panel: ModuleType, corpora: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv('DYARCHIA_CRAWLEE_OUTPUT_DIR', str(tmp_path / 'chosen'))

    settings = panel._installed_paths(tmp_path / 'app')

    assert 'DYARCHIA_CRAWLEE_OUTPUT_DIR' not in settings
