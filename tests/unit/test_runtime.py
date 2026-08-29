"""The working directory a run gets, which is what keeps two runs out of each other's queue."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from crawlee_lab.config import Settings
from crawlee_lab.runtime import STORAGE_ENV, use_private_storage


def test_a_run_gets_a_working_directory_of_its_own(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Two crawls from one checkout shared a request queue, and silently traded pages."""
    monkeypatch.delenv(STORAGE_ENV, raising=False)

    directory = use_private_storage(tmp_path)

    assert directory == tmp_path / f'run-{os.getpid()}'
    assert os.environ[STORAGE_ENV] == str(directory)


def test_a_configured_working_directory_is_left_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Whoever set it has said where the directory goes, including sharing one on purpose."""
    monkeypatch.setenv(STORAGE_ENV, str(tmp_path / 'shared'))

    assert use_private_storage(tmp_path) == tmp_path / 'shared'
    assert os.environ[STORAGE_ENV] == str(tmp_path / 'shared')


def test_the_working_directory_root_can_leave_the_checkout(tmp_path: Path) -> None:
    """Scratch is not the tool, so it does not have to sit in the tool's checkout."""
    settings = Settings(storage_dir=tmp_path / 'scratch')

    assert settings.storage_root() == tmp_path / 'scratch'


def test_the_working_directory_root_defaults_under_the_project() -> None:
    """A fresh clone with no .env still gets a working directory without being told."""
    settings = Settings(_env_file=None)

    assert settings.storage_root() == settings.project_root / 'storage'
