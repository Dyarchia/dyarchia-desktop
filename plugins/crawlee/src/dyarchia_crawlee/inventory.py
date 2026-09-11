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

from dyarchia_crawlee import registry
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError
from dyarchia_crawlee.versioning.manifest import load_manifest, manifest_path

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


def _group_of(name: str, settings: Settings) -> str | None:
    """The group a target's profile puts it in, when a profile of that name still exists."""
    try:
        return registry.load(name, settings).group
    except DyarchiaCrawleeError:
        return None


def directory_for(name: str, settings: Settings | None = None) -> Path:
    """Where a target's snapshot is, which its group decides and the disk confirms.

    Writing a snapshot derives the path from the profile and nothing else. Reading one has to be
    more forgiving, because a target whose profile joins a group does not take its files with it:
    the group is tried first, then the data root, then any group folder that actually holds the
    manifest. A move left half done therefore reports what is on disk rather than what should have
    been. When nothing is found the answer is where the target belongs, which is what an error
    message needs to say.
    """
    settings = settings or get_settings()
    root = settings.resolve(settings.data_dir)

    group = _group_of(name, settings)
    candidates = [root / group / name] if group else []
    candidates.append(root / name)

    for candidate in candidates:
        if manifest_path(candidate).is_file():
            return candidate

    if root.is_dir():
        for child in sorted(root.iterdir()):
            if child.is_dir() and manifest_path(child / name).is_file():
                return child / name

    return candidates[0]


def collect(name: str, settings: Settings | None = None) -> TargetInventory | None:
    """Read one target's inventory, or None when it has never been snapshotted."""
    settings = settings or get_settings()
    directory = directory_for(name, settings)
    manifest = load_manifest(directory)
    if manifest is None:
        return None

    entries = [
        PageEntry(url=url, title=record.title, bytes=_stored_bytes(directory, record.path))
        for url, record in sorted(manifest.stored.items())
    ]
    return TargetInventory(name=name, entries=entries, failed=len(manifest.pages) - len(entries))


def tracked(settings: Settings | None = None) -> list[str]:
    """Every target that has a manifest on disk, named in the order they should be reported.

    A group is a folder holding targets rather than a target itself, so the walk goes one level
    deeper wherever it finds no manifest. Grouped and ungrouped targets therefore report side by
    side, which is what a corpus part way through a move looks like.
    """
    settings = settings or get_settings()
    root = settings.resolve(settings.data_dir)
    if not root.is_dir():
        return []

    names: list[str] = []
    for path in sorted(root.iterdir()):
        if not path.is_dir():
            continue
        if manifest_path(path).is_file():
            names.append(path.name)
            continue
        names.extend(
            child.name
            for child in sorted(path.iterdir())
            if child.is_dir() and manifest_path(child).is_file()
        )
    return sorted(dict.fromkeys(names))
