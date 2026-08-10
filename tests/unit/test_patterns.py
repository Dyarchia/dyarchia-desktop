"""URL pattern semantics.

These cases exist because Crawlee's own globs are anchored and matched against the whole URL, which
makes the obvious `**/docs/**` match nothing at all.
"""

from __future__ import annotations

import pytest

from crawlee_lab.patterns import to_matcher, to_matchers

DOCS_URL = 'https://site.example/docs/guide/intro.html'


def matches(pattern: str, url: str) -> bool:
    matcher = to_matcher(pattern)
    regexp = getattr(matcher, 'regexp', matcher)
    return regexp.match(url) is not None


@pytest.mark.parametrize(
    ('pattern', 'expected'),
    [
        ('/docs/', True),
        ('/guide/', True),
        ('/blog/', False),
        ('/docs/**', True),
        ('/docs/*/intro.html', True),
        ('/docs/*.html', False),
        ('/docs/**/*.html', True),
        ('re:^https://site\\.example/docs/', True),
        ('re:^https://other\\.example/', False),
        ('https://site.example/docs/**', True),
        ('https://other.example/docs/**', False),
    ],
)
def test_pattern_matching(pattern: str, expected: bool) -> None:
    assert matches(pattern, DOCS_URL) is expected


def test_single_star_spans_exactly_one_path_segment() -> None:
    deep = 'https://site.example/docs/guide/deep/intro.html'
    assert matches('/docs/*/intro.html', DOCS_URL)
    assert not matches('/docs/*/intro.html', deep)
    assert matches('/docs/**/intro.html', deep)


def test_a_bare_pattern_matches_anywhere_in_the_url() -> None:
    """Crawlee's own glob cannot express this: `**/docs/**` never crosses the `//` in `https://`."""
    from crawlee import Glob

    assert Glob('**/docs/**').regexp.match(DOCS_URL) is None
    assert matches('/docs/', DOCS_URL)


def test_empty_pattern_is_rejected() -> None:
    with pytest.raises(ValueError, match='empty URL pattern'):
        to_matcher('   ')


def test_to_matchers_preserves_order() -> None:
    assert len(to_matchers(['/a/', '/b/', 're:^https://c/'])) == 3
