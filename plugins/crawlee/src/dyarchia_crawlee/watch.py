"""Unattended runs.

A change detector that only detects when somebody remembers to launch it is a script. This module
is what turns the crawl into a monitor: it runs every tracked target in one pass, survives a target
that fails without abandoning the rest, writes one document describing the whole sweep, and reports
through its exit code whether a human needs to look. The scheduler needs nothing else.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from collections.abc import Callable
from typing import Any

from dyarchia_crawlee import registry, repositories
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError, ProfileError
from dyarchia_crawlee.models import utcnow
from dyarchia_crawlee.versioning.diffing import CHANGES_FILENAME
from dyarchia_crawlee.versioning.report import summary_line

WATCH_DOCUMENT = 'WATCH.md'
WATCH_RESULT = 'WATCH.json'

EXIT_NO_CHANGES = 0
EXIT_FAILED = 1
EXIT_CHANGES = 10
EXIT_BUSY = 30
"""Another round over the same group holds the lock, so this one did nothing."""


@dataclass(slots=True)
class WatchEntry:
    """One target's outcome within a sweep."""

    name: str
    group: str | None = None
    summary: str = ''
    pages: int = 0
    added: int = 0
    removed: int = 0
    modified: int = 0
    reordered: int = 0
    first_run: bool = False
    error: str | None = None
    warnings: list[str] = field(default_factory=list)
    directory: Path | None = None

    @property
    def failed(self) -> bool:
        return self.error is not None

    @property
    def changed(self) -> bool:
        """A first snapshot is not a change; there is nothing yet for it to differ from.

        Neither is a reordering. `modified` counts the pages that say something different, which is
        what a notification, an exit code and whatever reads this next are all asking about.
        """
        return not self.first_run and bool(self.added or self.removed or self.modified)

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'group': self.group,
            'summary': self.summary,
            'pages': self.pages,
            'added': self.added,
            'removed': self.removed,
            'modified': self.modified,
            'reordered': self.reordered,
            'first_run': self.first_run,
            'changed': self.changed,
            'failed': self.failed,
            'error': self.error,
            'warnings': self.warnings,
            'directory': str(self.directory) if self.directory else None,
            'changes': str(self.directory / CHANGES_FILENAME) if self.directory else None,
        }


@dataclass(slots=True)
class WatchResult:
    """What one sweep across every tracked target found."""

    entries: list[WatchEntry] = field(default_factory=list)
    started_at: datetime = field(default_factory=utcnow)
    finished_at: datetime | None = None
    document: Path | None = None

    @property
    def changed(self) -> list[WatchEntry]:
        return [entry for entry in self.entries if entry.changed]

    @property
    def failed(self) -> list[WatchEntry]:
        return [entry for entry in self.entries if entry.failed]

    @property
    def exit_code(self) -> int:
        """A failure outranks a change, because a target that did not answer hides both."""
        if self.failed:
            return EXIT_FAILED
        return EXIT_CHANGES if self.changed else EXIT_NO_CHANGES

    @property
    def headline(self) -> str:
        if self.failed:
            return f'{len(self.failed)} of {len(self.entries)} targets failed'
        if self.changed:
            names = ', '.join(entry.name for entry in self.changed)
            return f'{len(self.changed)} of {len(self.entries)} targets changed: {names}'
        return f'no change across {len(self.entries)} targets'

    def to_dict(self) -> dict[str, Any]:
        """The sweep as data, for whatever runs after it.

        A scheduled step that has to parse the markdown report to find out whether anything moved
        is a step built on prose. This is the contract instead: the same verdict the exit code
        carries, plus where each target's changes were written.
        """
        finished = self.finished_at or utcnow()
        return {
            'started_at': self.started_at.isoformat(),
            'finished_at': finished.isoformat(),
            'headline': self.headline,
            'exit_code': self.exit_code,
            'changed': [entry.name for entry in self.changed],
            'failed': [entry.name for entry in self.failed],
            'targets': [entry.to_dict() for entry in self.entries],
        }


def watchable(settings: Settings | None = None, group: str | None = None) -> list[str]:
    """Every profile that asks to be snapshotted, which is the same as every tracked target.

    Naming a group narrows the sweep to the profiles that belong to it, which is how one scheduled
    round covers its own corpus and leaves every other corpus to the round that owns it.
    """
    settings = settings or get_settings()
    return [
        name
        for name, profile in registry.discover(settings).items()
        if profile.snapshot and (group is None or profile.group == group)
    ]


