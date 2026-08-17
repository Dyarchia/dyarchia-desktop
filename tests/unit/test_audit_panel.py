"""When a second opinion is bought, and what happens when the two disagree."""

from __future__ import annotations

from crawlee_lab.audit.panel import (
    Confidence,
    Form,
    Opinion,
    Relevance,
    SectionOpinion,
    SectionVerdict,
    needs_a_second_reader,
    settle_page,
    settle_section,
)

FAST = 'claude-haiku-4-5'
CAREFUL = 'claude-sonnet-5'


def opinion(
    model: str = FAST,
    form: Form = Form.OK,
    relevance: Relevance = Relevance.KEEP,
    confidence: Confidence = Confidence.HIGH,
) -> Opinion:
    return Opinion(model=model, form=form, relevance=relevance, confidence=confidence, reason='')


def section(model: str, verdict: SectionVerdict) -> SectionOpinion:
    return SectionOpinion(model=model, verdict=verdict, confidence=Confidence.HIGH, reason='')


def test_a_page_nobody_is_complaining_about_costs_one_reader() -> None:
    assert not needs_a_second_reader(opinion())


def test_a_flagged_defect_is_read_again() -> None:
    assert needs_a_second_reader(opinion(form=Form.MDX_RESIDUE))


def test_a_page_about_to_be_excluded_is_read_again() -> None:
    assert needs_a_second_reader(opinion(relevance=Relevance.DROP))


def test_an_unsure_answer_is_read_again() -> None:
    assert needs_a_second_reader(opinion(confidence=Confidence.LOW))


def test_two_readers_who_agree_settle_it() -> None:
    opinions = [opinion(form=Form.NAV_DUMP), opinion(CAREFUL, form=Form.MDX_RESIDUE)]
    _, disputed = settle_page(opinions)
    assert not disputed


def test_disagreement_about_whether_a_page_is_broken_is_a_dispute() -> None:
    opinions = [opinion(form=Form.MDX_RESIDUE), opinion(CAREFUL, form=Form.OK)]
    _, disputed = settle_page(opinions)
    assert disputed


def test_disagreement_about_whether_a_page_belongs_is_a_dispute() -> None:
    opinions = [opinion(relevance=Relevance.DROP), opinion(CAREFUL, relevance=Relevance.KEEP)]
    _, disputed = settle_page(opinions)
    assert disputed


def test_one_reader_is_never_in_dispute_with_itself() -> None:
    _, disputed = settle_page([opinion(form=Form.EMPTY)])
    assert not disputed


def test_keep_against_drop_needs_an_arbiter() -> None:
    opinions = [section(FAST, SectionVerdict.KEEP), section(CAREFUL, SectionVerdict.DROP)]
    _, disputed = settle_section(opinions)
    assert disputed


def test_mixed_is_not_a_disagreement() -> None:
    """One reader saying a section has to be taken page by page is enough to make that happen."""
    opinions = [section(FAST, SectionVerdict.KEEP), section(CAREFUL, SectionVerdict.MIXED)]
    _, disputed = settle_section(opinions)
    assert not disputed
