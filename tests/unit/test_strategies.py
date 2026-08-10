"""Extraction modes."""

from __future__ import annotations

import pytest

from crawlee_lab.extraction.dom import SoupAdapter
from crawlee_lab.extraction.strategies import RawPage, build_item, markdown_title
from crawlee_lab.models import ExtractionMode, RunSpec

PAGE_URL = 'https://shop.example/catalogue/index.html'


@pytest.fixture
def page(catalogue_html: str) -> RawPage:
    return RawPage(url=PAGE_URL, status_code=200, dom=SoupAdapter.from_html(catalogue_html))


def make_spec(**overrides: object) -> RunSpec:
    return RunSpec(name='t', start_urls=[PAGE_URL], **overrides)  # type: ignore[arg-type]


def test_auto_extracts_prose_without_the_navigation(page: RawPage) -> None:
    item = build_item(page, make_spec(extract=ExtractionMode.AUTO))
    assert item.content is not None
    assert 'Bristol warehouse' in item.content
    assert 'Test Shop' not in item.content


def test_html_returns_the_markup(page: RawPage) -> None:
    item = build_item(page, make_spec(extract=ExtractionMode.HTML))
    assert item.content is not None
    assert item.content.startswith('<!DOCTYPE html>')


def test_text_returns_plain_text(page: RawPage) -> None:
    item = build_item(page, make_spec(extract=ExtractionMode.TEXT))
    assert item.content is not None
    assert '<h1>' not in item.content
    assert 'Widgets' in item.content


def test_none_extracts_no_content(page: RawPage) -> None:
    assert build_item(page, make_spec(extract=ExtractionMode.NONE)).content is None


def test_links_collects_absolute_urls(page: RawPage) -> None:
    item = build_item(page, make_spec(extract=ExtractionMode.LINKS))
    assert item.content is None
    assert 'https://shop.example/catalogue/widget-a/' in item.links


def test_jsonld_lands_in_fields(page: RawPage) -> None:
    item = build_item(page, make_spec(extract=ExtractionMode.JSONLD))
    assert item.fields['json_ld'][0]['@type'] == 'ItemList'


def test_selectors_apply_alongside_the_mode(page: RawPage) -> None:
    item = build_item(
        page,
        make_spec(extract=ExtractionMode.NONE, selectors={'title': 'h1', 'prices': 'all:.price_color'}),
    )
    assert item.fields['title'] == 'Widgets'
    assert len(item.fields['prices']) == 2


def test_metadata_is_carried_through(page: RawPage) -> None:
    item = build_item(page, make_spec())
    assert item.url == PAGE_URL
    assert item.status_code == 200
    assert item.title == 'Catalogue | Test Shop'


def test_a_body_without_a_dom_is_used_verbatim() -> None:
    raw = RawPage(url='https://site.example/page.md', body_text='# Heading\n\nBody text.\n')
    item = build_item(raw, make_spec(extract=ExtractionMode.TEXT))
    assert item.content == '# Heading\n\nBody text.\n'
    assert item.title == 'Heading'


@pytest.mark.parametrize(
    ('text', 'expected'),
    [
        ('# Title\n\nbody', 'Title'),
        ('> quote\n\n# Late title', 'Late title'),
        ('## Only a subheading', None),
        ('no headings at all', None),
        ('#', None),
    ],
)
def test_markdown_titles(text: str, expected: str | None) -> None:
    assert markdown_title(text) == expected
