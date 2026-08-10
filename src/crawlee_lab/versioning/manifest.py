"""The per-target record of what was fetched, when, and what it hashed to.

The manifest is what lets a run tell a page that disappeared apart from a page that merely failed to
download. Without it a bad network day would read as a mass deletion.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from crawlee_lab.models import PageStatus, utcnow

MANIFEST_FILENAME = 'manifest.json'
MANIFEST_VERSION = 1


class PageRecord(BaseModel):
    """The outcome for a single page in a single run."""

    model_config = ConfigDict(extra='ignore')

    url: str
    status: PageStatus
    fetched_at: datetime = Field(default_factory=utcnow)
    sha256: str | None = None
    path: str | None = None
    title: str | None = None
    error: str | None = None


class RunManifest(BaseModel):
    """Every page a run touched, keyed by its canonical URL."""

    model_config = ConfigDict(extra='ignore')

    name: str
    version: int = MANIFEST_VERSION
    created_at: datetime = Field(default_factory=utcnow)
    success_rate: float = 1.0
    pages: dict[str, PageRecord] = Field(default_factory=dict)

    @property
    def stored(self) -> dict[str, PageRecord]:
        """Only the pages that actually produced content, which are the ones worth comparing."""
        return {url: record for url, record in self.pages.items() if record.status is PageStatus.OK}


def manifest_path(directory: Path) -> Path:
    return directory / MANIFEST_FILENAME


def load_manifest(directory: Path) -> RunManifest | None:
    """Read the previous run's manifest, or None when this target has never been snapshotted."""
    path = manifest_path(directory)
    if not path.is_file():
        return None
    try:
        return RunManifest.model_validate_json(path.read_text(encoding='utf-8'))
    except ValueError:
        return None


def save_manifest(manifest: RunManifest, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = manifest_path(directory)
    payload = manifest.model_dump(mode='json')
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True), encoding='utf-8')
    return path
