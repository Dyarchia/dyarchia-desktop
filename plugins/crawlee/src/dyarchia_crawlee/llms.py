"""Seeding a run from the index a publisher keeps for language models.

A sitemap is what a site keeps for search engines, and it is not kept as carefully as the pages it
lists. Probed 2026-10-03, developers.openai.com listed 1,120 pages in its sitemap and 90 more only in
its `llms.txt`, the per-model guides among them; learn.chatgpt.com left out the Codex CLI's whole
command reference. The `llms.txt` is the index those publishers write for exactly this reader, so a
profile may name it beside the sitemap and the run takes the union.

The index is markdown: every link in it is a candidate, a link to another `llms.txt` on the same host
is followed as part of the index (OpenAI splits its own into six), and a link to anything that is
not a page, an OpenAPI document, a `llms-full.txt`, a JSON card, is left out. A link to a page's
markdown twin is taken back to the page, since the run decides how to fetch it and the manifest is
keyed by the page. What the sitemap already lists is dropped, compared without a trailing slash, so
`/agents/` from one and `/agents/index.md` from the other are one page and not two.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse, urlunparse

from crawlee import Glob

from dyarchia_crawlee.models import RunSpec
from dyarchia_crawlee.patterns import to_matchers
from dyarchia_crawlee.urls import collapse_slashes

Fetch = Callable[[str], Awaitable[str | None]]

INDEX_NAME = 'llms.txt'
TWIN = '.md'
NOT_PAGES = ('.txt', '.json', '.yaml', '.yml', '.xml')
NOT_PAGE_DIRECTORIES = ('/.well-known/',)
MAX_INDEXES = 32
SITEMAP_DEPTH = 2

_LINK = re.compile(r'https?://[^\s<>"\'`)\]]+')
_LOC = re.compile(r'<loc>\s*([^<\s]+)\s*</loc>')


def links(text: str) -> list[str]:
    """Every absolute URL in a markdown index, with trailing sentence punctuation removed."""
    return [match.rstrip('.,;:!?') for match in _LINK.findall(text)]


def is_index(url: str) -> bool:
    return urlparse(url).path.endswith(INDEX_NAME)


def page_of(url: str, suffix: str | None) -> str | None:
    """The page a link stands for, or None when it is not a page at all.

    An index links pages by their markdown twin whether or not the profile fetches twins, so `.md`
    is taken off even for a profile that reads HTML. A query is taken off too: learn.chatgpt.com
    links `?surface=ide`, and the page without it already carries every surface.
    """
    parsed = urlparse(url)._replace(fragment='', query='')
    path = parsed.path
    if path.endswith(NOT_PAGES) or any(part in path for part in NOT_PAGE_DIRECTORIES):
        return None
    for ending in dict.fromkeys(filter(None, (suffix, TWIN))):
        twin = f'/index{ending}'
        if path.endswith(twin):
            path = path[: -len(twin)] + '/'
            break
        if path.endswith(ending):
            path = path[: -len(ending)]
            break
    return collapse_slashes(urlunparse(parsed._replace(path=path)))


def key(url: str) -> str:
    """How two spellings of one page compare: no fragment, no query, no trailing slash."""
    parsed = urlparse(collapse_slashes(url))
    return urlunparse(parsed._replace(fragment='', query='', path=parsed.path.rstrip('/')))


def _matches(url: str, matchers: list[re.Pattern[str] | Glob]) -> bool:
    for matcher in matchers:
        pattern = matcher.regexp if isinstance(matcher, Glob) else matcher
        if pattern.match(url):
            return True
    return False


async def pages_listed(spec: RunSpec, fetch: Fetch) -> list[str]:
    """The pages the profile's indexes list, inside its include and outside its exclude, in order."""
    include = to_matchers(spec.include)
    exclude = to_matchers(spec.exclude)
    queue = list(spec.llms_txt)
    seen_indexes: set[str] = set()
    found: dict[str, str] = {}

    while queue and len(seen_indexes) < MAX_INDEXES:
        index = queue.pop(0)
        if index in seen_indexes:
            continue
        seen_indexes.add(index)
        text = await fetch(index)
        if not text:
            continue
        host = urlparse(index).hostname
        for link in links(text):
            if urlparse(link).hostname != host:
                continue
            if is_index(link):
                queue.append(link)
                continue
            page = page_of(link, spec.fetch_suffix)
            if page is None:
                continue
            if include and not _matches(page, include):
                continue
            if exclude and _matches(page, exclude):
                continue
            found.setdefault(key(page), page)

    return list(found.values())


async def sitemap_keys(sitemaps: list[str], fetch: Fetch) -> set[str]:
    """Every page the sitemaps list, as keys, following sitemap indexes two levels down."""
    keys: set[str] = set()
    queue = [(url, 0) for url in sitemaps]
    while queue:
        url, depth = queue.pop(0)
        body = await fetch(url)
        if not body:
            continue
        locations = _LOC.findall(body)
        if '<sitemapindex' in body:
            if depth < SITEMAP_DEPTH:
                queue.extend((location, depth + 1) for location in locations)
            continue
        keys.update(key(location) for location in locations)
    return keys


async def extra_pages(spec: RunSpec, fetch: Fetch) -> list[str]:
    """The pages only the indexes know about: what the run adds to its sitemap and start URLs."""
    if not spec.llms_txt:
        return []
    listed = await pages_listed(spec, fetch)
    known = await sitemap_keys(spec.sitemap_urls, fetch) if spec.sitemap_urls else set()
    known.update(key(url) for url in spec.start_urls)
    return [page for page in listed if key(page) not in known]
