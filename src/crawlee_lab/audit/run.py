"""Running an audit: what gets measured, what gets read, and in which order.

The order is the whole economy of it. Sections are ruled on first, cheaply, because a section ruled
out takes every page under it out of the reckoning before a single one of them is read. Only then
are pages chosen, and only the pages that are still in question: the ones local signals could not
vouch for, the ones sitting in a section nobody could rule on, and a fixed sample of the ones that
looked fine, which is the only thing keeping the heuristics honest.

Nothing is submitted before it is priced, and nothing is priced by guesswork if a key is at hand to
measure with.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from crawlee_lab import inventory
from crawlee_lab.audit import judges, rubric, sampling
from crawlee_lab.audit.panel import (
    Opinion,
    PageRuling,
    SectionOpinion,
    SectionRuling,
    SectionVerdict,
    settle_page,
    settle_section,
)
from crawlee_lab.audit.signals import PageSignals, Shape, inspect
from crawlee_lab.audit.store import AuditState, load_state, save_report, save_state
from crawlee_lab.config import Settings, get_settings
from crawlee_lab.errors import CrawleeLabError
from crawlee_lab.inventory import section_of
from crawlee_lab.versioning.manifest import load_manifest

PAGES_PER_REQUEST = 5
SECTIONS_PER_REQUEST = 8

Report = Callable[[str], None]
Candidate = tuple['CorpusPlan', PageSignals]


@dataclass(slots=True)
class CorpusPlan:
    """One corpus, measured locally, with the work a model would still have to do."""

    name: str
    directory: Path
    pages: list[PageSignals] = field(default_factory=list)
    sections: list[sampling.SectionBrief] = field(default_factory=list)
    control: list[PageSignals] = field(default_factory=list)
    depth: int | None = None
    hashes: set[str] = field(default_factory=set)
    """Every content hash the corpus currently holds, including the pages this run skipped.
    Verdicts are kept against hashes, so this is what says which of them are still about
    something that exists."""
    state: AuditState = field(default_factory=lambda: AuditState(name=''))

    @property
    def suspect(self) -> list[PageSignals]:
        return [page for page in self.pages if page.shape is Shape.SUSPECT]

    @property
    def broken(self) -> list[PageSignals]:
        return [page for page in self.pages if page.shape is Shape.BROKEN]

    @property
    def clean(self) -> list[PageSignals]:
        return [page for page in self.pages if page.shape is Shape.CLEAN]


def plan(
    name: str,
    settings: Settings | None = None,
    only_changed: bool = False,
    depth: int | None = None,
) -> CorpusPlan:
    """Measure a corpus from disk. Costs nothing and needs no key.

    `depth` rolls the section grouping up to the first N path segments. It is the largest single
    lever on what an audit costs: left alone, a deep site like platform.claude.com splits into a
    hundred and fifteen sections, and each one is a question asked of two models.
    """
    settings = settings or get_settings()
    directory = settings.resolve(settings.data_dir) / name
    manifest = load_manifest(directory)
    if manifest is None:
        raise CrawleeLabError(
            f'no snapshot for {name!r} in {directory}. '
            f'Run "crawlee-lab crawl --profile {name} --snapshot" first.'
        )

    state = load_state(directory, name)
    pages = [
        inspect(url, directory / record.path, record.path, record.sha256, record.title)
        for url, record in sorted(manifest.stored.items())
        if record.path and (directory / record.path).is_file()
    ]
    hashes = {page.sha256 for page in pages if page.sha256}
    if only_changed:
        pages = [page for page in pages if state.judged(page.sha256) is None]

    return CorpusPlan(
        name=name,
        directory=directory,
        pages=pages,
        sections=sampling.section_briefs(name, directory, pages, depth),
        control=sampling.control_sample(pages),
        depth=depth,
        hashes=hashes,
        state=state,
    )


def _chunks[Item](items: list[Item], size: int) -> list[list[Item]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def section_requests(
    briefs: list[sampling.SectionBrief], models: list[str]
) -> tuple[list[judges.Request], dict[str, sampling.SectionBrief]]:
    """One request per handful of sections, per model. The cheapest question in the audit."""
    index = {str(position): brief for position, brief in enumerate(briefs)}

    requests: list[judges.Request] = []
    for model in models:
        for number, chunk in enumerate(_chunks(list(index.items()), SECTIONS_PER_REQUEST)):
            entries = [(key, brief.render()) for key, brief in chunk]
            requests.append(
                judges.Request(
                    custom_id=f'sec-{model}-{number}',
                    model=model,
                    system=rubric.SECTION_INSTRUCTIONS,
                    prompt=rubric.section_prompt(entries),
                    schema=rubric.SECTION_VERDICT_SCHEMA,
                    max_tokens=2048,
                )
            )
    return requests, index


def key_pages(chosen: list[Candidate]) -> dict[str, Candidate]:
    """Give every candidate page a short identity that survives a round trip through a model."""
    return {str(position): pair for position, pair in enumerate(chosen)}


def page_requests(
    items: list[tuple[str, Candidate]],
    model: str,
) -> list[judges.Request]:
    """One request per handful of pages, so the rubric is paid once per handful rather than once
    per page. Five is small enough that the verdicts stay about their own page.

    The caller owns the identities. A page sent back to a second model has to carry the same one it
    had the first time, or the two opinions can never be compared.
    """
    requests: list[judges.Request] = []
    for number, chunk in enumerate(_chunks(list(items), PAGES_PER_REQUEST)):
        entries = [
            (key, page.url, sampling.excerpt(_read(item.directory / page.path)))
            for key, (item, page) in chunk
        ]
        requests.append(
            judges.Request(
                custom_id=f'page-{model}-{number}',
                model=model,
                system=rubric.FORM_INSTRUCTIONS,
                prompt=rubric.page_prompt(entries),
                schema=rubric.PAGE_VERDICT_SCHEMA,
                max_tokens=2048,
            )
        )
    return requests


def _read(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='replace') if path.is_file() else ''


def candidates(plans: list[CorpusPlan], rulings: dict[str, SectionRuling]) -> list[Candidate]:
    """The pages still worth a reader once the sections have had their say.

    A page in a section already ruled out is not read: the corpus is losing it either way, and
    paying to learn how it was formatted first would be paying for nothing.
    """
    chosen: list[Candidate] = []

    for item in plans:
        control = {page.url for page in item.control}
        for page in item.pages:
            ruling = rulings.get(f'{item.name}:{section_of(page.url, item.depth)}')
            verdict = ruling.verdict if ruling else SectionVerdict.MIXED

            if verdict is SectionVerdict.DROP:
                continue
            if page.shape is Shape.BROKEN:
                continue
            if page.shape is Shape.SUSPECT or page.url in control or verdict is SectionVerdict.MIXED:
                chosen.append((item, page))

    return chosen


def _opinion(model: str, payload: dict[str, Any]) -> Opinion:
    return Opinion(
        model=model,
        form=payload['form'],
        relevance=payload['relevance'],
        confidence=payload['confidence'],
        reason=payload.get('reason', ''),
    )


def _section_opinion(model: str, payload: dict[str, Any]) -> SectionOpinion:
    return SectionOpinion(
        model=model,
        verdict=payload['verdict'],
        confidence=payload['confidence'],
        reason=payload.get('reason', ''),
    )


def run_batch(client: Any, requests: list[judges.Request], report: Report) -> list[judges.Answer]:
    """Submit one batch, wait for it, and read it back."""
    if not requests:
        return []
    batch_id = judges.submit(client, requests)
    report(f'submitted {len(requests)} requests as {batch_id}')
    judges.wait(client, batch_id, on_tick=lambda status: report(f'  {status}'))
    return list(judges.collect(client, batch_id))


def gather_sections(
    answers: list[judges.Answer],
    index: dict[str, sampling.SectionBrief],
    models: list[str],
) -> dict[str, SectionRuling]:
    """Fold every model's answers about every section into one ruling each."""
    collected: dict[str, list[SectionOpinion]] = {key: [] for key in index}

    for answer in answers:
        if answer.payload is None:
            continue
        model = next((name for name in models if f'-{name}-' in answer.custom_id), '')
        for item in answer.payload.get('sections', []):
            if item['id'] in collected:
                collected[item['id']].append(_section_opinion(model, item))

    rulings: dict[str, SectionRuling] = {}
    for key, opinions in collected.items():
        brief = index[key]
        settled, disputed = settle_section(opinions)
        rulings[brief.key] = SectionRuling(
            corpus=brief.corpus,
            prefix=brief.prefix,
            pages=brief.pages,
            opinions=settled,
            disputed=disputed,
        )
    return rulings


