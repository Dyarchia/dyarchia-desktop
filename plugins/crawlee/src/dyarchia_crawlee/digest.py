"""The bundle a step after the sweep reads.

`watch` answers whether anything moved, through its exit code and its report. What comes after it
needs more than that: which pages changed, what the change was, and where the page now sits so it
can be read in full rather than inferred from a diff. This module assembles exactly that, and stops
there. Nothing here calls a model or knows one exists; it produces the material and gets out of the
way, which is what keeps the toolkit from acquiring a provider, a key and an opinion.

Reorderings are carried but never counted. A page whose lines only moved is listed so nobody has to
wonder where it went, and excluded from the verdict so it wakes nothing.

Neither is a change report older than the sweep that just ran. A run that finds nothing rewrites
nothing, by design, so the report left on disk is the last one that found something -- which may be
weeks old. Reading it back as if it described the latest run is how a target that did not change
gets handed to the next step as if it had.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from dyarchia_crawlee import inventory, registry
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError
from dyarchia_crawlee.models import utcnow
from dyarchia_crawlee.storage.snapshots import CHANGES_DOCUMENT
from dyarchia_crawlee.versioning.diffing import ChangeKind, load_report
from dyarchia_crawlee.versioning.manifest import load_manifest
from dyarchia_crawlee.watch import WATCH_RESULT, watchable


@dataclass(slots=True)
class DigestPage:
    """One changed page, with the diff and the file the change landed in."""

    url: str
    kind: str
    title: str | None = None
    reordered: bool = False
    path: str | None = None
    diff: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'url': self.url,
            'kind': self.kind,
            'title': self.title,
            'reordered': self.reordered,
            'path': self.path,
            'diff': self.diff,
        }


@dataclass(slots=True)
class DigestTarget:
    """One corpus and what its last snapshot found."""

    name: str
    directory: Path
    group: str | None = None
    description: str | None = None
    generated_at: datetime | None = None
    first_run: bool = False
    unchanged: int = 0
    pages: list[DigestPage] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)
    error: str | None = None
    swept_at: datetime | None = None
    stale: bool = False
    """The change report predates the last sweep, so it describes an older run than this one."""

    @property
    def substantive(self) -> list[DigestPage]:
        return [page for page in self.pages if not page.reordered]

    @property
    def reordered(self) -> list[DigestPage]:
        return [page for page in self.pages if page.reordered]

    @property
    def changed(self) -> bool:
        return not self.first_run and not self.stale and bool(self.substantive)

    def of_kind(self, kind: ChangeKind) -> list[DigestPage]:
        return [page for page in self.substantive if page.kind == kind.value]

    @property
    def summary(self) -> str:
        if self.error:
            return self.error
        if self.stale:
            swept = self.swept_at.isoformat() if self.swept_at else 'the last sweep'
            seen = self.generated_at.isoformat() if self.generated_at else 'an earlier run'
            return f'no change in the sweep of {swept}; its last change report is from {seen}'
        if self.first_run:
            return f'first snapshot: {len(self.pages)} pages stored'
        parts = [
            f'{len(self.of_kind(ChangeKind.ADDED))} added',
            f'{len(self.of_kind(ChangeKind.REMOVED))} removed',
            f'{len(self.of_kind(ChangeKind.MODIFIED))} modified',
        ]
        if self.reordered:
            parts.append(f'{len(self.reordered)} reordered')
        parts.append(f'{self.unchanged} unchanged')
        return ', '.join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'group': self.group,
            'description': self.description,
            'directory': str(self.directory),
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'swept_at': self.swept_at.isoformat() if self.swept_at else None,
            'stale': self.stale,
            'first_run': self.first_run,
            'changed': self.changed,
            'summary': self.summary,
            'unchanged': self.unchanged,
            'failed': self.failed,
            'error': self.error,
            'pages': [page.to_dict() for page in self.pages],
        }


@dataclass(slots=True)
class Digest:
    """Every target asked about, and what each of them found."""

    generated_at: datetime = field(default_factory=utcnow)
    targets: list[DigestTarget] = field(default_factory=list)

    @property
    def changed(self) -> list[DigestTarget]:
        return [target for target in self.targets if target.changed]

    @property
    def headline(self) -> str:
        if not self.targets:
            return 'no targets'
        if not self.changed:
            return f'no change across {len(self.targets)} targets'
        names = ', '.join(target.name for target in self.changed)
        return f'{len(self.changed)} of {len(self.targets)} targets changed: {names}'

    def to_dict(self) -> dict[str, Any]:
        return {
            'generated_at': self.generated_at.isoformat(),
            'headline': self.headline,
            'changed': [target.name for target in self.changed],
            'targets': [target.to_dict() for target in self.targets],
        }


_LISTED_KINDS = (ChangeKind.ADDED, ChangeKind.REMOVED, ChangeKind.MODIFIED)


def _last_sweep(directory: Path, name: str) -> datetime | None:
    """When the last sweep that covered this corpus started, from the report written beside it.

    A grouped corpus sits at `<data>/<group>/<name>`, so its sweep report is one level up; a sweep
    that crossed groups files at the data root, two levels up. Both are considered and the most
    recent one that names this target wins.

    This is the only authority on whether a change report is current. The corpus itself cannot say:
    a run that finds nothing writes nothing, so its manifest and its change report are both left at
    whatever the last run that did find something wrote.
    """
    latest: datetime | None = None
    for candidate in (directory.parent / WATCH_RESULT, directory.parent.parent / WATCH_RESULT):
        if not candidate.is_file():
            continue
        try:
            raw = json.loads(candidate.read_text(encoding='utf-8'))
            started = datetime.fromisoformat(raw['started_at'])
        except (ValueError, KeyError, OSError):
            continue
        if not any(entry.get('name') == name for entry in raw.get('targets', [])):
            continue
        if latest is None or started > latest:
            latest = started
    return latest


def _target(name: str, settings: Settings) -> DigestTarget:
    directory = inventory.directory_for(name, settings)
    target = DigestTarget(name=name, directory=directory)

    try:
        profile = registry.load(name, settings)
    except DyarchiaCrawleeError:
        pass
    else:
        target.group = profile.group
        target.description = profile.description

    report = load_report(directory)
    if report is None:
        target.error = f'no change report in {directory}'
        return target

    target.generated_at = report.generated_at
    target.swept_at = _last_sweep(directory, name)
    if target.swept_at is not None and report.generated_at < target.swept_at:
        # The sweep ran and this corpus wrote nothing, so the report on disk describes an older run.
        # Carrying its pages forward is how a target that did not change reaches the next step as if
        # it had, which is worse than saying nothing: it is a wrong answer nobody can see is wrong.
        target.stale = True
        return target

    manifest = load_manifest(directory)
    paths = {url: record.path for url, record in manifest.pages.items()} if manifest else {}

    target.first_run = report.is_first_run
    target.unchanged = report.unchanged
    target.failed = list(report.failed)
    target.pages = [
        DigestPage(
            url=change.url,
            kind=change.kind.value,
            title=change.title,
            reordered=change.reordered,
            path=paths.get(change.url),
            diff=change.diff,
        )
        for change in report.changes
    ]
    return target


def build(
    names: list[str] | None = None,
    settings: Settings | None = None,
    group: str | None = None,
) -> Digest:
    """Assemble the digest for these targets, or for every tracked one, or for one group's."""
    settings = settings or get_settings()
    chosen = names or watchable(settings, group)
    return Digest(targets=[_target(name, settings) for name in chosen])


