"""The profile New target proposes: a scope, the index that lists it, and the crawler it needs."""

from __future__ import annotations

import re

import httpx

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.drafting import draft_profile, scope_of, scope_pattern, suggested_name
from dyarchia_crawlee.models import RunSpec

PARAGRAPH = '<p>Documentation prose that is plainly in the HTML.</p>'
PROSE = f'<html><body><main>{PARAGRAPH * 40}</main></body></html>'

LLMS = """# Site

- [A](https://site.example/docs/a.md): inside the scope
- [B](https://site.example/docs/guide/b.md): inside the scope
- [C](https://site.example/blog/c.md): outside it
"""

SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://site.example/docs/a</loc></url>
  <url><loc>https://site.example/docs/old</loc></url>
  <url><loc>https://site.example/blog/c</loc></url>
</urlset>
"""


def _site(*, llms: bool = True, sitemap: bool = True, twins: bool = True) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == '/robots.txt' and sitemap:
            return httpx.Response(
                200, text='User-agent: *\nAllow: /\nSitemap: https://site.example/sitemap.xml\n'
            )
        if path == '/sitemap.xml' and sitemap:
            return httpx.Response(200, text=SITEMAP, headers={'content-type': 'application/xml'})
        if path == '/llms.txt' and llms:
            return httpx.Response(200, text=LLMS, headers={'content-type': 'text/markdown'})
        if path.endswith('.md') and twins:
            return httpx.Response(200, text='# Page', headers={'content-type': 'text/markdown'})
        if path.startswith('/docs/') and not path.endswith('.md'):
            return httpx.Response(200, text=PROSE, headers={'content-type': 'text/html'})
        return httpx.Response(404, text='<html>not here</html>', headers={'content-type': 'text/html'})

    return httpx.MockTransport(handler)


def test_the_scope_is_the_folder_the_url_sits_in() -> None:
    assert scope_of('https://site.example/docs/guide/page.html') == 'https://site.example/docs/guide/'
    assert scope_of('https://site.example/docs/') == 'https://site.example/docs/'
    assert scope_of('https://site.example') == 'https://site.example/'


def test_a_scope_keeps_its_folder_and_what_is_under_it_and_nothing_beside_it() -> None:
    pattern = scope_pattern('https://site.example/docs/')
    assert pattern is not None
    matcher = re.compile(pattern.removeprefix('re:'))
    assert matcher.match('https://site.example/docs')
    assert matcher.match('https://site.example/docs/a/b')
    assert not matcher.match('https://site.example/docs-old/a')
    assert not matcher.match('https://site.example/blog/c')


def test_the_whole_host_needs_no_pattern() -> None:
    assert scope_pattern('https://site.example/') is None


def test_a_name_comes_from_the_host_and_the_folder() -> None:
    assert suggested_name('https://docs.mistral.ai/') == 'mistral'
    assert suggested_name('https://antigravity.google/docs/') == 'antigravity-docs'


async def test_llms_txt_wins_and_the_draft_counts_only_the_scope(settings: Settings) -> None:
    proposal = await draft_profile('https://site.example/docs/a', settings=settings, transport=_site())
    assert proposal.scope == 'https://site.example/docs/'
    assert proposal.pages == 2
    assert proposal.profile['llms_txt'] == ['https://site.example/llms.txt']
    assert 'sitemap_urls' not in proposal.profile
    assert proposal.profile['include'] == [scope_pattern('https://site.example/docs/')]
    assert (proposal.profile['crawler'], proposal.profile['fetch_suffix']) == ('http', '.md')
    assert any('sitemaps list 2 pages' in note for note in proposal.notes)
    RunSpec.model_validate({'name': 'x', **proposal.profile})


async def test_a_sitemap_seeds_the_draft_when_there_is_no_llms_txt(settings: Settings) -> None:
    proposal = await draft_profile(
        'https://site.example/docs/a', settings=settings, transport=_site(llms=False, twins=False)
    )
    assert proposal.profile['sitemap_urls'] == ['https://site.example/sitemap.xml']
    assert proposal.pages == 2
    assert proposal.profile['crawler'] == 'parsel'
    assert 'fetch_suffix' not in proposal.profile


async def test_without_an_index_links_are_followed_inside_the_scope_under_a_cap(settings: Settings) -> None:
    proposal = await draft_profile(
        'https://site.example/docs/a',
        settings=settings,
        transport=_site(llms=False, sitemap=False, twins=False),
    )
    assert proposal.profile['start_urls'] == ['https://site.example/docs/a']
    assert proposal.profile['max_depth'] > 0
    assert proposal.profile['max_pages'] > 0
    assert proposal.profile['include'] == [scope_pattern('https://site.example/docs/')]
    assert proposal.pages is None
    RunSpec.model_validate({'name': 'x', **proposal.profile})


async def test_a_given_scope_overrides_the_folder(settings: Settings) -> None:
    proposal = await draft_profile(
        'https://site.example/docs/guide/b',
        scope='https://site.example/docs/guide/',
        settings=settings,
        transport=_site(),
    )
    assert proposal.pages == 1
