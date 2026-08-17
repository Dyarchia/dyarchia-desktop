"""Deciding how much of a corpus a model has to read to answer the question.

Almost all of the money an audit can spend is decided here rather than in the prompt. The median
stored page is eleven kilobytes and the largest is eight megabytes; sending either one whole is
paying to have a model re-read what a local measurement already settled. What a reader needs in
order to say whether a page is readable, and whether it is about programming, is a look at how it
opens, a look at the middle, and a look at how it ends.

Relevance is likewise not asked page by page. A documentation site is organised into sections, and
a section is the unit a filter is written against, so it is also the unit a verdict is worth
buying: one judgement on `developers.openai.com/plugins` settles thirty pages at once.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

from crawlee_lab.audit.signals import PageSignals, Shape
from crawlee_lab.inventory import section_of

HEAD_CHARS = 1200
MIDDLE_CHARS = 800
TAIL_CHARS = 600
ELISION = '\n\n[...]\n\n'

SECTION_SAMPLES = 3
SECTION_SAMPLE_CHARS = 200

CONTROL_SHARE = 0.04
CONTROL_MINIMUM = 15
CONTROL_SEED = 20260817


def excerpt(document: str) -> str:
    """The part of a page a reader needs in order to judge it.

    Three windows rather than a prefix: an opening tells you whether extraction produced prose or
    layout, the middle tells you whether it stayed that way, and the ending catches the pages that
    trail off into a navigation block or stop in the middle of an example.
    """
    text = document.strip()
    if len(text) <= HEAD_CHARS + MIDDLE_CHARS + TAIL_CHARS:
        return text

    middle_start = max(HEAD_CHARS, (len(text) - MIDDLE_CHARS) // 2)
    return ELISION.join(
        (
            text[:HEAD_CHARS],
            text[middle_start : middle_start + MIDDLE_CHARS],
            text[-TAIL_CHARS:],
        )
    )


@dataclass(slots=True)
class SectionBrief:
    """One part of a site, described well enough for a reader to rule on the whole of it."""

    corpus: str
    prefix: str
    pages: int
    bytes: int
    samples: list[tuple[str, str]] = field(default_factory=list)

    @property
    def key(self) -> str:
        return f'{self.corpus}:{self.prefix}'

    def render(self) -> str:
        """The section as a model sees it: what it is called, how big it is, what is in it."""
        lines = [f'section: {self.prefix}', f'pages: {self.pages}']
        for title, opening in self.samples:
            lines.append(f'- {title or "(untitled)"}: {opening}')
        return '\n'.join(lines)


def _opening(path: Path, chars: int = SECTION_SAMPLE_CHARS) -> str:
    if not path.is_file():
        return ''
    text = path.read_text(encoding='utf-8', errors='replace')[: chars * 6]
    prose = ' '.join(line.strip() for line in text.splitlines() if line.strip() and line.strip() != '---')
    return prose[:chars]


def section_briefs(
    corpus: str,
    directory: Path,
    pages: list[PageSignals],
    depth: int | None = None,
    samples: int = SECTION_SAMPLES,
) -> list[SectionBrief]:
    """Group a corpus into the sections a filter is written against, and describe each one.

    The sample is taken evenly across the section rather than from its head, because a section
    ordered by URL puts its index pages first and they are the least representative thing in it.
    """
    grouped: dict[str, list[PageSignals]] = {}
    for page in pages:
        grouped.setdefault(section_of(page.url, depth), []).append(page)

    briefs: list[SectionBrief] = []
    for prefix, members in sorted(grouped.items()):
        step = max(1, len(members) // samples)
        chosen = members[::step][:samples]
        briefs.append(
            SectionBrief(
                corpus=corpus,
                prefix=prefix,
                pages=len(members),
                bytes=sum(member.bytes for member in members),
                samples=[(member.title or '', _opening(directory / member.path)) for member in chosen],
            )
        )

    return sorted(briefs, key=lambda brief: (-brief.pages, brief.prefix))


def control_sample(
    pages: list[PageSignals],
    share: float = CONTROL_SHARE,
    minimum: int = CONTROL_MINIMUM,
    seed: int = CONTROL_SEED,
) -> list[PageSignals]:
    """Pages the local signals called clean, shown to a model anyway.

    Without this the audit can only report what its own heuristics already believed. The control
    sample is how the miss rate of those heuristics gets read off a report rather than assumed, and
    it is the reason a `clean` verdict is worth anything. The seed is fixed so that two runs over an
    unchanged corpus audit the same pages and cost nothing the second time.
    """
    clean = [page for page in pages if page.shape is Shape.CLEAN]
    if not clean:
        return []

    size = min(len(clean), max(minimum, round(len(clean) * share)))
    return sorted(random.Random(seed).sample(clean, size), key=lambda page: page.url)
