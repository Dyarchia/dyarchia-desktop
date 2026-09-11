"""Command line interface."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlparse

import typer
from rich.console import Console
from rich.table import Table

from dyarchia_crawlee import __version__, digest, inventory, locking, registry, state
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.engine import RunResult, execute
from dyarchia_crawlee.errors import ConfigurationError, CrawleeLabError
from dyarchia_crawlee.models import CrawlerKind, ExtractionMode, LinkStrategy, OutputFormat, RunSpec
from dyarchia_crawlee.profiles import loader as profile_loader
from dyarchia_crawlee.profiles.schema import ProfileSpec
from dyarchia_crawlee.recon import Recon, inspect_url
from dyarchia_crawlee.storage.exporters import slugify_url
from dyarchia_crawlee.storage.snapshots import SnapshotResult
from dyarchia_crawlee.versioning.diffing import ChangeKind, load_report
from dyarchia_crawlee.versioning.report import summary_line
from dyarchia_crawlee.versioning.vcs import commit_path, repository_root
from dyarchia_crawlee.watch import (
    EXIT_BUSY,
    WatchResult,
    save_report,
    sweep,
    watchable,
)

app = typer.Typer(
    name='dyarchia-crawlee',
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
    group: Annotated[
        str | None, typer.Option('--group', help='Folder to keep this target under, in data/ and output/.')
    ] = None,
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
        'group': ('group', group),
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
        try:
            saved = profile_loader.save_profile(
                ProfileSpec.model_validate({**spec.model_dump(), 'name': save_profile}),
                settings.resolve(settings.profiles_dir),
            )
        except CrawleeLabError as error:
            error_console.print(f'[bold red]{error}[/bold red]')
            raise typer.Exit(code=1) from error

        console.print(f'profile [bold]{save_profile}[/bold]: {saved}')
        if not saved.versioned:
            error_console.print(
                '[yellow]this profile is not versioned, so an edit to it leaves no trace[/yellow]'
            )

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
        for warning in result.snapshot.warnings:
            error_console.print(f'[bold yellow]{warning}[/bold yellow]')
        if commit and result.snapshot.persisted:
            _commit_path(result.snapshot)
        elif commit:
            console.print('  nothing to commit, the target has not changed')
    elif commit:
        error_console.print('[yellow]--commit does nothing without --snapshot[/yellow]')

    if not result.items:
        raise typer.Exit(code=1)


def _commit_path(snapshot: SnapshotResult) -> None:
    message = f'snapshot({snapshot.manifest.name}): {summary_line(snapshot.report)}'
    try:
        revision = commit_path(snapshot.directory, message)
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


def render_inventory(found: inventory.TargetInventory, depth: int | None, limit: int) -> None:
    title = f'{found.name}: {found.pages} pages, {inventory.human_bytes(found.bytes)}'
    if not found.entries:
        console.print(f'[bold]{found.name}[/bold] holds no stored pages')
        return

    sections = found.sections(depth)
    table = Table(title=title, title_style='bold')
    table.add_column('section', style='bold')
    table.add_column('pages', justify='right')
    table.add_column('size', justify='right')
    table.add_column('share', justify='right')
    for section in sections[:limit]:
        table.add_row(
            section.prefix,
            str(section.pages),
            inventory.human_bytes(section.bytes),
            _percentage(section.pages / found.pages),
        )
    console.print(table)

    if len(sections) > limit:
        console.print(f'... and {len(sections) - limit} more sections')
    if found.failed:
        error_console.print(f'[yellow]{found.failed} pages failed in the last run[/yellow]')


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
    directory = inventory.directory_for(name, settings)

    report = load_report(directory)
    if report is None:
        error_console.print(
            f'[bold red]no change report for {name!r} in {directory}. '
            f'Run "dyarchia-crawlee crawl --profile {name} --snapshot" first.[/bold red]'
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

    console.print(f'\n{history_hint(directory)}', style='dim')


def history_hint(directory: Path) -> str:
    """How to read this corpus's history, in a form that works from where the user is standing.

    The corpora live in their own repository, so `git log -- <absolute path>` run from the tool's
    checkout is refused for naming a path outside it. The command has to enter the repository that
    owns the corpus and address it from there.
    """
    root = repository_root(directory)
    if root is None:
        return 'no git history: this corpus is not inside a repository'
    try:
        relative = directory.relative_to(root)
    except ValueError:
        return f'full history: git -C {root} log'
    return f'full history: git -C {root} log -- {relative.as_posix()}'


@app.command(name='digest')
def digest_command(
    names: Annotated[
        list[str] | None,
        typer.Argument(help='Targets to digest. Defaults to every snapshotted target.'),
    ] = None,
    group: Annotated[
        str | None, typer.Option('--group', help='Digest only the targets in this group.')
    ] = None,
    changed: Annotated[
        bool, typer.Option('--changed', help='Leave out the targets that did not change.')
    ] = False,
    as_json: Annotated[
        bool, typer.Option('--json', help='Emit the digest as JSON instead of markdown.')
    ] = False,
    diffs: Annotated[
        bool, typer.Option('--diffs/--no-diffs', help='Include the diff of every changed page.')
    ] = True,
    limit: Annotated[int, typer.Option('--limit', min=1, help='Maximum pages listed per section.')] = 50,
    out: Annotated[
        Path | None, typer.Option('--out', help='Write to this file instead of standard output.')
    ] = None,
) -> None:
    """Bundle the last snapshot's changes into something a later step can read.

    What changed, what the change was, and which file holds the page now. Reorderings are listed
    but never counted, so a table that shuffled its rows does not read as news.
    """
    settings = get_settings()
    try:
        bundle = digest.build(list(names) if names else None, settings, group)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    if changed:
        bundle.targets = bundle.changed

    rendered = (
        digest.render_json(bundle) if as_json else digest.render_markdown(bundle, diffs=diffs, limit=limit)
    )

    if out is None:
        print(rendered)
        return

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(rendered, encoding='utf-8', newline='\n')
    console.print(f'{bundle.headline}')
    console.print(f'written to {out}', style='dim')


def render_state(snapshot: state.State) -> None:
    for repository in snapshot.repositories:
        # Printed above the table rather than as its title: rich clips a title to the table's own
        # width, and the table is only as wide as its narrowest content allows.
        console.print(f'[bold]{repository.root}[/bold]')
        if repository.versioned:
            dirty = ' [bold yellow]dirty[/bold yellow]' if repository.dirty else ''
            console.print(f'{repository.head}{dirty}', style='dim')
        else:
            console.print('not versioned', style='dim')

        table = Table()
        table.add_column('corpus', style='bold', overflow='fold')
        table.add_column('group', overflow='fold')
        table.add_column('pages', justify='right')
        table.add_column('size', justify='right')
        table.add_column('last change')
        table.add_column('state')

        for corpus in repository.corpora:
            if corpus.error:
                outcome = f'[bold red]{corpus.error}[/bold red]'
            elif corpus.stale:
                outcome = '[dim]no change last sweep[/dim]'
            elif corpus.changed:
                moved = f'{corpus.added}+ {corpus.removed}- {corpus.modified}~'
                outcome = f'[bold yellow]{moved}[/bold yellow]'
            elif corpus.reordered:
                outcome = f'[dim]{corpus.reordered} reordered only[/dim]'
            else:
                outcome = '[dim]quiet[/dim]'
            seen = corpus.generated_at.date().isoformat() if corpus.generated_at else '-'
            table.add_row(
                corpus.name,
                corpus.group or '-',
                f'{corpus.pages:,}',
                inventory.human_bytes(corpus.bytes),
                seen,
                outcome,
            )
        console.print(table)
        console.print()

    console.print(snapshot.headline)


@app.command(name='state')
def state_command(
    repository: Annotated[
        list[Path] | None,
        typer.Option('--repository', help='A corpus repository to read. Repeatable.'),
    ] = None,
    as_json: Annotated[
        bool, typer.Option('--json', help='Emit the state as JSON instead of a table.')
    ] = False,
) -> None:
    """Report what every corpus is holding and when it last moved.

    One answer for every repository asked about, so whatever reads it next does not have to walk the
    manifests, rediscover the group convention, or decide for itself whether a change report is
    current. Defaults to the repository this machine's settings name.
    """
    settings = get_settings()
    try:
        snapshot = state.build(list(repository) if repository else None, settings)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    if as_json:
        print(state.render_json(snapshot))
        return
    render_state(snapshot)


@app.command(name='profiles')
def profiles_command(
    as_json: Annotated[
        bool, typer.Option('--json', help='Emit the profiles as JSON instead of a table.')
    ] = False,
) -> None:
    """List the saved profiles this project knows about."""
    try:
        found = registry.discover()
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    if as_json:
        print(
            json.dumps(
                [
                    {
                        'name': profile.name,
                        'group': profile.group,
                        'description': profile.description,
                        'crawler': profile.crawler.value,
                        'snapshot': profile.snapshot,
                        'urls': [*profile.start_urls, *profile.sitemap_urls],
                    }
                    for profile in found.values()
                ],
                indent=2,
                ensure_ascii=False,
            )
        )
        return

    if not found:
        console.print('no profiles found')
        return

    table = Table(title='profiles', title_style='bold')
    table.add_column('name', style='bold')
    table.add_column('crawler')
    table.add_column('target')
    table.add_column('description')

    for profile in found.values():
        target = next(iter([*profile.start_urls, *profile.sitemap_urls]), '-')
        table.add_row(profile.name, profile.crawler.value, target, profile.description or '-')

    console.print(table)


profile_app = typer.Typer(
    help='Read and write one profile, as the text it is on disk.',
    no_args_is_help=True,
    add_completion=False,
)
app.add_typer(profile_app, name='profile')


@profile_app.command(name='show')
def profile_show(
    name: Annotated[str, typer.Argument(help='The profile to print.')],
) -> None:
    """Print one profile as YAML, exactly as it is written.

    Verbatim where there is a file, comments and all. A profile carries the measurements that
    justify its own rules in comments the model does not hold, so anything that reads a profile in
    order to edit it has to be given the document rather than a rendering of the model behind it.

    The profile the package ships as a Python module has no file. That one is rendered, and says so
    on stderr rather than in the document, so a redirect still produces a profile and not a warning.
    """
    settings = get_settings()
    directory = settings.resolve(settings.profiles_dir)
    for suffix in profile_loader.PROFILE_SUFFIXES:
        path = directory / f'{name}{suffix}'
        if path.is_file():
            print(path.read_text(encoding='utf-8'), end='')
            return

    try:
        profile = registry.load(name, settings)
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    error_console.print(f'[yellow]{name} has no file in {directory}, so this is rendered[/yellow]')
    print(profile_loader.render_profile(profile), end='')


@profile_app.command(name='save')
def profile_save(
    name: Annotated[str, typer.Argument(help='The profile to write. Created if it does not exist.')],
    allow_untracked: Annotated[
        bool,
        typer.Option('--allow-untracked', help='Save even where the profile cannot be committed.'),
    ] = False,
) -> None:
    """Write a profile from the YAML on standard input, exactly as given, and commit it.

    The text is the document. It is parsed only to refuse a broken one before it lands: an unknown
    key, a profile that names no source, or a name that would not be found again are all rejected
    with nothing written.

    A profile lives with the corpus it describes, in a repository that tracks it, so a save that
    leaves no commit behind is a change nobody can find again. This refuses one by default and says
    what stands in the way; `--allow-untracked` is for a corpus that is deliberately not versioned.
    """
    settings = get_settings()
    try:
        saved = profile_loader.save_profile_text(
            name,
            sys.stdin.read(),
            settings.resolve(settings.profiles_dir),
            require_commit=not allow_untracked,
        )
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    console.print(str(saved))


@app.command(name='urls')
def urls_command(
    names: Annotated[
        list[str] | None,
        typer.Argument(help='Targets to report on. Defaults to every snapshotted target.'),
    ] = None,
    plain: Annotated[
        bool,
        typer.Option('--list', '-l', help='Print one URL per line instead of the section breakdown.'),
    ] = False,
    depth: Annotated[
        int | None,
        typer.Option('--depth', min=1, help='Roll sections up to the first N path segments.'),
    ] = None,
    limit: Annotated[int, typer.Option('--limit', min=1, help='Maximum sections shown per target.')] = 20,
) -> None:
    """Show what a target is holding, by section, so bulk worth excluding is easy to spot."""
    settings = get_settings()
    wanted = list(names or inventory.tracked(settings))
    if not wanted:
        console.print('no snapshotted targets found')
        return

    collected: list[inventory.TargetInventory] = []
    for name in wanted:
        found = inventory.collect(name, settings)
        if found is None:
            directory = inventory.directory_for(name, settings)
            error_console.print(
                f'[bold red]no snapshot for {name!r} in {directory}. '
                f'Run "dyarchia-crawlee crawl --profile {name} --snapshot" first.[/bold red]'
            )
            raise typer.Exit(code=1)
        collected.append(found)

    for found in collected:
        if plain:
            for entry in found.entries:
                console.print(entry.url, soft_wrap=True, highlight=False, markup=False)
        else:
            render_inventory(found, depth=depth, limit=limit)


@app.command(name='watch')
def watch_command(
    names: Annotated[
        list[str] | None,
        typer.Argument(help='Profiles to sweep. Defaults to every profile that asks for snapshots.'),
    ] = None,
    group: Annotated[
        str | None, typer.Option('--group', help='Sweep only the profiles that belong to this group.')
    ] = None,
    commit: Annotated[
        bool, typer.Option('--commit', help='Commit each snapshot that moved, when data is versioned.')
    ] = False,
) -> None:
    """Sweep every tracked target once and report whether a human needs to look.

    Built for the scheduler rather than for a person: the exit code is the answer. 0 means nothing
    changed, 10 means something did, 1 means a target failed and the sweep cannot vouch for itself.
    A group narrows the sweep to its own corpus, so one scheduled round does not quietly adopt
    every target added since.

    One round over a group at a time. A second one exits 30 without crawling and says who holds it,
    because the scheduled task, a button and a person at a prompt can all fire at once and the only
    thing two concurrent rounds achieve is doing the same forty minutes twice.
    """
    settings = get_settings()

    if names and group is not None:
        error_console.print(
            '[bold red]name the targets or name a group, not both: '
            'a group is already a set of them[/bold red]'
        )
        raise typer.Exit(code=1)

    selected = list(names) if names else watchable(settings, group)

    if not selected:
        whose = (
            f'no profiles in group {group!r} ask for snapshots' if group else 'no profiles ask for snapshots'
        )
        error_console.print(f'[bold red]{whose}, so there is nothing to watch[/bold red]')
        raise typer.Exit(code=1)

    key = group or locking.EVERYTHING
    try:
        with locking.hold(key, f'watch {" ".join(selected)}'[:120], settings):
            result = asyncio.run(sweep(selected, settings))
            document = save_report(result, settings)
    except locking.RoundInProgressError as busy:
        error_console.print(f'[bold yellow]{busy}[/bold yellow]')
        raise typer.Exit(code=EXIT_BUSY) from busy

    if commit:
        _commit_sweep(result, settings)

    render_watch(result, document)
    raise typer.Exit(code=result.exit_code)


def _commit_sweep(result: WatchResult, settings: Settings) -> None:
    directory = settings.resolve(settings.data_dir)
    message = f'watch: {result.headline}'
    try:
        revision = commit_path(directory, message)
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
    """Print the dyarchia-crawlee version."""
    console.print(__version__)


if __name__ == '__main__':
    app()
