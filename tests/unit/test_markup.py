"""Cleaning markup embedded in documents that arrive as markdown."""

from __future__ import annotations

from crawlee_lab.extraction.markup import (
    clean_embedded_markup,
    clean_if_markup,
    ends_inside_a_fence,
    fence_states,
    lines_outside_fences,
    looks_like_markup,
    repair_glued_fences,
    strip_component_definitions,
)

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


NESTED_FENCES = """# Fencing a fence

````markdown
```python
print('hello')
```
````

Prose after the example, which is prose and not code.
"""

UNTERMINATED = """# Cut short

```python
print('the fence never closes')
"""


def test_a_longer_fence_wraps_a_shorter_one_without_inverting_the_document() -> None:
    """A flag flipped on every delimiter reads the inner fence as a second opening, and from there
    treats the page's prose as code and its code as prose. `ai.google.dev` publishes such pages."""
    assert lines_outside_fences(NESTED_FENCES) == [
        '# Fencing a fence',
        '',
        '',
        'Prose after the example, which is prose and not code.',
    ]


def test_a_document_that_stops_inside_a_fence_says_so() -> None:
    assert ends_inside_a_fence(fence_states(UNTERMINATED))


def test_a_document_that_closes_its_fences_does_not() -> None:
    assert not ends_inside_a_fence(fence_states(NESTED_FENCES))


def test_an_info_string_does_not_close_a_block() -> None:
    states = fence_states('```python\ncode\n```\n')
    assert [state.value for state in states] == ['open', 'inside', 'close']


def test_cleaning_leaves_a_nested_example_exactly_as_it_was() -> None:
    """The tags inside a fenced example are the lesson, not contamination."""
    page = '# Forms\n\n<div class="x">chrome</div>\n\n````html\n```\n<form><input /></form>\n```\n````\n'
    cleaned = clean_embedded_markup(page)
    assert '<form><input /></form>' in cleaned
    assert '<div class="x">' not in cleaned


GLUED_FENCE = """# Reference images

- **`<IMAGE_REF_N>`** : use the image as a reference, for example:```
in the style of <IMAGE_REF_0> a woman is walking
```
(combines style reference from the first image).

## What's next

- Read the [prompting guide](https://example.com/prompts).
"""


def test_a_fence_glued_to_the_end_of_a_line_is_put_back_on_its_own() -> None:
    """trafilatura collapses a paragraph and the code block after it onto one line, which leaves
    an opening delimiter no markdown parser can see. Everything after it then reads inverted: the
    page's prose is treated as code and its code as prose."""
    assert ends_inside_a_fence(fence_states(GLUED_FENCE))

    repaired = repair_glued_fences(GLUED_FENCE)

    assert not ends_inside_a_fence(fence_states(repaired))
    assert "## What's next" in lines_outside_fences(repaired)
    assert 'in the style of <IMAGE_REF_0> a woman is walking' not in lines_outside_fences(repaired)


def test_a_document_whose_fences_already_balance_is_returned_untouched() -> None:
    assert repair_glued_fences(NESTED_FENCES) == NESTED_FENCES


def test_a_document_the_repair_cannot_balance_is_left_exactly_as_it_was() -> None:
    """Some documents arrive unbalanced for reasons this repair does not address, and a page that
    is merely broken is worth more than a page that has been guessed at."""
    assert repair_glued_fences(UNTERMINATED) == UNTERMINATED


def test_an_ordinary_opening_fence_is_not_disturbed() -> None:
    page = '# Title\n\n```python\nprint("hello")\n```\n'
    assert repair_glued_fences(page) == page


MDX_COMPONENT_PAGE = """# Explore the context window

An interactive simulation of how the context window fills during a session.

export const ContextWindow = () => {
  const EVENTS = useMemo(() => [{
    id: 'start',
    label: 'Before you type',
    oneLiner: 'CLAUDE.md and skill descriptions are already loaded',
  }], []);
  return (
    <div className="cw">{EVENTS.map(e => <span key={e.id}>{e.label}</span>)}</div>
  );
};

<ContextWindow />

## What the timeline shows

The session walks through a realistic flow with representative token counts.
"""

JS_TUTORIAL_PAGE = """# Writing a module

Declare the helper and export it:

```javascript
export const greet = (name) => {
  return `hello ${name}`;
};
```

Import it wherever you need it.
"""


def test_a_component_definition_is_removed_from_the_prose_around_it() -> None:
    """MDX pages define their interactive components in the document itself. The definition is
    JavaScript, not prose, and a reader given the source instead of the page learns nothing."""
    cleaned = strip_component_definitions(MDX_COMPONENT_PAGE)

    assert 'export const ContextWindow' not in cleaned
    assert 'useMemo' not in cleaned
    assert '# Explore the context window' in cleaned
    assert '## What the timeline shows' in cleaned
    assert 'representative token counts' in cleaned


def test_the_component_invocation_survives_its_definition() -> None:
    """Where the component stood is worth knowing; how it was built is not."""
    assert '<ContextWindow />' in strip_component_definitions(MDX_COMPONENT_PAGE)


def test_javascript_inside_a_code_fence_is_the_lesson_and_is_left_alone() -> None:
    assert strip_component_definitions(JS_TUTORIAL_PAGE) == JS_TUTORIAL_PAGE


def test_a_page_with_no_components_is_returned_unchanged() -> None:
    assert strip_component_definitions(PROSE_PAGE) == PROSE_PAGE


def test_an_unbalanced_definition_stops_at_the_next_heading() -> None:
    """A brace counted inside a string would otherwise let the removal run to the end of the page,
    taking the documentation with it. A heading cannot appear inside a JavaScript expression."""
    runaway = "# Title\n\nexport const Broken = () => {\n  const brace = '{';\n\n## Real heading\n\nProse.\n"
    cleaned = strip_component_definitions(runaway)

    assert '## Real heading' in cleaned
    assert 'Prose.' in cleaned


def test_a_heading_inside_a_template_literal_does_not_end_the_removal() -> None:
    """MDX components carry example documents in backtick templates, and those examples contain
    markdown headings. Treating one as the end of the definition leaves the rest of the source
    standing, which is the whole defect this removal exists to fix."""
    page = (
        '# Explore the directory\n\n'
        'export const Explorer = () => {\n'
        '  const TREE = { example: `# Project conventions\n\n'
        '## Build\n\nRun npm test.\n` };\n'
        '  return <div>{TREE}</div>;\n'
        '};\n\n'
        '## What is not shown\n\nA table follows.\n'
    )
    cleaned = strip_component_definitions(page)

    assert 'export const Explorer' not in cleaned
    assert 'Run npm test.' not in cleaned
    assert '## What is not shown' in cleaned
    assert 'A table follows.' in cleaned


def test_a_definition_that_never_closes_costs_nothing() -> None:
    """A brace counted inside a string can leave the removal open to the end of the document. The
    page is then returned exactly as it arrived, because a page carrying its component source is
    worth more than no page at all."""
    runaway = '# Title\n\nexport const Broken = () => {\n  const opener = `{`;\n\nProse below.\n'
    assert strip_component_definitions(runaway) == runaway
