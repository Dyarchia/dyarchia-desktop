"""Comparison of two manifests into a report a human can read."""

from __future__ import annotations

import difflib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from pathlib import Path
from typing import Any

from crawlee_lab.models import PageStatus, utcnow
from crawlee_lab.versioning.manifest import RunManifest

CHANGES_FILENAME = 'changes.json'
_DIFF_CONTEXT = 2
_MAX_DIFF_LINES = 200


class ChangeKind(StrEnum):
    ADDED = 'added'
    REMOVED = 'removed'
    MODIFIED = 'modified'


@dataclass(slots=True)
class PageChange:
    """One page that differs between two runs."""

    url: str
    kind: ChangeKind
    title: str | None = None
    diff: str | None = None


@dataclass(slots=True)
class ChangeReport:
    """What changed on a target between the previous snapshot and this one."""

    name: str
    generated_at: datetime = field(default_factory=utcnow)
    is_first_run: bool = False
    unchanged: int = 0
    failed: list[str] = field(default_factory=list)
    changes: list[PageChange] = field(default_factory=list)

    def of_kind(self, kind: ChangeKind) -> list[PageChange]:
        return [change for change in self.changes if change.kind is kind]

    @property
    def added(self) -> list[PageChange]:
        return self.of_kind(ChangeKind.ADDED)

    @property
    def removed(self) -> list[PageChange]:
        return self.of_kind(ChangeKind.REMOVED)

    @property
    def modified(self) -> list[PageChange]:
        return self.of_kind(ChangeKind.MODIFIED)

    @property
    def has_changes(self) -> bool:
        return bool(self.changes)

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'generated_at': self.generated_at.isoformat(),
            'is_first_run': self.is_first_run,
            'unchanged': self.unchanged,
            'failed': self.failed,
            'changes': [
                {'url': change.url, 'kind': change.kind.value, 'title': change.title, 'diff': change.diff}
                for change in self.changes
            ],
        }


def unified_diff(before: str, after: str, url: str) -> str:
    """A trimmed unified diff, long enough to see the change and short enough to stay readable."""
    lines = list(
        difflib.unified_diff(
            before.splitlines(),
            after.splitlines(),
            fromfile=f'a/{url}',
            tofile=f'b/{url}',
            lineterm='',
            n=_DIFF_CONTEXT,
        )
    )
    if len(lines) > _MAX_DIFF_LINES:
        omitted = len(lines) - _MAX_DIFF_LINES
        lines = [*lines[:_MAX_DIFF_LINES], f'... {omitted} more diff lines omitted']
    return '\n'.join(lines)


def compare(
    previous: RunManifest | None,
    current: RunManifest,
    texts_before: dict[str, str],
    texts_after: dict[str, str],
) -> ChangeReport:
    """Diff two manifests, using the stored text only for the pages whose hash moved."""
    report = ChangeReport(name=current.name, is_first_run=previous is None)
    report.failed = [url for url, record in current.pages.items() if record.status is PageStatus.FAILED]

    old_pages = previous.stored if previous is not None else {}
    new_pages = current.stored

    for url, record in new_pages.items():
        old = old_pages.get(url)
        if old is None:
            report.changes.append(PageChange(url=url, kind=ChangeKind.ADDED, title=record.title))
            continue
        if old.sha256 == record.sha256:
            report.unchanged += 1
            continue
        report.changes.append(
            PageChange(
                url=url,
                kind=ChangeKind.MODIFIED,
                title=record.title,
                diff=unified_diff(texts_before.get(url, ''), texts_after.get(url, ''), url),
            )
        )

    for url, record in old_pages.items():
        if url not in new_pages and url not in report.failed:
            report.changes.append(PageChange(url=url, kind=ChangeKind.REMOVED, title=record.title))

    return report


def changes_path(directory: Path) -> Path:
    return directory / CHANGES_FILENAME


def save_report(report: ChangeReport, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = changes_path(directory)
    path.write_text(json.dumps(report.to_dict(), indent=2, ensure_ascii=False), encoding='utf-8')
    return path


def load_report(directory: Path) -> ChangeReport | None:
    """Read back the report written by the last snapshot run."""
    path = changes_path(directory)
    if not path.is_file():
        return None

    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except ValueError:
        return None

    report = ChangeReport(
        name=raw.get('name', directory.name),
        generated_at=datetime.fromisoformat(raw['generated_at']),
        is_first_run=bool(raw.get('is_first_run', False)),
        unchanged=int(raw.get('unchanged', 0)),
        failed=list(raw.get('failed', [])),
    )
    report.changes = [
        PageChange(
            url=item['url'],
            kind=ChangeKind(item['kind']),
            title=item.get('title'),
            diff=item.get('diff'),
        )
        for item in raw.get('changes', [])
    ]
    return report