def _sections(target: DigestTarget) -> list[list[Any]]:
    listed: list[list[Any]] = [target.of_kind(kind) for kind in _LISTED_KINDS]
    listed.append(target.reordered)
    listed.append(target.failed)
    return listed


def render_markdown(digest: Digest, *, diffs: bool = True, limit: int = 50) -> str:
    """The digest as a document, which is the form a model reads without being told a schema.

    Every section stops at `limit`, and a reader who meets the framing sentence at the top and
    works down meets the first cut thousands of lines later. A sweep of 1,067 modified pages was
    reviewed as 356 twice before the header said so, so the warning is stated once at the top, and
    only when something was actually cut: a digest that fits says nothing about a limit it did not
    reach.
    """
    capped = any(len(entries) > limit for target in digest.targets for entries in _sections(target))

    lines = [
        '# Change digest',
        '',
        f'Generated: {digest.generated_at.isoformat()}',
        '',
        f'**{digest.headline}**',
        '',
        'Each changed page names the file holding its current text, relative to the target'
        ' directory. Read that file for what the page says now; the diff only says what moved.',
        '',
    ]

    if capped:
        lines.extend(
            [
                f'**This document is a sample.** Every section stops after {limit} entries and says how'
                f' many it left out; the heading carries the true count either way. For a section that'
                f' was cut, the complete list is `{CHANGES_DOCUMENT}`, in the directory the target names.',
                '',
            ]
        )

    for target in digest.targets:
        lines.extend([f'## {target.name}', ''])
        if target.description:
            lines.extend([target.description, ''])
        lines.extend([f'Directory: `{target.directory}`', '', target.summary, ''])

        if target.error:
            lines.append('')
            continue

        for kind in _LISTED_KINDS:
            entries = target.of_kind(kind)
            if not entries:
                continue
            lines.extend([f'### {kind.value.title()} ({len(entries)})', ''])
            for page in entries[:limit]:
                lines.append(f'- {page.title or page.url}')
                lines.append(f'  - {page.url}')
                if page.path:
                    lines.append(f'  - `{page.path}`')
                if diffs and page.diff:
                    lines.extend(['', '```diff', page.diff, '```', ''])
            if len(entries) > limit:
                lines.append(f'- ... and {len(entries) - limit} more')
            lines.append('')

        if target.reordered:
            lines.extend([f'### Reordered only ({len(target.reordered)})', ''])
            lines.append('Same lines in a different order. Listed, not counted as a change.')
            lines.append('')
            lines.extend(f'- {page.title or page.url}' for page in target.reordered[:limit])
            if len(target.reordered) > limit:
                lines.append(f'- ... and {len(target.reordered) - limit} more')
            lines.append('')

        if target.failed:
            lines.extend([f'### Failed ({len(target.failed)})', ''])
            lines.extend(f'- {url}' for url in target.failed[:limit])
            if len(target.failed) > limit:
                lines.append(f'- ... and {len(target.failed) - limit} more')
            lines.append('')

    return '\n'.join(lines)


def render_json(digest: Digest) -> str:
    return json.dumps(digest.to_dict(), indent=2, ensure_ascii=False)
