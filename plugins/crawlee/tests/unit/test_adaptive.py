"""The result checker that decides when the adaptive crawler must open a browser."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

from dyarchia_crawlee.crawlers.adaptive import make_result_checker
from dyarchia_crawlee.crawlers.throttling import target_domains
from dyarchia_crawlee.models import ExtractionMode, RunSpec


def result_with(*payloads: Any) -> Any:
    return cast('Any', SimpleNamespace(push_data_calls=[{'data': payload} for payload in payloads]))


def spec_for(**overrides: Any) -> RunSpec:
    return RunSpec(name='demo', start_urls=['https://site.example/'], **overrides)


def test_a_static_pass_that_pushed_nothing_is_rejected() -> None:
    check = make_result_checker(spec_for())
    assert check(result_with()) is False


def test_an_empty_selector_result_is_rejected() -> None:
    """The shape a JavaScript-rendered page produces on the static pass."""
    check = make_result_checker(spec_for(selectors={'quotes': 'all:.quote'}))
    assert check(result_with({'url': 'u', 'fields': {'quotes': []}, 'content': None, 'links': []})) is False


def test_a_populated_selector_result_is_accepted() -> None:
    check = make_result_checker(spec_for(selectors={'quotes': 'all:.quote'}))
    assert check(result_with({'fields': {'quotes': ['a quote']}})) is True


def test_extracted_content_counts_as_signal() -> None:
    check = make_result_checker(spec_for())
    assert check(result_with({'content': 'some prose', 'fields': {}})) is True


def test_a_run_asking_for_nothing_accepts_any_result() -> None:
    """Without this, `--extract none` and no selectors would render every page in a browser."""
    check = make_result_checker(spec_for(extract=ExtractionMode.NONE))
    assert check(result_with({'url': 'u', 'content': None, 'fields': {}, 'links': []})) is True


def test_a_batch_push_is_understood() -> None:
    check = make_result_checker(spec_for())
    assert check(result_with([{'content': None}, {'content': 'prose'}])) is True


def test_throttled_domains_cover_both_seeding_routes() -> None:
    spec = RunSpec(
        name='demo',
        start_urls=['https://a.example/x', 'https://a.example/y'],
        sitemap_urls=['https://b.example/sitemap.xml'],
    )
    assert target_domains([*spec.start_urls, *spec.sitemap_urls]) == ['a.example', 'b.example']
