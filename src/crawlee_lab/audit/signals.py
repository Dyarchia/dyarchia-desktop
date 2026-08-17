"""What a stored page looks like, measured locally and for nothing.

Every page the audit shows a model costs money, so the first question is asked on this machine: is
there anything wrong with the shape of this document at all? Most pages answer no. The ones that
answer yes, plus a sample of the ones that answered no, are the only pages a model ever reads.

The signals here judge form, never subject. A page about billing is well-formed markdown and this
module says so; whether the corpus wants it is a question only a reader can answer.

Every threshold below was read off the nine corpora as they stand rather than chosen in advance,
and the distributions that produced them are in the audit design document. A threshold fitted to a
corpus is a threshold that drifts, which is why `audit --dry-run` reprints the candidate counts:
a signal that has come loose from the corpus shows up as a changed count instead of silently.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from crawlee_lab.extraction import frontmatter
from crawlee_lab.extraction.markup import (
    ends_inside_a_fence,
    fence_states,
    lines_outside_fences,
    markup_line_ratio,
)

_COMPONENT = re.compile(r'^\s*</?[A-Z][A-Za-z0-9]*[\s/>]')
_LINK_ONLY = re.compile(r'^\s*(?:[-*+]\s+|\d+\.\s+)?\[[^\]]*\]\([^)]*\)\s*$')
_WORD = re.compile(r'[^\W\d_]{2,}')

MARKUP_RATIO = 0.05
COMPONENT_HITS = 3
LINK_LINE_RATIO = 0.5
MIN_WORDS = 40


class Shape(StrEnum):
    """What the local signals concluded about a page's form."""

    CLEAN = 'clean'
    SUSPECT = 'suspect'
    BROKEN = 'broken'


@dataclass(slots=True)
class PageSignals:
    """One page, measured. Cheap enough to compute for every page of every corpus."""

    url: str
    path: str
    sha256: str | None = None
    title: str | None = None
    bytes: int = 0
    words: int = 0
    markup_ratio: float = 0.0
    component_hits: int = 0
    link_line_ratio: float = 0.0
    unclosed_fence: bool = False
    shape: Shape = Shape.CLEAN
    reasons: list[str] = field(default_factory=list)

    @property
    def needs_a_reader(self) -> bool:
        """Whether a model could still say something useful about this page.

        A broken page needs no second opinion: a file with nothing in it, or one whose last code
        fence never closes, is wrong on its face, and paying to be told so is waste.
        """
        return self.shape is Shape.SUSPECT


def _body(document: str) -> str:
    _, rest = frontmatter.split(document)
    return rest


def measure(document: str) -> dict[str, float]:
    """The raw numbers for one document, before any threshold is applied to them."""
    body = _body(document)
    filled = [line for line in lines_outside_fences(body) if line.strip()]
    linkish = sum(1 for line in filled if _LINK_ONLY.match(line))

    return {
        'words': float(len(_WORD.findall('\n'.join(filled)))),
        'markup_ratio': markup_line_ratio(body),
        'component_hits': float(sum(1 for line in filled if _COMPONENT.match(line))),
        'link_line_ratio': linkish / len(filled) if filled else 0.0,
        'unclosed_fence': float(ends_inside_a_fence(fence_states(body))),
    }


def classify(measured: dict[str, float]) -> tuple[Shape, list[str]]:
    """Turn the numbers into a verdict, saying which number produced it."""
    if measured['unclosed_fence']:
        return Shape.BROKEN, ['a code fence is left open, so everything after it renders as code']
    if measured['words'] < MIN_WORDS:
        return Shape.BROKEN, [f'{measured["words"]:.0f} words of prose, so the page carries nothing']

    reasons: list[str] = []
    if measured['markup_ratio'] >= MARKUP_RATIO:
        reasons.append(f'{measured["markup_ratio"]:.0%} of lines outside code fences carry a tag')
    if measured['component_hits'] >= COMPONENT_HITS:
        reasons.append(f'{measured["component_hits"]:.0f} raw component tags survived extraction')
    if measured['link_line_ratio'] >= LINK_LINE_RATIO:
        reasons.append(f'{measured["link_line_ratio"]:.0%} of lines are nothing but a link')

    return (Shape.SUSPECT, reasons) if reasons else (Shape.CLEAN, [])


def inspect(
    url: str,
    path: Path,
    relative: str,
    sha256: str | None = None,
    title: str | None = None,
) -> PageSignals:
    """Measure and classify one stored page."""
    document = path.read_text(encoding='utf-8', errors='replace') if path.is_file() else ''
    measured = measure(document)
    shape, reasons = classify(measured)

    return PageSignals(
        url=url,
        path=relative,
        sha256=sha256,
        title=title,
        bytes=path.stat().st_size if path.is_file() else 0,
        words=int(measured['words']),
        markup_ratio=measured['markup_ratio'],
        component_hits=int(measured['component_hits']),
        link_line_ratio=measured['link_line_ratio'],
        unclosed_fence=bool(measured['unclosed_fence']),
        shape=shape,
        reasons=reasons,
    )
