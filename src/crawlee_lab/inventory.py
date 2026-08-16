"""What a target actually brought in, read back off its manifest.

A profile says what to fetch; the manifest says what arrived. Between the two sits the question this
module answers: which parts of a site are earning their place in the corpus, and which are bulk that
an `include` or `exclude` rule should have kept out. It reports by section rather than by page,
because pruning decisions are made a directory at a time, never a URL at a time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from crawlee_lab.config import Settings, get_settings
from crawlee_lab.versioning.manifest import load_manifest, manifest_path

UNITS = ('B', 'KB', 'MB', 'GB')


def human_bytes(size: int) -> str:
    """Render a byte count at the scale a reader can compare at a glance."""
    value = float(size)
    for unit in UNITS:
        if value < 1024 or unit == UNITS[-1]:
            return f'{size} {unit}' if unit == 'B' else f'{value:.1f} {unit}'
        value /= 1024
    return f'{size} B'


def section_of(url: str, depth: int | None = None) -> str:
    """Name the part of the site a URL belongs to.

    By default that is the path holding the page, which is the unit a filter is written against. A
    `depth` rolls the grouping up to the first N segments instead, for sites deep enough that the
    holding path is still too fine to decide on.
    """
    parsed = urlparse(url)
    segments = [segment for segment in parsed.path.split('/') if segment]
    kept = segments[:depth] if depth is not None else segments[:-1]
    return '/'.join([parsed.netloc, *kept])


@dataclass(slots=True)
class Section:
    """One part of a site, weighed by what it contributed."""

    prefix: str
    pages: int = 0
    bytes: int = 0


@dataclass(slots=True)
class PageEntry:
    """One stored page and what it cost to keep."""

    url: str
    title: str | None = None
    bytes: int = 0


@dataclass(slots=True)
class TargetInventory:
    """Everything one snapshotted target is holding."""

    name: str
    entries: list[PageEntry] = field(default_factory=list)
    failed: int = 0

    @property
    def pages(self) -> int:
        return len(self.entries)

    @property
    def bytes(self) -> int:
        return sum(entry.bytes for entry in self.entries)

    def sections(self, depth: int | None = None) -> list[Section]:
        """The target broken down by section, heaviest first, because that is what gets pruned."""
        grouped: dict[str, Section] = {}
        for entry in self.entries:
            prefix = section_of(entry.url, depth)
            section = grouped.setdefault(prefix, Section(prefix=prefix))
            section.pages += 1
            section.bytes += entry.bytes
        return sorted(grouped.values(), key=lambda section: (-section.pages, -section.bytes, section.prefix))


def _stored_bytes(directory: Path, relative: str | None) -> int:
    if not relative:
        return 0
    path = directory / relative
    return path.stat().st_size if path.is_file() else 0


def collect(name: str, settings: Settings | None = None) -> TargetInventory | None:
    """Read one target's inventory, or None when it has never been snapshotted."""
    settings = settings or get_settings()
    directory = settings.resolve(settings.data_dir) / name
    manifest = load_manifest(directory)
    if manifest is None:
        return None

    entries = [
        PageEntry(url=url, title=record.title, bytes=_stored_bytes(directory, record.path))
        for url, record in sorted(manifest.stored.items())
    ]
    return TargetInventory(name=name, entries=entries, failed=len(manifest.pages) - len(entries))


def tracked(settings: Settings | None = None) -> list[str]:
    """Every target that has a manifest on disk, named in the order they should be reported."""
    settings = settings or get_settings()
    root = settings.resolve(settings.data_dir)
    if not root.is_dir():
        return []
    return sorted(path.name for path in root.iterdir() if path.is_dir() and manifest_path(path).is_file())
