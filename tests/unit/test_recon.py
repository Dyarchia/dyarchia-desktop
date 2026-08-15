"""The reconnaissance heuristics, which decide what a target needs before anything is crawled."""

from __future__ import annotations

from crawlee_lab.models import CrawlerKind
from crawlee_lab.recon import Recon

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