def gather_pages(answers: list[judges.Answer], index: dict[str, Candidate], model: str) -> dict[str, Opinion]:
    """Read one model's page answers back, keyed by the identity the request carried."""
    found: dict[str, Opinion] = {}
    for answer in answers:
        if answer.payload is None:
            continue
        for item in answer.payload.get('pages', []):
            if item['id'] in index:
                found[item['id']] = _opinion(model, item)
    return found


def finish(
    plans: list[CorpusPlan],
    sections: dict[str, SectionRuling],
    index: dict[str, Candidate],
    first: dict[str, Opinion],
    second: dict[str, Opinion],
    spend: dict[str, float],
) -> list[AuditState]:
    """Write every verdict into the state each corpus carries forward.

    Verdicts about content the corpus no longer holds are dropped rather than kept. A page that was
    flagged, fixed and re-crawled has a new hash, and leaving the old verdict behind would have the
    report still naming a URL whose defect was repaired.
    """
    per_corpus: dict[str, AuditState] = {}
    for item in plans:
        state = item.state
        state.rulings = {digest: ruling for digest, ruling in state.rulings.items() if digest in item.hashes}
        state.pages_seen = len(item.hashes)
        state.usd_spent = spend.get(item.name, 0.0)
        state.control = [page.url for page in item.control]
        state.broken = {page.url: page.reasons for page in item.broken}
        state.sections = {key: ruling for key, ruling in sections.items() if ruling.corpus == item.name}
        per_corpus[item.name] = state

    for key, (item, page) in index.items():
        opinions = [opinion for opinion in (first.get(key), second.get(key)) if opinion is not None]
        if not opinions:
            continue
        settled, disputed = settle_page(opinions)
        ruling = PageRuling(
            url=page.url,
            sha256=page.sha256,
            signals=page.reasons,
            opinions=settled,
            disputed=disputed,
        )
        if page.sha256:
            per_corpus[item.name].rulings[page.sha256] = ruling

    return list(per_corpus.values())


def persist(states: list[AuditState], settings: Settings) -> list[Path]:
    """Save each corpus's verdicts and its report."""
    root = settings.resolve(settings.data_dir)
    written: list[Path] = []
    for state in states:
        directory = root / state.name
        save_state(state, directory)
        written.append(save_report(state, directory))
    return written


def targets(names: list[str] | None, settings: Settings) -> list[str]:
    return list(names) if names else inventory.tracked(settings)
