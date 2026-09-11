"""Field selectors and the two DOM adapters, which must agree on every question."""

from __future__ import annotations

import pytest

from dyarchia_crawlee.extraction.dom import (
    DomAdapter,
    FieldSelector,
    ParselAdapter,
    SoupAdapter,
    adapt,
    read_field,
    read_fields,
)

PAGE_URL = 'https://shop.example/catalogue/index.html'


@pytest.fixture(params=['soup', 'parsel'])
def dom(request: pytest.FixtureRequest, catalogue_html: str) -> DomAdapter:
    if request.param == 'soup':
        return SoupAdapter.from_html(catalogue_html)
    return ParselAdapter.from_html(catalogue_html)


@pytest.mark.parametrize(
    ('raw', 'css', 'attribute', 'many'),
    [
        ('h1', 'h1', None, False),
        ('.price@data-value', '.price', 'data-value', False),
        ('all:.tag', '.tag', None, True),
        ('all:a@href', 'a', 'href', True),
        ('  all: .tag  ', '.tag', None, True),
        ('a[href^="mailto:"]', 'a[href^="mailto:"]', None, False),
    ],
)
def test_selector_parsing(raw: str, css: str, attribute: str | None, many: bool) -> None:
    parsed = FieldSelector.parse(raw)
    assert (parsed.css, parsed.attribute, parsed.many) == (css, attribute, many)


def test_empty_selector_is_rejected() -> None:
    with pytest.raises(ValueError, match='empty CSS selector'):
        FieldSelector.parse('all:')


def test_title_prefers_the_title_element(dom: DomAdapter) -> None:
    assert dom.title() == 'Catalogue | Test Shop'


def test_text_of_a_single_match(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('h1')) == 'Widgets'


def test_text_of_every_match(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('all:.breadcrumb li')) == ['Home', 'Catalogue']


def test_attribute_of_a_single_match(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('.price_color@data-value')) == '1099'


def test_missing_selector_yields_none(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('.nonexistent')) is None


def test_missing_list_selector_yields_an_empty_list(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('all:.nonexistent')) == []


def test_url_attributes_are_resolved_against_the_page(dom: DomAdapter) -> None:
    covers = read_field(dom, FieldSelector.parse('all:.cover@src'), PAGE_URL)
    assert covers == [
        'https://shop.example/media/widget-a.jpg',
        'https://shop.example/media/widget-b.jpg',
    ]


def test_non_url_attributes_are_left_alone(dom: DomAdapter) -> None:
    assert read_field(dom, FieldSelector.parse('.price_color@data-value'), PAGE_URL) == '1099'


def test_hrefs_are_absolute(dom: DomAdapter) -> None:
    hrefs = dom.hrefs(PAGE_URL)
    assert 'https://shop.example/catalogue/widget-a/' in hrefs
    assert 'https://shop.example/catalogue/catalogue/widget-b/' in hrefs
    assert 'https://external.example.org/elsewhere' in hrefs


def test_json_ld_skips_malformed_blocks(dom: DomAdapter) -> None:
    documents = dom.json_ld()
    assert len(documents) == 1
    assert documents[0]['@type'] == 'ItemList'


def test_read_fields_keeps_every_requested_name(dom: DomAdapter) -> None:
    fields = read_fields(dom, {'title': 'h1', 'missing': '.nope'}, PAGE_URL)
    assert fields == {'title': 'Widgets', 'missing': None}


def test_adapt_recognises_both_parsers(catalogue_html: str) -> None:
    from bs4 import BeautifulSoup
    from parsel import Selector

    assert isinstance(adapt(BeautifulSoup(catalogue_html, 'lxml')), SoupAdapter)
    assert isinstance(adapt(Selector(text=catalogue_html)), ParselAdapter)


def test_adapt_falls_back_to_raw_html(catalogue_html: str) -> None:
    assert isinstance(adapt(None, catalogue_html), SoupAdapter)


def test_adapt_refuses_the_unrecognisable() -> None:
    with pytest.raises(TypeError, match='cannot adapt'):
        adapt(object())