def rounds(
    names: list[str] | None = None, group: str | None = None, settings: Settings | None = None
) -> list[tuple[Settings, list[str]]]:
    """The sweeps a request comes down to, one per repository, in repository order.

    A repository holds a corpus, the profiles that define it and the report of the round that last
    touched it, so a request covering two of them is two rounds rather than one: two locks, two
    reports, and two exit codes to combine. Nothing about a single round changes, which is why this
    returns the settings each one runs under instead of teaching `sweep` about more than one.

    Naming targets explicitly still works across repositories: they are grouped by the one that
    defines each, not refused for spanning two.
    """
    settings = settings or get_settings()
    found = registry.everywhere(settings)

    if names:
        wanted = {}
        for name in names:
            if name not in found:
                known = ', '.join(found) or 'none'
                raise ProfileError(f'unknown profile {name!r}. Available profiles: {known}')
            wanted[name] = found[name][1]
    else:
        wanted = {
            name: repository
            for name, (profile, repository) in found.items()
            if profile.snapshot and (group is None or profile.group == group)
        }

    covered: list[tuple[Settings, list[str]]] = []
    for repository in repositories.known(settings):
        selected = [name for name, owner in wanted.items() if owner.data_dir == repository.data_dir]
        if selected:
            covered.append((repository, selected))
    return covered


async def sweep(
    names: list[str],
    settings: Settings | None = None,
    announce: Callable[[str, WatchEntry], None] | None = None,
) -> WatchResult:
    """Run each target in turn, letting one failure cost only its own target.

    `announce` hears `start` before a target and `end` after it, with the entry as it stands.
    A round of fourteen targets runs for most of an hour, and without it the only thing a
    watcher could learn in that time was that something was still running.
    """
    from dyarchia_crawlee.engine import execute

    """Imported here rather than at module scope because it is the only thing in this module that
    needs the crawler stack, and importing that stack costs three seconds: crawlee pulls in
    Playwright and scikit-learn, the latter for the adaptive crawler's rendering-type predictor.
    `digest` and `state` reach into this module for a filename and for `watchable`, and the panel
    calls them on every interaction, so a module-scope import here made listing profiles pay for a
    browser and a machine-learning library."""

    settings = settings or get_settings()
    result = WatchResult()

    for name in names:
        entry = WatchEntry(name=name)
        if announce is not None:
            announce('start', entry)
        try:
            profile = registry.load(name, settings)
            entry.group = profile.group
            run = await execute(profile.to_run_spec(snapshot=True), settings)
        except DyarchiaCrawleeError as error:
            entry.error = str(error)
        except Exception as error:
            entry.error = f'{type(error).__name__}: {error}'
        else:
            entry.pages = len(run.items)
            if run.snapshot is None:
                entry.error = 'the run produced no snapshot'
            else:
                report = run.snapshot.report
                entry.summary = summary_line(report)
                entry.first_run = report.is_first_run
                entry.added = len(report.added)
                entry.removed = len(report.removed)
                entry.modified = len([change for change in report.modified if not change.reordered])
                entry.reordered = len(report.reordered)
                entry.directory = run.snapshot.directory
                entry.warnings = list(run.snapshot.warnings)
        result.entries.append(entry)
        if announce is not None:
            announce('end', entry)

    result.finished_at = utcnow()
    return result


def render_markdown(result: WatchResult) -> str:
    """The sweep as a document, so a scheduled run leaves something readable behind."""
    finished = result.finished_at or utcnow()
    lines = [
        '# Watch report',
        '',
        f'Swept {len(result.entries)} targets at {finished.isoformat()}.',
        '',
        f'**{result.headline}**',
        '',
    ]

    for entry in result.entries:
        lines.append(f'## {entry.name}')
        lines.append('')
        if entry.failed:
            lines.append(f'Failed: {entry.error}')
        else:
            lines.append(f'{entry.pages} pages. {entry.summary}')
            for warning in entry.warnings:
                lines.append('')
                lines.append(f'> {warning}')
            if entry.changed:
                lines.append('')
                lines.append(f'See `dyarchia-crawlee diff {entry.name} --unified`.')
        lines.append('')

    return '\n'.join(lines)


def _covered_group(result: WatchResult) -> str | None:
    """The one group a sweep covered, when it covered exactly one and nothing outside it."""
    groups = {entry.group for entry in result.entries}
    return groups.pop() if len(groups) == 1 else None


def save_report(result: WatchResult, settings: Settings | None = None) -> Path:
    """Write the sweep next to the snapshots it describes.

    A sweep of one group lands inside that group, or two scheduled rounds would each overwrite the
    other's account of a week. A sweep that crossed groups lands at the root, because no one group
    holds all of what it found.

    Both forms are written every time. The markdown is for whoever opens it; the JSON is for
    whatever runs next, which should not have to read prose to find out whether anything moved.
    """
    settings = settings or get_settings()
    directory = settings.data_root(_covered_group(result))
    directory.mkdir(parents=True, exist_ok=True)

    target = directory / WATCH_DOCUMENT
    target.write_text(render_markdown(result), encoding='utf-8', newline='\n')

    machine = directory / WATCH_RESULT
    machine.write_text(
        json.dumps(result.to_dict(), indent=2, ensure_ascii=False), encoding='utf-8', newline='\n'
    )

    result.document = target
    return target
