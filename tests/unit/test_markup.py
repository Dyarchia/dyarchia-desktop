"""Cleaning markup embedded in documents that arrive as markdown."""

from __future__ import annotations

from crawlee_lab.extraction.markup import clean_embedded_markup, clean_if_markup, looks_like_markup

MDX_PAGE = """# Welcome

<div className="home-landing">
  <section className="hl-hero">
    <h1 className="hl-hero-title">What do you want to do with Claude?</h1>
    <a className="hl-chip" href="/docs/connectors"><span>Connect my apps</span></a>
    <svg viewBox="0 0 24 24"><path d="M18 8v5a4 4 0 0 1-4 4h-4Z" /></svg>
  </section>
</div>
"""

PROSE_PAGE = """# Annotations

Annotations let you attach comments to specific parts of an artifact.

Select text in a Markdown file, or click a point on an image.
"""


def test_an_mdx_layout_is_recognised() -> None:
    assert looks_like_markup(MDX_PAGE)


def test_ordinary_prose_is_not() -> None:
    assert not looks_like_markup(PROSE_PAGE)


def test_prose_is_returned_untouched() -> None:
    assert clean_if_markup(PROSE_PAGE) == PROSE_PAGE


def test_markup_is_reduced_to_its_text() -> None:
    cleaned = clean_embedded_markup(MDX_PAGE)
    assert '# Welcome' in cleaned
    assert 'What do you want to do with Claude?' in cleaned
    assert 'className' not in cleaned
    assert '<div' not in cleaned


def test_svg_coordinates_are_dropped_entirely() -> None:
    """Icon geometry is the noise that would make a redesign look like a content change."""
    cleaned = clean_embedded_markup(MDX_PAGE)
    assert 'M18 8v5' not in cleaned
    assert 'viewBox' not in cleaned


def test_links_survive_as_markdown() -> None:
    assert '[Connect my apps](/docs/connectors)' in clean_embedded_markup(MDX_PAGE)


def test_code_fences_are_left_alone() -> None:
    """An HTML example inside a fence is the content, not chrome."""
    document = """# Guide

<div className="wrapper">Intro text</div>

```html
<div class="example">Keep me exactly as I am</div>
```

<span className="outro">Closing text</span>
"""
    cleaned = clean_embedded_markup(document)
    assert '<div class="example">Keep me exactly as I am</div>' in cleaned
    assert 'className="wrapper"' not in cleaned
    assert 'Intro text' in cleaned
    assert 'Closing text' in cleaned


def test_prose_living_in_attributes_is_rescued() -> None:
    """Component syntax puts headings in attributes; stripping the tag would delete them."""
    document = """# Guide

<Steps>
  <Step title="Connect GitLab">
    Open the settings page.
  </Step>
</Steps>

<Update label="August 2026" description="Remote clusters">
  Clusters can now be shared.
</Update>

<Card title="Claude Platform" icon="sliders">Manage your API access.</Card>
"""
    cleaned = clean_embedded_markup(document)
    for expected in ('Connect GitLab', 'August 2026', 'Remote clusters', 'Claude Platform'):
        assert expected in cleaned

    assert 'Open the settings page.' in cleaned
    assert 'Manage your API access.' in cleaned
    assert 'icon=' not in cleaned
    assert '<Step' not in cleaned


def test_a_linked_component_becomes_a_markdown_link() -> None:
    """Card components carry their destination in href without being an anchor."""
    document = '# Guide\n\n<Card title="Remote clusters" href="/docs/clusters">Run elsewhere.</Card>\n'
    cleaned = clean_embedded_markup(document)
    assert '[Remote clusters](/docs/clusters)' in cleaned
    assert 'Run elsewhere.' in cleaned


def test_decorative_attributes_are_not_rescued() -> None:
    cleaned = clean_embedded_markup(MDX_PAGE)
    assert 'hl-chip' not in cleaned
    assert 'home-landing' not in cleaned


def test_adjacent_elements_do_not_run_their_words_together() -> None:
    document = '# Guide\n\n<div><span>Connectors</span><span>Give Claude access</span></div>\n'
    cleaned = clean_embedded_markup(document)
    assert 'Connectors Give Claude access' in cleaned
    assert 'ConnectorsGive' not in cleaned


def test_a_link_label_stays_on_one_line_with_its_words_apart() -> None:
    document = (
        '# Guide\n\n<a href="/docs/connectors">\n  <h3>Connectors</h3>\n'
        '  <p>Give Claude access to your tools.</p>\n</a>\n'
    )
    cleaned = clean_embedded_markup(document)
    assert '[Connectors Give Claude access to your tools.](/docs/connectors)' in cleaned


def test_layout_indentation_never_becomes_a_code_block() -> None:
    document = '# Guide\n\n<div>\n  <section>\n    <p>Deeply nested prose.</p>\n  </section>\n</div>\n'
    cleaned = clean_embedded_markup(document)
    prose = next(line for line in cleaned.splitlines() if 'Deeply nested' in line)
    assert len(prose) - len(prose.lstrip()) < 4


def test_blank_line_runs_are_collapsed() -> None:
    assert '\n\n\n' not in clean_embedded_markup(MDX_PAGE)


def test_an_empty_document_is_handled() -> None:
    assert clean_if_markup('') == ''
