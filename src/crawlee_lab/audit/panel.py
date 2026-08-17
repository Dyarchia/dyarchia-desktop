"""Deciding when one model's answer is enough, and what to do when two disagree.

A second opinion is bought where it changes what happens, and nowhere else. Acting on a verdict
means excluding a URL from a corpus or re-extracting one, so the expensive mistake is a confident
wrong flag, not a missed one: recall is what the control sample is for. A page the cheap model
passes is therefore left alone, and a page it condemns is read again by a better model before the
report will say so.

Disagreement is never resolved by majority. Two readers who disagree about whether a page belongs
in a corpus have found a question about the corpus, and the answer to that belongs to its owner.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Form(StrEnum):
    """What a reader concluded about how a page is written."""

    OK = 'ok'
    MDX_RESIDUE = 'mdx-residue'
    NAV_DUMP = 'nav-dump'
    TRUNCATED = 'truncated'
    EMPTY = 'empty'

    @property
    def is_defect(self) -> bool:
        return self is not Form.OK


class Relevance(StrEnum):
    """Whether a page belongs in the corpus."""

    KEEP = 'keep'
    DROP = 'drop'


class SectionVerdict(StrEnum):
    """Whether a whole section belongs in the corpus."""

    KEEP = 'keep'
    DROP = 'drop'
    MIXED = 'mixed'


class Confidence(StrEnum):
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'


class Opinion(BaseModel):
    """One model's answer about one page."""

    model_config = ConfigDict(extra='ignore')

    model: str
    form: Form
    relevance: Relevance
    confidence: Confidence
    reason: str = ''


class SectionOpinion(BaseModel):
    """One model's answer about one section."""

    model_config = ConfigDict(extra='ignore')

    model: str
    verdict: SectionVerdict
    confidence: Confidence
    reason: str = ''


class PageRuling(BaseModel):
    """What the panel concluded about a page, and who said what."""

    model_config = ConfigDict(extra='ignore')

    url: str
    sha256: str | None = None
    signals: list[str] = Field(default_factory=list)
    opinions: list[Opinion] = Field(default_factory=list)
    disputed: bool = False

    @property
    def form(self) -> Form:
        return self.opinions[-1].form if self.opinions else Form.OK

    @property
    def relevance(self) -> Relevance:
        return self.opinions[-1].relevance if self.opinions else Relevance.KEEP

    @property
    def malformed(self) -> bool:
        return not self.disputed and self.form.is_defect

    @property
    def irrelevant(self) -> bool:
        return not self.disputed and self.relevance is Relevance.DROP


class SectionRuling(BaseModel):
    """What the panel concluded about a section, and who said what."""

    model_config = ConfigDict(extra='ignore')

    corpus: str
    prefix: str
    pages: int = 0
    opinions: list[SectionOpinion] = Field(default_factory=list)
    disputed: bool = False

    @property
    def key(self) -> str:
        return f'{self.corpus}:{self.prefix}'

    @property
    def verdict(self) -> SectionVerdict:
        if self.disputed or not self.opinions:
            return SectionVerdict.MIXED
        return self.opinions[-1].verdict


def needs_a_second_reader(opinion: Opinion) -> bool:
    """Whether this answer is about to cost the user something and should be checked first.

    An `ok`/`keep` answer at any confidence changes nothing, so it is never escalated. Everything
    else either flags a page or admits it could not tell, and both are worth a better model.
    """
    return (
        opinion.form.is_defect or opinion.relevance is Relevance.DROP or opinion.confidence is Confidence.LOW
    )


def settle_page(opinions: list[Opinion]) -> tuple[list[Opinion], bool]:
    """Combine the opinions on one page, saying whether the readers actually agreed.

    Only the two axes that lead to an action are compared. Two readers can call the same defect by
    different names and still agree that the page needs re-extracting; that is not a dispute.
    """
    if len(opinions) < 2:
        return opinions, False

    first, last = opinions[0], opinions[-1]
    disputed = first.form.is_defect != last.form.is_defect or first.relevance is not last.relevance
    return opinions, disputed


def settle_section(opinions: list[SectionOpinion]) -> tuple[list[SectionOpinion], bool]:
    """Combine the opinions on one section.

    A `mixed` answer is not a disagreement with anything: it says the section has to be taken page
    by page, and one reader saying so is enough to make that happen.
    """
    if len(opinions) < 2:
        return opinions, False

    verdicts = {opinion.verdict for opinion in opinions}
    if SectionVerdict.KEEP in verdicts and SectionVerdict.DROP in verdicts:
        return opinions, True
    return opinions, False
