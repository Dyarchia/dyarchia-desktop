"""The reconnaissance heuristics, which decide what a target needs before anything is crawled."""

from __future__ import annotations

import httpx

from euripontida_crawlee.models import CrawlerKind
from euripontida_crawlee.recon import Recon, _check_markdown_variant

URL = 'https://site.example/page'


def test_a_page_with_prose_needs_no_browser() -> None:
    recon = Recon(url=URL, static_content_chars=5_000, runs_scripts=True)
    assert recon.needs_browser is False
    assert recon.recommended_crawler is CrawlerKind.BEAUTIFULSOUP


def test_a_framework_shell_needs_a_browser() -> None:
    recon = Recon(url=URL, static_content_chars=120, spa_markers=['id="root"'])
    assert recon.needs_browser is True
    assert recon.recommended_crawler is CrawlerKind.PLAYWRIGHT


def test_an_empty_page_that_runs_scripts_needs_a_browser() -> None:
    """A framework marker is not the only way to build a page client side.

    A page that ships almost no text and does ship a script is the JavaScript case whether or not
    it was written with a framework the marker list happens to know about. Recommending a browser
    when one was not needed costs a few seconds; not recommending one costs an empty scrape.
    """
    recon = Recon(url=URL, static_content_chars=6, runs_scripts=True)
    assert recon.needs_browser is True
    assert recon.recommended_crawler is CrawlerKind.PLAYWRIGHT


def test_an_empty_page_without_scripts_is_just_empty() -> None:
    recon = Recon(url=URL, static_content_chars=6)
    assert recon.needs_browser is False


def test_a_markdown_variant_outranks_every_other_signal() -> None:
    recon = Recon(url=URL, static_content_chars=6, runs_scripts=True, markdown_url=f'{URL}.md')
    assert recon.recommended_crawler is CrawlerKind.HTTP
    assert 'markdown variant' in recon.recommendation


def test_a_render_probe_beats_the_guess() -> None:
    """Once both numbers are known, guessing from markup stops being necessary."""
    recon = Recon(url=URL, static_content_chars=50, rendered_content_chars=4_000, runs_scripts=False)
    assert recon.needs_browser is True


def _serving_markdown_at(*urls: str) -> httpx.MockTransport:
    published = set(urls)

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) in published:
            return httpx.Response(200, text='# Page', headers={'content-type': 'text/markdown'})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


async def _variant_of(url: str, transport: httpx.MockTransport) -> str | None:
    recon = Recon(url=url)
    async with httpx.AsyncClient(transport=transport) as client:
        await _check_markdown_variant(client, url, recon)
    return recon.markdown_url


async def test_a_twin_is_found_where_the_extension_is_replaced() -> None:
    """The probe has to offer what the crawler fetches, or inspect contradicts the run it advises.

    developer.salesforce.com lists `guide/page.html` and serves the twin at `guide/page.md`.
    Appending alone asks for `page.html.md`, which answers 404, so every page of that site was
    reported as having no markdown variant and recommended a browser-free HTML crawler instead.
    """
    served = _serving_markdown_at('https://site.example/guide/page.md')
    assert await _variant_of('https://site.example/guide/page.html', served) == (
        'https://site.example/guide/page.md'
    )


async def test_a_twin_is_still_found_where_the_suffix_is_appended() -> None:
    served = _serving_markdown_at('https://site.example/page.md')
    assert await _variant_of('https://site.example/page', served) == 'https://site.example/page.md'


async def test_a_section_root_is_probed_rather_than_skipped() -> None:
    served = _serving_markdown_at('https://site.example/guide/index.md')
    assert await _variant_of('https://site.example/guide/', served) == ('https://site.example/guide/index.md')


async def test_a_page_without_a_twin_reports_none() -> None:
    assert await _variant_of('https://site.example/page.html', _serving_markdown_at()) is None


async def test_a_page_that_is_already_markdown_is_not_probed() -> None:
    served = _serving_markdown_at('https://site.example/page.md')
    assert await _variant_of('https://site.example/page.md', served) is None
