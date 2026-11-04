"""A first profile for a new target, measured from the site rather than left to the defaults.

The panel's New target used to write the name, the URL and nothing else, so everything that decides
how big a target is came from `RunSpec` defaults: no scope, no page cap, the browser-backed adaptive
crawler. A pasted sitemap became the whole site in every language; a pasted page became that page
alone. Neither is what somebody adding "the docs under /guide/" meant, and nothing on screen said
which of the two they were about to get.

So a draft starts from a scope, which is the folder the pasted URL sits in unless one is given, and
asks the site which index lists the pages inside it. The `llms.txt` its publisher keeps for models
wins over the sitemaps when both list the scope: sitemaps go stale first, and a stale entry is a
404 that counts against the run's success rate. The pages listed inside the scope are counted, so
the profile says how big the target is before anything is crawled. Only when no index lists anything does the
draft follow links, and then always inside the scope and under a page cap. The crawler comes from
the same recon `inspect` runs: a markdown twin is fetched with plain HTTP, a page that needs
JavaScript gets a browser, and everything else is read from its HTML.

Every network read here has a short timeout, because the panel waits for the answer and the shell
gives a call sixty seconds. A source that does not answer in time is left out and the draft says so.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx

from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.llms import INDEX_NAME, Fetch, pages_listed, sitemap_keys
from dyarchia_crawlee.models import CrawlerKind, ExtractionMode, OutputFormat, RunSpec
from dyarchia_crawlee.recon import MARKDOWN_SUFFIX, inspect_url

TIMEOUT = 10.0
INDEX_BUDGET = 20.0
FOLLOW_DEPTH = 3
FOLLOW_CAP = 500
DEFAULTS: dict[str, Any] = {
    'formats': [OutputFormat.JSONL.value],
    'max_concurrency': 4,
    'max_requests_per_minute': 120,
    'min_success_rate': 0.95,
}

_SLUG = re.compile(r'[^a-z0-9]+')


@dataclass(slots=True)
class Draft:
    """A proposed profile, without the fields only a person can choose, and why it looks so."""

    url: str
    scope: str
    suggested_name: str
    profile: dict[str, Any] = field(default_factory=dict)
    pages: int | None = None
    notes: list[str] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {
            'url': self.url,
            'scope': self.scope,
            'suggestedName': self.suggested_name,
            'profile': self.profile,
            'pages': self.pages,
            'notes': self.notes,
        }


def scope_of(url: str) -> str:
    """The folder a URL sits in: itself when it ends in a slash, its parent otherwise."""
    parsed = urlparse(url)
    path = parsed.path or '/'
    folder = path if path.endswith('/') else path[: path.rfind('/') + 1]
    return urlunparse(parsed._replace(path=folder, params='', query='', fragment=''))


def scope_pattern(scope: str) -> str | None:
    """The include pattern for a scope, or None when the scope is the whole host.

    The folder itself matches as well as everything under it, so `/docs/` keeps `/docs` and
    `/docs/index`, which a substring or a `**` glob would each get wrong one way or the other.
    """
    parsed = urlparse(scope)
    folder = parsed.path.rstrip('/')
    if not folder:
        return None
    base = urlunparse(parsed._replace(path=folder, params='', query='', fragment=''))
    return f're:^{re.escape(base)}(/|$)'


def suggested_name(scope: str) -> str:
    """A profile name from the host and the scope's folder, in the shape the catalogue uses."""
    parsed = urlparse(scope)
    host = (parsed.hostname or '').removeprefix('www.').removeprefix('docs.')
    stem = host.rsplit('.', 1)[0] if host.count('.') else host
    words = [stem, *(part for part in parsed.path.split('/') if part)]
    return _SLUG.sub('-', '-'.join(words).lower()).strip('-')[:60] or 'target'


def _matcher(pattern: str | None) -> re.Pattern[str] | None:
    return re.compile(pattern.removeprefix('re:')) if pattern else None


def _inside(url: str, matcher: re.Pattern[str] | None) -> bool:
    return matcher is None or matcher.match(url) is not None


def _fetcher(client: httpx.AsyncClient) -> Fetch:
    async def fetch(url: str) -> str | None:
        try:
            response = await client.get(url)
        except httpx.HTTPError:
            return None
        if response.status_code >= 400 or 'html' in response.headers.get('content-type', ''):
            return None
        return response.text

    return fetch


async def _count_llms(index: str, pattern: str | None, fetch: Fetch) -> int:
    spec = RunSpec(name='draft', llms_txt=[index], include=[pattern] if pattern else [])
    return len(await pages_listed(spec, fetch))


