"""Rendering of a change report."""

from __future__ import annotations

from crawlee_lab.versioning.diffing import ChangeKind, ChangeReport

_SECTION_TITLES = {
    ChangeKind.ADDED: 'Added',
    ChangeKind.REMOVED: 'Removed',
    ChangeKind.MODIFIED: 'Modified',
}


def summary_line(report: ChangeReport) -> str:
    if report.is_first_run:
        return f'first snapshot: {len(report.added)} pages stored'
    return (
        f'{len(report.added)} added, {len(report.removed)} removed, '
        f'{len(report.modified)} modified, {report.unchanged} unchanged'
    )


def render_markdown(report: ChangeReport) -> str:
    """Write the report as a document that reads well next to the snapshots in git."""
    lines = [
        f'# Changes: {report.name}',
        '',
        f'Generated: {report.generated_at.isoformat()}',
        '',
        summary_line(report),
        '',
    ]

    for kind in (ChangeKind.ADDED, ChangeKind.REMOVED, ChangeKind.MODIFIED):
        entries = report.of_kind(kind)
        if not entries:
            continue

        lines.extend([f'## {_SECTION_TITLES[kind]} ({len(entries)})', ''])
        for change in entries:
            label = f'{change.title} — {change.url}' if change.title else change.url
            lines.append(f'- {label}')
            if change.diff:
                lines.extend(['', '```diff', change.diff, '```', ''])
        lines.append('')

    if report.failed:
        lines.extend([f'## Failed ({len(report.failed)})', ''])
        lines.extend(f'- {url}' for url in report.failed)
        lines.append('')

    return '\n'.join(lines)
