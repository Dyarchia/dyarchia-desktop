"""Cleaning markup embedded in documents that arrive as markdown."""

from __future__ import annotations

from euripontida_crawlee.extraction.markup import (
    block_single_line_code,
    clean_embedded_markup,
    clean_if_markup,
    ends_inside_a_fence,
    fence_states,
    lines_outside_fences,
    looks_like_markup,
    repair_glued_fences,
    restore_line_split_code,
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


LINE_SPLIT_CODE = (
    '<p>First, install the libraries:</p>'
    '<div class="font-mono" style="tab-size:4">'
    '<div data-code-line="" class="min-h-[1lh]">%pip install anthropic</div>'
    '<div data-code-line="" class="min-h-[1lh]">import anthropic</div>'
    '<div data-code-line="" class="min-h-[1lh]"></div>'
    '<div data-code-line="" class="min-h-[1lh]">client = <span class="tok">anthropic</span>.Anthropic()</div>'
    '</div>'
    '<p>Then call it.</p>'
)


def test_a_code_block_split_into_one_div_per_line_becomes_a_pre() -> None:
    """The Claude Cookbook renders notebook cells this way. Without a pre or a code element the
    sample is indistinguishable from layout, and article extraction drops every line of it."""
    restored = restore_line_split_code(LINE_SPLIT_CODE)

    assert '<pre><code>%pip install anthropic\nimport anthropic' in restored
    assert 'data-code-line' not in restored
    assert restored.count('<pre>') == 1


def test_the_highlighting_inside_a_line_is_carried_through() -> None:
    """A pre is where extraction stops stripping, so what is inside it costs nothing to keep."""
    assert '<span class="tok">anthropic</span>.Anthropic()' in restore_line_split_code(LINE_SPLIT_CODE)


def test_a_blank_line_inside_the_block_is_kept() -> None:
    """Losing it would run two statements together and change what the sample says."""
    restored = restore_line_split_code(LINE_SPLIT_CODE)
    body = restored[restored.index('<pre><code>') + len('<pre><code>') : restored.index('</code></pre>')]

    assert body.splitlines() == [
        '%pip install anthropic',
        'import anthropic',
        '',
        'client = <span class="tok">anthropic</span>.Anthropic()',
    ]


def test_two_separate_blocks_do_not_merge_into_one() -> None:
    """Consecutive runs are only consecutive because the prose between them was stripped first."""
    page = '<div data-code-line="">one</div><p>and then</p><div data-code-line="">two</div>'

    assert restore_line_split_code(page).count('<pre>') == 2


def test_a_page_that_marks_its_code_up_properly_is_untouched() -> None:
    """Every other target extracted from HTML has a pre already, and must not be rewritten."""
    page = '<p>Run it:</p><pre><code>import anthropic</code></pre>'

    assert restore_line_split_code(page) == page


def test_a_one_line_block_is_given_a_second_line() -> None:
    """Extraction renders a single-line pre as inline code, and then glues the fence of the block
    after it to the end of that line, where no parser can see it. Everything from there reads
    inverted. 26 mistral-docs pages were in that state."""
    page = '<pre><code>%pip install mistralai</code></pre>'

    assert block_single_line_code(page) == '<pre><code>%pip install mistralai\n</code></pre>'


def test_the_newline_goes_inside_the_code_element_not_after_it() -> None:
    """Publishers wrap the sample as pre > code > span. A newline outside the code stops the glue
    and leaves the sample inline, which is half a repair: on one page that was 20 lines fenced
    instead of 31."""
    page = '<pre style="x"><code class="y"><span>import os</span></code></pre>'
    padded = '<pre style="x"><code class="y"><span>import os</span>\n</code></pre>'

    assert block_single_line_code(page) == padded


def test_a_pre_without_a_code_element_is_padded_at_its_end() -> None:
    """Not every publisher nests one, and the block still has to survive."""
    assert block_single_line_code('<pre>import os</pre>') == '<pre>import os\n</pre>'


def test_a_block_that_already_has_two_lines_is_left_alone() -> None:
    """Padding every pre also rewrites the ones inside a table cell, which moved 27 lines of the
    Gemini API reference for no gain."""
    page = '<pre><code>import os\nimport sys</code></pre>'

    assert block_single_line_code(page) == page


def test_a_line_split_run_of_one_line_survives_the_pair() -> None:
    """The two passes run in order and the rebuilt block is a single-line pre like any other."""
    rebuilt = restore_line_split_code('<div data-code-line="">%pip install anthropic</div>')

    assert block_single_line_code(rebuilt) == '<pre><code>%pip install anthropic\n</code></pre>'


BALANCED_BUT_INVERTED = """# Entity extraction

To focus on specific entity types: ```
system_prompt: 'Extract only person names.'
```
To include relationships: ```
system_prompt: 'Extract entities and their relationships.'
```
You can also change the model.
"""


def test_a_page_whose_glued_fences_come_in_pairs_is_repaired_too() -> None:
    """The delimiters pair up, so the document balances and every earlier check called it healthy,
    while the prose between the blocks was stored as code. 22 gemini-docs pages sat like this."""
    assert not ends_inside_a_fence(fence_states(BALANCED_BUT_INVERTED))
    assert 'To include relationships: ' not in lines_outside_fences(BALANCED_BUT_INVERTED)

    repaired = repair_glued_fences(BALANCED_BUT_INVERTED)
    outside = lines_outside_fences(repaired)

    assert 'To focus on specific entity types:' in outside
    assert 'To include relationships:' in outside
    assert 'You can also change the model.' in outside
    assert "system_prompt: 'Extract only person names.'" not in outside


def test_a_sample_that_ends_in_backticks_is_not_split() -> None:
    """A page about parsing markdown puts a fence inside its own code, and splitting the line would
    corrupt the lesson."""
    page = "# Parsing\n\n```python\npattern = re.compile(r'```python\n(.*?)\n```')\n```\n\nDone.\n"

    assert repair_glued_fences(page) == page


def test_a_document_with_nothing_glued_is_returned_as_it_was() -> None:
    """Attempting every document must not mean rewriting every document."""
    assert repair_glued_fences(PROSE_PAGE) == PROSE_PAGE
