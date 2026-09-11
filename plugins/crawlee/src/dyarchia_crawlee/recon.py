"""Reconnaissance of a target before committing to a crawl.

Answers the questions that decide how a run should be configured: is crawling allowed, is there a
sitemap to seed from, is the content in the HTML or does it arrive with JavaScript, and is there a
cheaper representation of the page than its HTML.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.extraction.dom import SoupAdapter
from dyarchia_crawlee.extraction.strategies import main_content
from dyarchia_crawlee.urls import suffix_candidates

MARKDOWN_SUFFIX = '.md'
_TIMEOUT = 20.0
_SPA_MARKERS = ('__NEXT_DATA__', 'id="root"', 'id="__nuxt"', 'ng-version', 'data-reactroot')
_MIN_STATIC_CONTENT = 400
_BARELY_ANY_CONTENT = 200
_SCRIPT_TAG = re.compile(r'<script[\s>]', re.IGNORECASE)


@dataclass(slots=True)
class Recon:
    """What a single reconnaissance pass learned about a target."""

    url: str
    status_code: int | None = None
    content_type: str | None = None
    html_bytes: int = 0
    title: str | None = None
    robots_allows: bool | None = None
    crawl_delay: float | None = None
    sitemaps: list[str] = field(default_factory=list)
    markdown_url: str | None = None
    static_content_chars: int = 0
    rendered_content_chars: int | None = None
    link_count: int = 0
    spa_markers: list[str] = field(default_factory=list)
    runs_scripts: bool = False
    notes: list[str] = field(default_factory=list)

    @property
    def needs_browser(self) -> bool:
        if self.rendered_content_chars is not None:
            return self.rendered_content_chars > self.static_content_chars * 2
        if self.static_content_chars < _MIN_STATIC_CONTENT and self.spa_markers:
            return True
        return self.static_content_chars < _BARELY_ANY_CONTENT and self.runs_scripts

    @property
    def recommendation(self) -> str:
        if self.markdown_url is not None:
            return 'a markdown variant exists, fetch it directly with --crawler http'
        if self.needs_browser:
            return 'content arrives with JavaScript, use --crawler playwright or adaptive'
        return 'content is in the HTML, use --crawler beautifulsoup or parsel'


async def _fetch(client: httpx.AsyncClient, url: str) -> httpx.Response | None:
    try:
        return await client.get(url)
    except httpx.HTTPError:
        return None


async def _check_robots(client: httpx.AsyncClient, url: str, user_agent: str, recon: Recon) -> None:
    parsed = urlparse(url)
    robots_url = f'{parsed.scheme}://{parsed.netloc}/robots.txt'
    response = await _fetch(client, robots_url)

    if response is None or response.status_code >= 400:
        recon.notes.append(f'no robots.txt at {robots_url}, treating the target as open')
        recon.robots_allows = True
        return

    parser = RobotFileParser()
    parser.parse(response.text.splitlines())
    recon.robots_allows = parser.can_fetch(user_agent, url)
    recon.crawl_delay = _as_float(parser.crawl_delay(user_agent))
    recon.sitemaps = list(parser.site_maps() or [])


def _as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


async def _check_sitemap_fallback(client: httpx.AsyncClient, url: str, recon: Recon) -> None:
    if recon.sitemaps:
        return
    parsed = urlparse(url)
    candidate = f'{parsed.scheme}://{parsed.netloc}/sitemap.xml'
    response = await _fetch(client, candidate)
    if response is not None and response.status_code < 400 and 'xml' in _content_type(response):
        recon.sitemaps = [candidate]


async def _check_markdown_variant(client: httpx.AsyncClient, url: str, recon: Recon) -> None:
    if urlparse(url).path.endswith(MARKDOWN_SUFFIX):
        return

    for candidate in suffix_candidates(url, MARKDOWN_SUFFIX):
        response = await _fetch(client, candidate)
        if response is None or response.status_code >= 400:
            continue
        if 'markdown' in _content_type(response) or 'text/plain' in _content_type(response):
            recon.markdown_url = candidate
            return


def _content_type(response: httpx.Response) -> str:
    return str(response.headers.get('content-type', '')).lower()


async def _render(url: str, user_agent: str, recon: Recon) -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await (await browser.new_context(user_agent=user_agent)).new_page()
            await page.goto(url, wait_until='networkidle')
            html = await page.content()
        finally:
            await browser.close()

    recon.rendered_content_chars = len(main_content(html, url) or SoupAdapter.from_html(html).text())


async def inspect_url(
    url: str,
    settings: Settings | None = None,
    *,
    render: bool = False,
) -> Recon:
    """Probe a target and report what a run against it would have to deal with."""
    settings = settings or get_settings()
    recon = Recon(url=url)
    headers = {'User-Agent': settings.user_agent}

    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=_TIMEOUT) as client:
        await _check_robots(client, url, settings.user_agent, recon)

        response = await _fetch(client, url)
        if response is None:
            recon.notes.append('the target did not respond')
            return recon

        recon.status_code = response.status_code
        recon.content_type = _content_type(response) or None
        recon.html_bytes = len(response.content)
        recon.url = str(response.url)

        if 'html' in (recon.content_type or ''):
            dom = SoupAdapter.from_html(response.text)
            recon.title = dom.title()
            recon.link_count = len(dom.hrefs(recon.url))
            recon.static_content_chars = len(main_content(response.text, recon.url) or '')
            recon.spa_markers = [marker for marker in _SPA_MARKERS if marker in response.text]
            recon.runs_scripts = _SCRIPT_TAG.search(response.text) is not None

        await asyncio.gather(
            _check_sitemap_fallback(client, recon.url, recon),
            _check_markdown_variant(client, recon.url, recon),
        )

    if render:
        await _render(recon.url, settings.user_agent, recon)

    return recon
