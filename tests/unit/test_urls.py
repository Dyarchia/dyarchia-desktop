"""URL suffix rewriting and snapshot path derivation."""

from __future__ import annotations

import pytest

from euripontida_crawlee.urls import (
    apply_suffix,
    collapse_slashes,
    snapshot_relative_path,
    strip_suffix,
    suffix_candidates,
)

PAGE = 'https://site.example/docs/intro'


def test_apply_suffix_appends_to_the_path() -> None:
    assert apply_suffix(PAGE, '.md') == 'https://site.example/docs/intro.md'


def test_apply_suffix_is_idempotent() -> None:
    once = apply_suffix(PAGE, '.md')
    assert once is not None
    assert apply_suffix(once, '.md') == once


def test_a_directory_url_drops_its_slash_first() -> None:
    """A trailing slash cannot carry `.md`, so the first guess is the page without it."""
    assert apply_suffix('https://site.example/docs/', '.md') == 'https://site.example/docs.md'
    assert apply_suffix('https://site.example', '.md') == 'https://site.example/index.md'


def test_an_extensionless_url_offers_both_forms() -> None:
    """The case that cost us the docs landing page: docs.md is a 404, docs/index.md is the page."""
    assert suffix_candidates(PAGE, '.md') == [
        'https://site.example/docs/intro.md',
        'https://site.example/docs/intro/index.md',
    ]


def test_an_already_suffixed_url_offers_nothing_else() -> None:
    assert suffix_candidates('https://site.example/docs/intro.md', '.md') == [
        'https://site.example/docs/intro.md'
    ]


def test_no_suffix_means_the_url_itself() -> None:
    assert suffix_candidates(PAGE, None) == [PAGE]


def test_apply_suffix_without_a_suffix_is_a_no_op() -> None:
    assert apply_suffix(PAGE, None) == PAGE


def test_strip_suffix_round_trips() -> None:
    suffixed = apply_suffix(PAGE, '.md')
    assert suffixed is not None
    assert strip_suffix(suffixed, '.md') == PAGE


def test_strip_suffix_leaves_unsuffixed_urls_alone() -> None:
    assert strip_suffix(PAGE, '.md') == PAGE


@pytest.mark.parametrize(
    ('url', 'expected'),
    [
        ('https://site.example/docs/intro', 'site.example/docs/intro.md'),
        ('https://site.example/', 'site.example/index.md'),
        ('https://site.example', 'site.example/index.md'),
        ('https://site.example/docs/', 'site.example/docs/index.md'),
        ('https://site.example/a b/c?d=1', 'site.example/a-b/c/d-1.md'),
    ],
)
def test_snapshot_paths_mirror_the_url(url: str, expected: str) -> None:
    assert snapshot_relative_path(url).as_posix() == expected


def test_snapshot_paths_cannot_escape_upwards() -> None:
    """A target that puts traversal in its URLs must not be able to steer where we write."""
    path = snapshot_relative_path('https://site.example/../../etc/passwd')
    assert '..' not in path.parts


def test_a_trailing_slash_offers_both_conventions() -> None:
    """Publishers disagree about where the variant of a directory-shaped URL lives.

    Some serve `section/index.md`, others drop the slash and serve `section.md`. Offering only one
    of the two makes every page of a site that chose the other convention unreachable.
    """
    assert suffix_candidates('https://site.example/guide/', '.md') == [
        'https://site.example/guide.md',
        'https://site.example/guide/index.md',
    ]


def test_a_bare_host_has_no_stem_to_strip() -> None:
    for url in ('https://site.example/', 'https://site.example'):
        assert suffix_candidates(url, '.md') == ['https://site.example/index.md']


def test_repeated_slashes_are_folded() -> None:
    """docs.x.ai publishes its entire sitemap this way, and the manifest is keyed by URL."""
    assert collapse_slashes('https://docs.x.ai///overview') == 'https://docs.x.ai/overview'
    assert collapse_slashes('https://docs.x.ai//build/enterprise') == 'https://docs.x.ai/build/enterprise'


def test_a_clean_url_is_returned_untouched() -> None:
    for url in ('https://site.example/docs/intro', 'https://site.example/', 'https://site.example'):
        assert collapse_slashes(url) == url


def test_the_scheme_keeps_its_own_slashes() -> None:
    assert collapse_slashes('https://site.example/a//b?q=x//y') == 'https://site.example/a/b?q=x//y'


def test_a_page_that_names_its_extension_swaps_it_for_the_suffix() -> None:
    """developer.salesforce.com lists guide/get-started.html and serves guide/get-started.md."""
    page = 'https://developer.salesforce.com/docs/ai/agentforce/guide/get-started.html'

    assert suffix_candidates(page, '.md') == [
        'https://developer.salesforce.com/docs/ai/agentforce/guide/get-started.md',
        'https://developer.salesforce.com/docs/ai/agentforce/guide/get-started.html.md',
    ]


def test_the_appended_form_is_still_offered_second() -> None:
    """Swapping is the better guess, not the only one, so a site that appends still resolves."""
    assert apply_suffix('https://site.example/docs/intro.htm', '.md') == 'https://site.example/docs/intro.md'


def test_an_extensionless_page_is_untouched_by_the_swap() -> None:
    """The nine corpora already tracked have no extension anywhere, and must keep behaving alike."""
    assert suffix_candidates(PAGE, '.md') == [
        'https://site.example/docs/intro.md',
        'https://site.example/docs/intro/index.md',
    ]
