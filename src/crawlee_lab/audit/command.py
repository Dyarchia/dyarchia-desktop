"""The audit as a person runs it: measure, price, ask, report.

Kept apart from the CLI module because the ordering here is the substance of the feature rather
than an interface detail. What a reader needs to see, and in what order, is: what the corpus looks
like without spending anything, what spending would cost, and only then what was found.
"""

from __future__ import annotations

from rich.console import Console
from rich.table import Table

from crawlee_lab.audit import judges, run, store
from crawlee_lab.audit.panel import Opinion, needs_a_second_reader
from crawlee_lab.audit.signals import Shape
from crawlee_lab.config import Settings
from crawlee_lab.errors import CrawleeLabError

console = Console()
error_console = Console(stderr=True)


def render_local(plans: list[run.CorpusPlan]) -> None:
    """What the corpus looks like before a single request is made."""
    table = Table(title='local signals', title_style='bold')
    table.add_column('target', style='bold')
    table.add_column('pages', justify='right')
    table.add_column('clean', justify='right')
    table.add_column('suspect', justify='right')
    table.add_column('broken', justify='right')
    table.add_column('sections', justify='right')

    for item in plans:
        table.add_row(
            item.name,
            str(len(item.pages)),
            str(len(item.clean)),
            f'[yellow]{len(item.suspect)}[/yellow]' if item.suspect else '0',
            f'[red]{len(item.broken)}[/red]' if item.broken else '0',
            str(len(item.sections)),
        )

    console.print(table)


def render_broken(plans: list[run.CorpusPlan], limit: int = 20) -> None:
    """Name the pages the local signals condemned outright.

    These need no reader and cost nothing to find, so they are reported even on a dry run and even
    with no key in the environment. They are the part of the answer the toolkit can always give.
    """
    found = [(item.name, page) for item in plans for page in item.broken]
    if not found:
        return

    console.print(f'\n[bold red]malformed on local signals alone ({len(found)})[/bold red]')
    for name, page in found[:limit]:
        console.print(f'  {page.url}', soft_wrap=True, highlight=False, markup=False)
        console.print(f'    {name}: {page.reasons[0]}', style='dim')
    if len(found) > limit:
        console.print(f'  ... and {len(found) - limit} more', style='dim')


def render_projection(floor: judges.Projection, ceiling: judges.Projection) -> None:
    """What the model tiers would cost, bounded from both sides.

    The floor assumes every section can be ruled on and only the pages local signals could not
    vouch for are read. The ceiling assumes no section can be ruled on at all and every page is
    read one at a time. The bill lands between the two, nearer the floor on a corpus that is
    organised and nearer the ceiling on one that is not.
    """
    table = Table(title='projected cost, batched at half price', title_style='bold')
    table.add_column('case', style='bold')
    table.add_column('requests', justify='right')
    table.add_column('input tokens', justify='right')
    table.add_column('output tokens', justify='right')
    table.add_column('USD', justify='right')

    for label, projection in (('sections settle it', floor), ('every page read', ceiling)):
        table.add_row(
            label,
            str(projection.requests),
            f'{projection.input_tokens:,}',
            f'{projection.output_tokens:,}',
            f'{projection.usd:.2f}',
        )

    console.print(table)
    source = 'measured through the token counter' if floor.measured else 'estimated from a character ratio'
    console.print(f'token counts {source}', style='dim')


def render_findings(states: list[store.AuditState]) -> int:
    """The answer the audit was run for: which URLs, and what to do about them."""
    table = Table(title='findings', title_style='bold')
    table.add_column('target', style='bold')
    for bucket in store.BUCKETS:
        table.add_column(bucket.heading, justify='right')

    flagged = 0
    for state in sorted(states, key=lambda item: item.name):
        sorted_buckets = store.buckets(state)
        counts = [len(sorted_buckets[bucket.name]) for bucket in store.BUCKETS]
        flagged += sum(counts[:3])
        table.add_row(state.name, *(str(count) for count in counts))

    console.print(table)
    for bucket in store.BUCKETS[:3]:
        console.print(f'{bucket.heading}: {bucket.action}', style='dim')
    return flagged


def print_bucket(states: list[store.AuditState], wanted: str) -> None:
    """One URL per line and nothing else, for piping into an exclude rule."""
    known = {bucket.name for bucket in store.BUCKETS}
    if wanted not in known:
        raise CrawleeLabError(f'unknown bucket {wanted!r}; pick one of {", ".join(sorted(known))}')

    for state in sorted(states, key=lambda item: item.name):
        for url, _ in store.buckets(state)[wanted]:
            console.print(url, soft_wrap=True, highlight=False, markup=False)


