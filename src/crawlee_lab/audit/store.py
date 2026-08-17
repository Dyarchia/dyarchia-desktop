"""Where verdicts are kept, and what they look like when a person reads them.

Verdicts are keyed by the content hash the manifest already records, not by URL. A page whose hash
has not moved has not changed, so it is never judged twice, and the second full audit of an
unchanged corpus costs nothing at all. That is the whole of the incremental design; the rest of it
is the manifest's work, done long before this module existed.

The report separates the two findings by the action they call for. A malformed page is a bug in
extraction and its URL is something to fix; an irrelevant page is a decision about the corpus and
its URL is something to exclude. Mixing them into one list of problems would leave the reader to
sort them out again.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from crawlee_lab.audit.panel import PageRuling, SectionRuling, SectionVerdict
from crawlee_lab.models import utcnow

AUDIT_FILENAME = 'audit.json'
REPORT_FILENAME = 'AUDIT.md'
AUDIT_VERSION = 1


class Bucket(BaseModel):
    """One reason a URL is being reported, and what to do about it."""

    model_config = ConfigDict(extra='ignore')

    name: str
    heading: str
    action: str


BUCKETS = (
    Bucket(
        name='malformed',
        heading='malformed',
        action='the stored markdown is not readable; fix extraction and re-crawl these',
    ),
    Bucket(
        name='irrelevant',
        heading='irrelevant',
        action='outside what this corpus is for; exclude these in the profile',
    ),
    Bucket(
        name='disputed',
        heading='disputed',
        action='the readers disagreed; decide these yourself',
    ),
    Bucket(
        name='control',
        heading='control sample',
        action='pages the local signals called clean, read anyway to measure what they miss',
    ),
)


class AuditState(BaseModel):
    """Everything known about one corpus, carried from one audit to the next."""

    model_config = ConfigDict(extra='ignore')

    name: str
    version: int = AUDIT_VERSION
    audited_at: datetime = Field(default_factory=utcnow)
    pages_seen: int = 0
    usd_spent: float = 0.0
    rulings: dict[str, PageRuling] = Field(default_factory=dict)
    sections: dict[str, SectionRuling] = Field(default_factory=dict)
    control: list[str] = Field(default_factory=list)
    broken: dict[str, list[str]] = Field(default_factory=dict)

    def judged(self, sha256: str | None) -> PageRuling | None:
        """The verdict already held for this exact content, if there is one."""
        return self.rulings.get(sha256) if sha256 else None


def audit_path(directory: Path) -> Path:
    return directory / AUDIT_FILENAME


def load_state(directory: Path, name: str) -> AuditState:
    """Read the verdicts from the last audit, or start an empty one."""
    path = audit_path(directory)
    if not path.is_file():
        return AuditState(name=name)
    try:
        return AuditState.model_validate_json(path.read_text(encoding='utf-8'))
    except ValueError:
        return AuditState(name=name)


def save_state(state: AuditState, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = audit_path(directory)
    payload = state.model_dump(mode='json')
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True), encoding='utf-8')
    return path


def buckets(state: AuditState) -> dict[str, list[tuple[str, str]]]:
    """Sort every judged page into the bucket that says what to do with it.

    A page is reported once. Being unreadable outranks being unwanted, because a page nobody can
    read cannot be judged on its subject in the first place.
    """
    found: dict[str, list[tuple[str, str]]] = {bucket.name: [] for bucket in BUCKETS}

    for url, reasons in sorted(state.broken.items()):
        found['malformed'].append((url, reasons[0] if reasons else 'local signals'))

    for ruling in sorted(state.rulings.values(), key=lambda item: item.url):
        note = ruling.opinions[-1].reason if ruling.opinions else ''
        if ruling.disputed:
            found['disputed'].append((ruling.url, _disagreement(ruling)))
        elif ruling.malformed:
            found['malformed'].append((ruling.url, f'{ruling.form.value}: {note}'))
        elif ruling.irrelevant:
            found['irrelevant'].append((ruling.url, note))

    for section in sorted(state.sections.values(), key=lambda item: item.prefix):
        if section.verdict is SectionVerdict.DROP:
            note = section.opinions[-1].reason if section.opinions else ''
            found['irrelevant'].append(
                (f'{section.prefix}/*', f'whole section, {section.pages} pages: {note}')
            )

    seen = {url for url, _ in found['malformed']} | {url for url, _ in found['irrelevant']}
    for url in sorted(state.control):
        found['control'].append((url, 'flagged after all' if url in seen else 'agreed clean'))

    return found


def _disagreement(ruling: PageRuling) -> str:
    return ' vs '.join(
        f'{opinion.model.split("-")[1]} says {opinion.form.value}/{opinion.relevance.value}'
        for opinion in ruling.opinions
    )


def render_report(state: AuditState, sorted_buckets: dict[str, list[tuple[str, str]]]) -> str:
    """The audit as a document, in the shape the rest of this project writes documents."""
    lines = [
        f'# audit: {state.name}',
        '',
        f'{state.pages_seen} pages examined, {len(state.rulings)} read by a model, '
        f'{state.usd_spent:.2f} USD spent.',
        f'Audited {state.audited_at.isoformat(timespec="seconds")}.',
        '',
    ]

    for bucket in BUCKETS:
        entries = sorted_buckets.get(bucket.name, [])
        lines.append(f'## {bucket.heading} ({len(entries)})')
        lines.append('')
        lines.append(bucket.action)
        lines.append('')
        if not entries:
            lines.append('nothing')
            lines.append('')
            continue
        for url, note in entries:
            lines.append(f'- {url}')
            if note:
                lines.append(f'  {note}')
        lines.append('')

    return '\n'.join(lines).rstrip('\n') + '\n'


def save_report(state: AuditState, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / REPORT_FILENAME
    path.write_text(render_report(state, buckets(state)), encoding='utf-8')
    return path