async def _count_sitemaps(sitemaps: list[str], pattern: str | None, fetch: Fetch) -> int:
    matcher = _matcher(pattern)
    listed = await sitemap_keys(sitemaps, fetch)
    return sum(1 for page in listed if _inside(page, matcher))


async def _within_budget(work: Any) -> int | None:
    try:
        return int(await asyncio.wait_for(work, INDEX_BUDGET))
    except TimeoutError:
        return None


def _origin(url: str) -> str:
    parsed = urlparse(url)
    return f'{parsed.scheme}://{parsed.netloc}'


async def draft_profile(
    url: str,
    scope: str | None = None,
    settings: Settings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> Draft:
    """Measure a target and propose the profile that crawls the scope, all of it and nothing else."""
    settings = settings or get_settings()
    recon = await inspect_url(url, settings, request_timeout=TIMEOUT, transport=transport)

    given_index = urlparse(url).path.endswith(INDEX_NAME)
    given_sitemap = recon.sitemap_kind is not None
    chosen_scope = scope.strip() if scope and scope.strip() else None
    if chosen_scope is None:
        chosen_scope = _origin(url) + '/' if given_index or given_sitemap else scope_of(recon.url)
    pattern = scope_pattern(chosen_scope)

    draft = Draft(url=url, scope=chosen_scope, suggested_name=suggested_name(chosen_scope))
    profile: dict[str, Any] = {}

    headers = {'User-Agent': settings.user_agent}
    async with httpx.AsyncClient(
        headers=headers, follow_redirects=True, timeout=TIMEOUT, transport=transport
    ) as client:
        fetch = _fetcher(client)
        llms_index = url if given_index else f'{_origin(recon.url)}/{INDEX_NAME}'
        sitemaps = recon.sitemaps if not given_index else []
        listed_llms, listed_sitemaps = await asyncio.gather(
            _within_budget(_count_llms(llms_index, pattern, fetch)),
            _within_budget(_count_sitemaps(sitemaps, pattern, fetch)) if sitemaps else _zero(),
        )

    where = f'under {chosen_scope}' if pattern else f'on {urlparse(chosen_scope).netloc}'
    if listed_llms:
        profile['llms_txt'] = [llms_index]
        draft.notes.append(f'{llms_index} lists {listed_llms} pages {where}')
    elif listed_llms is None:
        draft.notes.append(f'{llms_index} did not answer within {INDEX_BUDGET:.0f}s, so it is left out')

    if listed_sitemaps and listed_llms:
        draft.notes.append(
            f'the sitemaps list {listed_sitemaps} pages {where}; llms.txt is the list the publisher '
            'keeps for this reader, so it is the one used. Add sitemap_urls to take the union'
        )
        listed_sitemaps = 0
    elif listed_sitemaps:
        profile['sitemap_urls'] = list(sitemaps)
        draft.notes.append(f'the sitemaps list {listed_sitemaps} pages {where}')
    elif listed_sitemaps is None:
        draft.notes.append(
            f'{", ".join(sitemaps)} did not answer within {INDEX_BUDGET:.0f}s, so it is left out'
        )

    if listed_llms or listed_sitemaps:
        draft.pages = listed_llms or listed_sitemaps
        if pattern:
            profile['include'] = [pattern]
    else:
        profile['start_urls'] = [recon.url]
        profile['max_depth'] = FOLLOW_DEPTH
        profile['max_pages'] = FOLLOW_CAP
        if pattern:
            profile['include'] = [pattern]
        draft.notes.append(
            f'no index lists a page {where}, so links are followed {FOLLOW_DEPTH} hops from the URL, '
            f'{where}, up to {FOLLOW_CAP} pages'
        )

    if recon.markdown_url is not None:
        profile['fetch_suffix'] = MARKDOWN_SUFFIX
        profile['crawler'] = CrawlerKind.HTTP.value
        profile['extract'] = ExtractionMode.TEXT.value
        draft.notes.append(f'pages publish a markdown twin, such as {recon.markdown_url}')
    elif recon.needs_browser:
        profile['crawler'] = CrawlerKind.PLAYWRIGHT.value
        draft.notes.append('content arrives with JavaScript, so a browser reads it')
    else:
        profile['crawler'] = CrawlerKind.PARSEL.value
        profile['extract'] = ExtractionMode.AUTO.value

    profile.update(DEFAULTS)
    if recon.robots_allows is False:
        draft.notes.append('robots.txt disallows this URL for this crawler, so the run will skip it')
    if recon.crawl_delay is not None:
        draft.notes.append(f'robots.txt asks for {recon.crawl_delay}s between requests; the run honours it')

    draft.profile = profile
    return draft


async def _zero() -> int:
    return 0