def projections(
    plans: list[run.CorpusPlan], settings: Settings, client: object | None = None
) -> tuple[judges.Projection, judges.Projection]:
    """Price the two ends of what this audit could cost."""
    briefs = [brief for item in plans for brief in item.sections]
    section_reqs, _ = run.section_requests(briefs, [settings.audit_fast_model, settings.audit_careful_model])

    least = [(item, page) for item in plans for page in item.suspect]
    least += [(item, page) for item in plans for page in item.control if page.shape is Shape.CLEAN]
    most = run.candidates(plans, {})

    floor_reqs = run.page_requests(list(run.key_pages(least).items()), settings.audit_fast_model)
    ceiling_reqs = run.page_requests(list(run.key_pages(most).items()), settings.audit_fast_model)

    return (
        judges.estimate(section_reqs + floor_reqs, client),
        judges.estimate(section_reqs + ceiling_reqs, client),
    )


def _attribute(
    total: float, plans: list[run.CorpusPlan], index: dict[str, run.Candidate]
) -> dict[str, float]:
    """Split one bill across the corpora that caused it, by how many pages each one contributed."""
    judged = {item.name: 0 for item in plans}
    for item, _ in index.values():
        judged[item.name] += 1
    everything = sum(judged.values()) or 1
    return {name: total * count / everything for name, count in judged.items()}


def _guard(projection: judges.Projection, ceiling: float) -> None:
    if projection.usd > ceiling:
        raise CrawleeLabError(
            f'this round projects {projection.usd:.2f} USD, above the {ceiling:.2f} USD left in the '
            f'budget. Raise it with --budget, or narrow the audit to fewer targets.'
        )


def execute(plans: list[run.CorpusPlan], settings: Settings, budget: float) -> list[store.AuditState]:
    """Ask the models, in the order that keeps the bill down."""
    client = judges.build_client(settings.anthropic_api_key)
    fast = settings.audit_fast_model
    careful = settings.audit_careful_model
    arbiter = settings.audit_arbiter_model

    briefs = [brief for item in plans for brief in item.sections]
    section_reqs, section_index = run.section_requests(briefs, [fast, careful])
    _guard(judges.estimate(section_reqs, client), budget)

    console.print(f'[bold]ruling on {len(briefs)} sections[/bold]')
    answers = run.run_batch(client, section_reqs, console.print)
    sections = run.gather_sections(answers, section_index, [fast, careful])
    spent = judges.spent(answers, fast)

    contested = [ruling for ruling in sections.values() if ruling.disputed]
    if contested:
        console.print(f'[bold]breaking {len(contested)} tied sections[/bold]')
        tied = [brief for brief in briefs if any(brief.key == ruling.key for ruling in contested)]
        tie_reqs, tie_index = run.section_requests(tied, [arbiter])
        tie_answers = run.run_batch(client, tie_reqs, console.print)
        for key, ruling in run.gather_sections(tie_answers, tie_index, [arbiter]).items():
            if key in sections and ruling.opinions:
                sections[key].opinions.extend(ruling.opinions)
                sections[key].disputed = False
        spent += judges.spent(tie_answers, arbiter)

    index = run.key_pages(run.candidates(plans, sections))
    page_reqs = run.page_requests(list(index.items()), fast)
    _guard(judges.estimate(page_reqs, client), budget - spent)

    console.print(f'[bold]reading {len(index)} pages[/bold]')
    page_answers = run.run_batch(client, page_reqs, console.print)
    first = run.gather_pages(page_answers, index, fast)
    spent += judges.spent(page_answers, fast)

    escalate = {key: pair for key, pair in index.items() if _escalates(first.get(key))}
    second: dict[str, Opinion] = {}
    if escalate:
        console.print(f'[bold]checking {len(escalate)} flagged pages again[/bold]')
        again = run.page_requests(list(escalate.items()), careful)
        second_answers = run.run_batch(client, again, console.print)
        second = run.gather_pages(second_answers, escalate, careful)
        spent += judges.spent(second_answers, careful)

    console.print(f'spent {spent:.2f} USD')
    return run.finish(plans, sections, index, first, second, _attribute(spent, plans, index))


def _escalates(opinion: Opinion | None) -> bool:
    return opinion is not None and needs_a_second_reader(opinion)
