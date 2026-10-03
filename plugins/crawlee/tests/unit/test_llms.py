"""Seeding from a publisher's llms.txt beside its sitemap."""

from __future__ import annotations

import asyncio

from dyarchia_crawlee.engine import seed_requests
from dyarchia_crawlee.llms import extra_pages, key, links, page_of, pages_listed
from dyarchia_crawlee.models import RunSpec

INDEX = 'https://site.example/llms.txt'


def served(pages: dict[str, str]):
    async def fetch(url: str) -> str | None:
        return pages.get(url)

    return fetch


def run(coroutine):
    return asyncio.run(coroutine)


def test_links_are_read_from_markdown_without_their_punctuation() -> None:
    text = '- [Intro](https://site.example/docs/intro.md): start here.\nSee https://site.example/docs/faq.'
    assert links(text) == ['https://site.example/docs/intro.md', 'https://site.example/docs/faq']


def test_a_twin_link_is_taken_back_to_its_page() -> None:
    assert page_of('https://site.example/docs/intro.md', '.md') == 'https://site.example/docs/intro'
    assert page_of('https://site.example/agents/index.md', '.md') == 'https://site.example/agents/'
    assert page_of('https://site.example/docs/intro#part', None) == 'https://site.example/docs/intro'


def test_what_is_not_a_page_is_left_out() -> None:
    for url in ('https://site.example/openapi.json', 'https://site.example/llms-full.txt', 'https://site.example/a.yaml'):
        assert page_of(url, '.md') is None


def test_a_page_with_and_without_its_slash_is_one_key() -> None:
    assert key('https://site.example/agents/') == key('https://site.example/agents')
    assert key('https://site.example//docs/x?y=1#z') == 'https://site.example/docs/x'


def test_nested_indexes_on_the_same_host_are_followed_and_others_are_not() -> None:
    spec = RunSpec(name='site', llms_txt=[INDEX], fetch_suffix='.md')
    fetch = served(
        {
            INDEX: '[A](https://site.example/docs/a.md)\n[More](https://site.example/learn/llms.txt)\n'
            '[Elsewhere](https://other.example/llms.txt)\n[GitHub](https://github.com/x/y)',
            'https://site.example/learn/llms.txt': '[B](https://site.example/learn/b.md)',
            'https://other.example/llms.txt': '[C](https://other.example/c.md)',
        }
    )
    assert run(pages_listed(spec, fetch)) == ['https://site.example/docs/a', 'https://site.example/learn/b']


def test_include_and_exclude_scope_the_index_as_they_scope_the_sitemap() -> None:
    spec = RunSpec(name='site', llms_txt=[INDEX], include=['/docs/'], exclude=['/docs/old/'])
    fetch = served(
        {INDEX: 'https://site.example/docs/a https://site.example/docs/old/b https://site.example/blog/c'}
    )
    assert run(pages_listed(spec, fetch)) == ['https://site.example/docs/a']


def test_only_what_the_sitemap_does_not_list_is_added() -> None:
    sitemap = 'https://site.example/sitemap.xml'
    spec = RunSpec(name='site', llms_txt=[INDEX], sitemap_urls=[sitemap], fetch_suffix='.md')
    fetch = served(
        {
            INDEX: '[A](https://site.example/agents/index.md) [B](https://site.example/docs/b.md)',
            sitemap: '<sitemapindex><sitemap><loc>https://site.example/s1.xml</loc></sitemap></sitemapindex>',
            'https://site.example/s1.xml': '<urlset><url><loc>https://site.example/agents/</loc></url></urlset>',
        }
    )
    assert run(extra_pages(spec, fetch)) == ['https://site.example/docs/b']


def test_an_index_that_cannot_be_read_adds_nothing() -> None:
    spec = RunSpec(name='site', llms_txt=[INDEX])
    assert run(extra_pages(spec, served({}))) == []


def test_a_profile_may_be_seeded_by_its_index_alone() -> None:
    spec = RunSpec(name='site', llms_txt=[INDEX])
    assert spec.seeded_by_index
    assert spec.sources == [INDEX]


def test_the_pages_the_index_adds_are_fetched_like_any_other_seed() -> None:
    spec = RunSpec(name='site', llms_txt=[INDEX], fetch_suffix='.md')
    seeds = seed_requests(spec, ['https://site.example/docs/b'])
    assert [seed.url for seed in seeds] == ['https://site.example/docs/b.md']


def test_a_twin_link_is_a_page_even_for_a_profile_that_reads_html() -> None:
    assert page_of('https://site.example/docs/intro.md', None) == 'https://site.example/docs/intro'


def test_a_query_and_a_well_known_path_do_not_make_pages() -> None:
    assert page_of('https://site.example/docs/settings?surface=ide', '.md') == 'https://site.example/docs/settings'
    assert page_of('https://site.example/.well-known/api-catalog', '.md') is None
