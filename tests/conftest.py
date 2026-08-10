"""Shared fixtures."""

from __future__ import annotations

from pathlib import Path

import pytest

from crawlee_lab.config import Settings
from crawlee_lab.models import RunSpec

FIXTURES = Path(__file__).parent / 'fixtures'


@pytest.fixture
def catalogue_html() -> str:
    return (FIXTURES / 'catalogue.html').read_text(encoding='utf-8')


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings pointed entirely at a temporary directory, so tests never touch the real project."""
    return Settings(
        data_dir=tmp_path / 'data',
        output_dir=tmp_path / 'output',
        profiles_dir=tmp_path / 'profiles',
    )


@pytest.fixture
def spec() -> RunSpec:
    return RunSpec(name='test-run', start_urls=['https://example.com/'])
