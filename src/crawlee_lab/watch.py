"""Unattended runs.

A change detector that only detects when somebody remembers to launch it is a script. This module
is what turns the crawl into a monitor: it runs every tracked target in one pass, survives a target
that fails without abandoning the rest, writes one document describing the whole sweep, and reports
through its exit code whether a human needs to look. The scheduler needs nothing else.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from crawlee_lab import registry
from crawlee_lab.config import Settings, get_settings
from crawlee_lab.engine import execute
from crawlee_lab.errors import CrawleeLabError
from crawlee_lab.models import utcnow
from crawlee_lab.versioning.report import summary_line

WATCH_DOCUMENT = 'WATCH.md'

EXIT_NO_CHANGES = 0
EXIT_FAILED = 1
EXIT_CHANGES = 10


@dataclass(slots=True)
class WatchEntry:
    """One target's outcome within a sweep."""

    name: str
    summary: str = ''
    pages: int = 0
    added: int = 0
    removed: int = 0
    modified: int = 0
    first_run: bool = False
    error: str | None = None

    @property
    def failed(self) -> bool:
        return self.error is not None

    @property
    def changed(self) -> bool:
        """A first snapshot is not a change; there is nothing yet for it to differ from."""
        return not self.first_run and bool(self.added or self.removed or self.modified)


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


def watchable(settings: Settings | None = None) -> list[str]:
    """Every profile that asks to be snapshotted, which is the same as every tracked target."""
    settings = settings or get_settings()
    return [name for name, profile in registry.discover(settings).items() if profile.snapshot]


async def sweep(names: list[str], settings: Settings | None = None) -> WatchResult:
    """Run each target in turn, letting one failure cost only its own target."""
    settings = settings or get_settings()
    result = WatchResult()

    for name in names:
        entry = WatchEntry(name=name)
        try:
            profile = registry.load(name, settings)
            run = await execute(profile.to_run_spec(snapshot=True), settings)
        except CrawleeLabError as error:
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
                entry.modified = len(report.modified)
        result.entries.append(entry)

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
            if entry.changed:
                lines.append('')
                lines.append(f'See `crawlee-lab diff {entry.name} --unified`.')
        lines.append('')

    return '\n'.join(lines)


def save_report(result: WatchResult, settings: Settings | None = None) -> Path:
    """Write the sweep next to the snapshots it describes."""
    settings = settings or get_settings()
    directory = settings.resolve(settings.data_dir)
    directory.mkdir(parents=True, exist_ok=True)

    target = directory / WATCH_DOCUMENT
    target.write_text(render_markdown(result), encoding='utf-8', newline='\n')
    result.document = target
    return target
