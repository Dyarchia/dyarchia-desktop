"""Command line interface."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Annotated
from urllib.parse import urlparse

import typer
from rich.console import Console
from rich.table import Table

from crawlee_lab import __version__
from crawlee_lab.config import get_settings
from crawlee_lab.engine import RunResult, execute
from crawlee_lab.errors import CrawleeLabError
from crawlee_lab.models import CrawlerKind, ExtractionMode, LinkStrategy, OutputFormat, RunSpec
from crawlee_lab.storage.exporters import slugify_url

app = typer.Typer(
    name='crawlee-lab',
    help='On-demand web scraping toolkit built on Crawlee for Python.',
    no_args_is_help=True,
    add_completion=False,
)
console = Console()
error_console = Console(stderr=True)


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


def render_summary(result: RunResult) -> None:
    table = Table(title=f'run: {result.spec.name}', title_style='bold', show_header=False, box=None)
    table.add_row('crawler', result.spec.crawler.value)
    table.add_row('extraction', result.spec.extract.value)
    table.add_row('items', str(len(result.items)))
    table.add_row('failures', str(len(result.failures)))
    table.add_row('success rate', f'{result.success_rate:.0%}')
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


@app.command()
def crawl(
    urls: Annotated[list[str], typer.Argument(help='One or more start URLs.')],
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
        list[str] | None, typer.Option('--follow', help='Glob a URL must match to be followed.')
    ] = None,
    exclude: Annotated[
        list[str] | None, typer.Option('--exclude', help='Glob a URL must not match to be followed.')
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
    verbose: Annotated[bool, typer.Option('--verbose', '-v', help='Verbose logging.')] = False,
) -> None:
    """Scrape one or more URLs."""
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO)

    settings = get_settings()
    spec = RunSpec(
        name=name or derive_name(urls),
        start_urls=urls,
        crawler=crawler,
        extract=extract,
        selectors=parse_selectors(select),
        max_depth=depth,
        max_pages=max_pages,
        include=include or [],
        exclude=exclude or [],
        strategy=strategy,
        link_selector=link_selector,
        formats=formats or [OutputFormat.JSON],
        user_agent=user_agent,
        stealth=stealth,
        respect_robots=not ignore_robots,
        max_concurrency=concurrency,
        max_requests_per_minute=rate,
        max_request_retries=retries,
        headless=not headful,
        block_resources=block if block is not None else ['image', 'media', 'font'],
    )

    if ignore_robots:
        error_console.print('[bold yellow]robots.txt is being ignored for this run[/bold yellow]')

    if output_dir is not None:
        settings = settings.model_copy(update={'output_dir': output_dir})

    try:
        result = asyncio.run(execute(spec, settings))
    except CrawleeLabError as error:
        error_console.print(f'[bold red]{error}[/bold red]')
        raise typer.Exit(code=1) from error

    render_summary(result)
    if not result.items:
        raise typer.Exit(code=1)


@app.command()
def version() -> None:
    """Print the crawlee-lab version."""
    console.print(__version__)


if __name__ == '__main__':
    app()
