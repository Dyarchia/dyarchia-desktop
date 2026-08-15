"""Command line interface."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlparse

import typer
from rich.console import Console
from rich.table import Table

from crawlee_lab import __version__, registry
from crawlee_lab.config import Settings, get_settings
from crawlee_lab.engine import RunResult, execute
from crawlee_lab.errors import ConfigurationError, CrawleeLabError
from crawlee_lab.models import CrawlerKind, ExtractionMode, LinkStrategy, OutputFormat, RunSpec
from crawlee_lab.profiles.loader import save_profile_file
from crawlee_lab.profiles.schema import ProfileSpec
from crawlee_lab.recon import Recon, inspect_url
from crawlee_lab.storage.exporters import slugify_url
from crawlee_lab.storage.snapshots import SnapshotResult
from crawlee_lab.versioning.diffing import ChangeKind, load_report
from crawlee_lab.versioning.report import summary_line
from crawlee_lab.versioning.vcs import commit_snapshot
from crawlee_lab.watch import (
    WatchResult,
    save_report,
    sweep,
    watchable,
)

app = typer.Typer(
    name='crawlee-lab',
    help='On-demand web scraping toolkit built on Crawlee for Python.',
    no_args_is_help=True,
    add_completion=False,
)
console = Console()
error_console = Console(stderr=True)

DEFAULT_BLOCKED_RESOURCES = ['image', 'media', 'font']


def derive_name(urls: list[str]) -> str:
    """Name a run after its first target so its output files are recognisable."""
    host = urlparse(urls[0]).netloc.replace('www.', '') or 'run'
    return slugify_url(urls[0], fallback=host)[:80]


def parse_selectors(pairs: list[str] | None) -> dict[str, str]:
    """Turn repeated `--select name=css` flags into a mapping."""
    selectors: dict[str, str] = {}
    for pair in pairs or []:
        name, separator, expression = pair.partition('=')
        if not separator or not name.strip() or not expression.strip():
            raise typer.BadParameter(f'expected NAME=SELECTOR, got {pair!r}', param_hint='--select')
        selectors[name.strip()] = expression.strip()
    return selectors


def explicit_parameters(ctx: typer.Context) -> set[str]:
    """Names of the options the user actually typed, as opposed to the ones that defaulted.

    This is what lets `--profile` supply the baseline while a flag on the same command line still
    wins, without a flag that happens to equal its default silently overriding the profile.

    The source is compared by name rather than by identity because Typer vendors its own copy of
    Click, so the enum member it returns is not the one `import click` would give us.
    """
    sources = {name: ctx.get_parameter_source(name) for name in ctx.params}
    return {name for name, source in sources.items() if source is not None and source.name == 'COMMANDLINE'}


def _percentage(rate: float) -> str:
    """Never round a rate with failures in it up to a clean 100%."""
    exact = f'{rate:.0%}'
    return exact if rate in (0.0, 1.0) or exact not in ('0%', '100%') else f'{rate:.2%}'


def render_summary(result: RunResult) -> None:
    table = Table(title=f'run: {result.spec.name}', title_style='bold', show_header=False, box=None)
    table.add_row('crawler', result.spec.crawler.value)
    table.add_row('extraction', result.spec.extract.value)
    table.add_row('items', str(len(result.items)))
    table.add_row('failures', str(len(result.failures)))
    table.add_row('success rate', _percentage(result.success_rate))
    if result.statistics is not None:
        table.add_row('runtime', str(result.statistics.crawler_runtime))
    for path in result.outputs[:5]:
        table.add_row('output', str(path))
    if len(result.outputs) > 5:
        table.add_row('output', f'... and {len(result.outputs) - 5} more')
    console.print(table)

    for failure in result.failures[:10]:
        error_console.print(f'[yellow]failed[/yellow] {failure.url} -> {failure.error}')
    if len(result.failures) > 10:
        error_console.print(f'[yellow]... and {len(result.failures) - 10} more failures[/yellow]')


def render_recon(recon: Recon) -> None:
    table = Table(title=f'inspect: {recon.url}', title_style='bold', show_header=False, box=None)
    table.add_row('status', str(recon.status_code))
    table.add_row('content type', recon.content_type or 'unknown')
    table.add_row('title', recon.title or '-')
    table.add_row('html size', f'{recon.html_bytes:,} bytes')
    table.add_row('links found', str(recon.link_count))
    table.add_row('robots allows', 'yes' if recon.robots_allows else 'no')
    if recon.crawl_delay is not None:
        table.add_row('crawl delay', f'{recon.crawl_delay}s')
    table.add_row('sitemaps', '\n'.join(recon.sitemaps) if recon.sitemaps else '-')
    table.add_row('markdown variant', recon.markdown_url or '-')
    table.add_row('static content', f'{recon.static_content_chars:,} chars')
    if recon.rendered_content_chars is not None:
        table.add_row('rendered content', f'{recon.rendered_content_chars:,} chars')
    if recon.spa_markers:
        table.add_row('spa markers', ', '.join(recon.spa_markers))
    table.add_row('recommendation', recon.recommendation)
    console.print(table)

    for note in recon.notes:
        error_console.print(f'[yellow]note[/yellow] {note}')

    if recon.robots_allows is False:
        error_console.print('[bold red]robots.txt disallows this URL for our user agent[/bold red]')


@app.command()
def crawl(
    ctx: typer.Context,
    urls: Annotated[list[str] | None, typer.Argument(help='One or more start URLs.')] = None,
    profile: Annotated[
        str | None, typer.Option('--profile', help='Run a saved profile instead of ad-hoc URLs.')
    ] = None,
    save_profile: Annotated[
        str | None, typer.Option('--save-profile', help='Save this run as a reusable profile.')
    ] = None,
    name: Annotated[str | None, typer.Option('--name', help='Run name, used for output filenames.')] = None,
    crawler: Annotated[
        CrawlerKind, typer.Option('--crawler', help='Which Crawlee crawler to drive.')
    ] = CrawlerKind.ADAPTIVE,
    extract: Annotated[
        ExtractionMode, typer.Option('--extract', help='What to pull out of each page.')
    ] = ExtractionMode.AUTO,
    select: Annotated[
        list[str] | None,
        typer.Option('--select', help='Field selector as NAME=CSS. Repeatable. Supports all: and @attr.'),
    ] = None,
    depth: Annotated[int, typer.Option('--depth', min=0, help='How many link hops to follow.')] = 0,
    max_pages: Annotated[
        int | None, typer.Option('--max-pages', min=1, help='Stop after this many pages.')
    ] = None,
    include: Annotated[
        list[str] | None, typer.Option('--follow', help='Pattern a URL must match to be followed.')
    ] = None,
    exclude: Annotated[
        list[str] | None, typer.Option('--exclude', help='Pattern a URL must not match to be followed.')
    ] = None,
    strategy: Annotated[
        LinkStrategy, typer.Option('--strategy', help='How far link following may wander.')
    ] = LinkStrategy.SAME_HOSTNAME,
    link_selector: Annotated[
        str, typer.Option('--link-selector', help='CSS selector for links to follow.')
    ] = 'a',
    formats: Annotated[
        list[OutputFormat] | None, typer.Option('--format', help='Output format. Repeatable.')
    ] = None,
    output_dir: Annotated[Path | None, typer.Option('--output-dir', help='Where to write output.')] = None,
    user_agent: Annotated[str | None, typer.Option('--user-agent', help='Override the User-Agent.')] = None,
    stealth: Annotated[
        bool, typer.Option('--stealth', help='Impersonate a real browser instead of identifying honestly.')
    ] = False,
    ignore_robots: Annotated[
        bool, typer.Option('--ignore-robots', help='Do not honour robots.txt. Use only on targets you own.')
    ] = False,
    concurrency: Annotated[
        int | None, typer.Option('--concurrency', min=1, help='Maximum parallel requests.')
    ] = None,
    rate: Annotated[float | None, typer.Option('--rate', min=1, help='Maximum requests per minute.')] = None,
    retries: Annotated[int | None, typer.Option('--retries', min=0, help='Retries per request.')] = None,
    headful: Annotated[bool, typer.Option('--headful', help='Show the browser window.')] = False,
    block: Annotated[
        list[str] | None, typer.Option('--block', help='Resource types to block in browser mode.')
    ] = None,
    keep_boilerplate: Annotated[
        bool,
        typer.Option('--keep-boilerplate', help='Do not strip the header and footer every page shares.'),
    ] = False,
    snapshot: Annotated[
        bool, typer.Option('--snapshot', help='Store page content under data/ and report what changed.')
    ] = False,
    commit: Annotated[
        bool, typer.Option('--commit', help='Commit the snapshot to git when it changed.')
    ] = False,
    verbose: Annotated[bool, typer.Option('--verbose', '-v', help='Verbose logging.')] = False,
) -> None:
    """Scrape URLs directly, or run a saved profile."""
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO)
    settings = get_settings()

    fields_by_option = {
        'name': ('name', name),
        'crawler': ('crawler', crawler),
        'extract': ('extract', extract),
        'select': ('selectors', parse_selectors(select)),
        'depth': ('max_depth', depth),
        'max_pages': ('max_pages', max_pages),
        'include': ('include', include or []),
        'exclude': ('exclude', exclude or []),
        'strategy': ('strategy', strategy),
        'link_selector': ('link_selector', link_selector),
        'formats': ('formats', formats or [OutputFormat.JSON]),
        'user_agent': ('user_agent', user_agent),
        'stealth': ('stealth', stealth),
        'ignore_robots': ('respect_robots', not ignore_robots),
        'concurrency': ('max_concurrency', concurrency),
        'rate': ('max_requests_per_minute', rate),
        'retries': ('max_request_retries', retries),
        'headful': ('headless', not headful),
        'block': ('block_resources', block if block is not None else DEFAULT_BLOCKED_RESOURCES),
        'snapshot': ('snapshot', snapshot),
        'keep_boilerplate': ('trim_boilerplate', not keep_boilerplate),
    }

    try:
        spec = _build_spec(ctx, profile, urls, fields_by_option, settings)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    if ignore_robots:
        error_console.print('[bold yellow]robots.txt is being ignored for this run[/bold yellow]')

    if save_profile is not None:
        saved = save_profile_file(
            ProfileSpec.model_validate({**spec.model_dump(), 'name': save_profile}),
            settings.resolve(settings.profiles_dir),
        )
        console.print(f'saved profile [bold]{save_profile}[/bold] to {saved}')

    if output_dir is not None:
        settings = settings.model_copy(update={'output_dir': output_dir})

    try:
        result = asyncio.run(execute(spec, settings))
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    render_summary(result)

    if result.snapshot is not None:
        console.print(f'snapshot: {summary_line(result.snapshot.report)}')
        console.print(f'  stored in {result.snapshot.directory}')
        if commit and result.snapshot.persisted:
            _commit_snapshot(result.snapshot, settings)
        elif commit:
            console.print('  nothing to commit, the target has not changed')
    elif commit:
        error_console.print('[yellow]--commit does nothing without --snapshot[/yellow]')

    if not result.items:
        raise typer.Exit(code=1)


def _commit_snapshot(snapshot: SnapshotResult, settings: Settings) -> None:
    message = f'snapshot({snapshot.manifest.name}): {summary_line(snapshot.report)}'
    try:
        revision = commit_snapshot(snapshot.directory, message, settings.project_root)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        return

    if revision is None:
        console.print('  nothing to commit, the target has not changed')
    else:
        console.print(f'  committed {revision[:12]}')


def _build_spec(
    ctx: typer.Context,
    profile: str | None,
    urls: list[str] | None,
    fields_by_option: dict[str, tuple[str, Any]],
    settings: Settings,
) -> RunSpec:
    """Resolve the run: a profile plus explicit overrides, or a purely ad-hoc set of flags."""
    values: dict[str, Any] = dict(fields_by_option.values())

    if profile is not None:
        typed = explicit_parameters(ctx)
        overrides = {field: value for option, (field, value) in fields_by_option.items() if option in typed}
        if urls:
            overrides['start_urls'] = urls
        return registry.load(profile, settings).to_run_spec(**overrides)

    if not urls:
        raise ConfigurationError('give at least one URL, or select a saved profile with --profile')

    values['start_urls'] = urls
    values['name'] = values['name'] or derive_name(urls)
    return RunSpec.model_validate(values)


@app.command(name='inspect')
def inspect_command(
    url: Annotated[str, typer.Argument(help='URL to probe.')],
    render: Annotated[
        bool, typer.Option('--render', help='Also render in a browser to confirm the diagnosis.')
    ] = False,
) -> None:
    """Report what a crawl against this target would have to deal with."""
    try:
        recon = asyncio.run(inspect_url(url, render=render))
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    render_recon(recon)


@app.command(name='diff')
def diff_command(
    name: Annotated[str, typer.Argument(help='Profile or run name that was snapshotted.')],
    unified: Annotated[
        bool, typer.Option('--unified', '-u', help='Show the unified diff for modified pages.')
    ] = False,
    limit: Annotated[int, typer.Option('--limit', min=1, help='Maximum entries per section.')] = 20,
) -> None:
    """Show what changed on a target the last time it was snapshotted."""
    settings = get_settings()
    directory = settings.resolve(settings.data_dir) / name

    report = load_report(directory)
    if report is None:
        error_console.print(
            f'[bold red]no change report for {name!r} in {directory}. '
            f'Run "crawlee-lab crawl --profile {name} --snapshot" first.[/bold red]'
        )
        raise typer.Exit(code=1)

    console.print(f'[bold]{report.name}[/bold] at {report.generated_at.isoformat()}')
    console.print(summary_line(report))

    for kind in (ChangeKind.ADDED, ChangeKind.REMOVED, ChangeKind.MODIFIED):
        entries = report.of_kind(kind)
        if not entries:
            continue

        console.print(f'\n[bold]{kind.value}[/bold] ({len(entries)})')
        for change in entries[:limit]:
            console.print(f'  {change.title or change.url}')
            console.print(f'    {change.url}', style='dim')
            if unified and change.diff:
                console.print(change.diff, style='dim')
        if len(entries) > limit:
            console.print(f'  ... and {len(entries) - limit} more')

    if report.failed:
        console.print(f'\n[bold yellow]failed[/bold yellow] ({len(report.failed)})')
        for url in report.failed[:limit]:
            console.print(f'  {url}')

    console.print(f'\nfull history: git log -- {directory}')


@app.command(name='profiles')
def profiles_command() -> None:
    """List the saved profiles this project knows about."""
    try:
        found = registry.discover()
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    if not found:
        console.print('no profiles found')
        return

    table = Table(title='profiles', title_style='bold')
    table.add_column('name', style='bold')
    table.add_column('crawler')
    table.add_column('target')
    table.add_column('description')

    for profile in found.values():
        target = profile.start_urls[0] if profile.start_urls else '-'
        table.add_row(profile.name, profile.crawler.value, target, profile.description or '-')

    console.print(table)


@app.command(name='watch')
def watch_command(
    names: Annotated[
        list[str] | None,
        typer.Argument(help='Profiles to sweep. Defaults to every profile that asks for snapshots.'),
    ] = None,
    commit: Annotated[
        bool, typer.Option('--commit', help='Commit each snapshot that moved, when data is versioned.')
    ] = False,
) -> None:
    """Sweep every tracked target once and report whether a human needs to look.

    Built for the scheduler rather than for a person: the exit code is the answer. 0 means nothing
    changed, 10 means something did, 1 means a target failed and the sweep cannot vouch for itself.
    """
    settings = get_settings()
    selected = list(names) if names else watchable(settings)

    if not selected:
        error_console.print(
            '[bold red]no profiles ask for snapshots, so there is nothing to watch[/bold red]'
        )
        raise typer.Exit(code=1)

    result = asyncio.run(sweep(selected, settings))
    document = save_report(result, settings)

    if commit:
        _commit_sweep(result, settings)

    render_watch(result, document)
    raise typer.Exit(code=result.exit_code)


def _commit_sweep(result: WatchResult, settings: Settings) -> None:
    directory = settings.resolve(settings.data_dir)
    message = f'watch: {result.headline}'
    try:
        revision = commit_snapshot(directory, message, settings.project_root)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        return

    if revision is not None:
        console.print(f'committed {revision[:12]}')


def render_watch(result: WatchResult, document: Path) -> None:
    table = Table(title='watch', title_style='bold')
    table.add_column('target', style='bold')
    table.add_column('pages', justify='right')
    table.add_column('outcome')

    for entry in result.entries:
        if entry.failed:
            outcome = f'[bold red]{entry.error}[/bold red]'
        elif entry.changed:
            outcome = f'[bold yellow]{entry.summary}[/bold yellow]'
        else:
            outcome = entry.summary or 'no change'
        table.add_row(entry.name, str(entry.pages), outcome)

    console.print(table)
    console.print(result.headline)
    console.print(f'report: {document}', style='dim')


@app.command()
def version() -> None:
    """Print the crawlee-lab version."""
    console.print(__version__)


if __name__ == '__main__':
    app()
