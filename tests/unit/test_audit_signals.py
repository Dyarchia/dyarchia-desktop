"""The local signals, which decide what an audit will and will not pay to have read."""

from __future__ import annotations

from pathlib import Path

from crawlee_lab.audit.signals import Shape, classify, inspect, measure

CLEAN_PAGE = """---
title: Counting tokens
---

# Counting tokens

Every request is billed by the token, so knowing the size of a prompt before sending it is the
difference between a bill you predicted and one you did not.

```python
counted = client.messages.count_tokens(model=model, messages=messages)
print(counted.input_tokens)
```

The counter is model specific. A prompt measured against one model tells you very little about
what another will charge for it, so measure against the model you intend to call.
"""

MDX_PAGE = """# Overview

<div className="landing">
  <Card title="Quickstart" href="/quickstart" />
  <Card title="Reference" href="/reference" />
  <Card title="Guides" href="/guides" />
</div>
<section className="footer-cta">
  <h2 className="cta-title">Start building</h2>
</section>

Some prose survives at the bottom of the page, but not much of it does.
"""

NAV_PAGE = """# Cookbook

- [Structured outputs and how to validate them](https://example.com/a)
- [Tool use, parallel calls and result handling](https://example.com/b)
- [Streaming responses to a terminal](https://example.com/c)
- [Batch processing for offline workloads](https://example.com/d)
- [Prompt caching and the prefix rule](https://example.com/e)
- [Vision, images and document input](https://example.com/f)
- [Counting tokens before a request](https://example.com/g)
- [Handling refusals and stop reasons](https://example.com/h)
- [Retrying safely after a rate limit](https://example.com/i)
- [Choosing between the available models](https://example.com/j)
"""

UNCLOSED_PAGE = """# Streaming

Open a stream and read it to the end.

```python
with client.messages.stream(model=model, messages=messages) as stream:
    for text in stream.text_stream:
        print(text)

## What's next

- [Batching](https://example.com/batch)
"""

NESTED_FENCE_PAGE = """# Writing a fenced block

To show a fenced code block inside documentation you have to wrap it in a longer fence, because
the inner delimiter would otherwise close the outer one and everything after it would be read as
prose again. Four backticks around three is the usual convention, and any longer run works too.

````markdown
```python
print('hello')
```
````

That is the whole of the trick. The page continues in good order after the example, and the
closing prose is prose rather than the tail of an unterminated code block.
"""


def _write(directory: Path, name: str, body: str) -> Path:
    path = directory / name
    path.write_text(body, encoding='utf-8')
    return path


def test_ordinary_documentation_is_left_alone() -> None:
    shape, reasons = classify(measure(CLEAN_PAGE))
    assert shape is Shape.CLEAN
    assert reasons == []


def test_surviving_components_are_caught() -> None:
    shape, reasons = classify(measure(MDX_PAGE))
    assert shape is Shape.SUSPECT
    assert any('component tags' in reason for reason in reasons)


def test_a_page_that_is_only_links_is_caught() -> None:
    shape, reasons = classify(measure(NAV_PAGE))
    assert shape is Shape.SUSPECT
    assert any('nothing but a link' in reason for reason in reasons)


def test_a_fence_left_open_is_broken_beyond_asking() -> None:
    shape, reasons = classify(measure(UNCLOSED_PAGE))
    assert shape is Shape.BROKEN
    assert 'renders as code' in reasons[0]


def test_a_nested_fence_is_not_mistaken_for_a_broken_one() -> None:
    """The defect this guards against was real: pages that wrap a fence in a longer fence were
    reported as truncated, and the same miscount had the extractor treating their prose as code."""
    assert classify(measure(NESTED_FENCE_PAGE))[0] is Shape.CLEAN


def test_an_empty_page_carries_nothing() -> None:
    shape, reasons = classify(measure('# Title\n\nOne short line.\n'))
    assert shape is Shape.BROKEN
    assert 'carries nothing' in reasons[0]


def test_a_page_too_short_to_say_anything_is_broken_before_it_is_suspect() -> None:
    """Emptiness outranks every other signal, on purpose.

    A stub of two links is not a badly formatted page worth a reader's opinion; it is a page with
    nothing in it, and the cheapest true thing to say about it is that.
    """
    stub = '# Index\n\n- [One](https://example.com/1)\n- [Two](https://example.com/2)\n'
    shape, reasons = classify(measure(stub))
    assert shape is Shape.BROKEN
    assert 'carries nothing' in reasons[0]


def test_code_is_never_counted_against_a_page() -> None:
    """A page teaching HTML is not a page contaminated by it."""
    teaching = '# Forms\n\nA form looks like this.\n\n```html\n<form>\n  <input name="q" />\n</form>\n```\n'
    assert measure(teaching)['markup_ratio'] == 0.0


def test_inspect_reads_a_page_from_disk(tmp_path: Path) -> None:
    path = _write(tmp_path, 'page.md', MDX_PAGE)
    found = inspect('https://example.com/overview', path, 'page.md', 'abc123', 'Overview')

    assert found.url == 'https://example.com/overview'
    assert found.sha256 == 'abc123'
    assert found.bytes == path.stat().st_size
    assert found.shape is Shape.SUSPECT
    assert found.needs_a_reader


def test_a_broken_page_is_never_worth_a_reader(tmp_path: Path) -> None:
    path = _write(tmp_path, 'cut.md', UNCLOSED_PAGE)
    found = inspect('https://example.com/cut', path, 'cut.md')
    assert not found.needs_a_reader


def test_a_missing_file_reads_as_empty(tmp_path: Path) -> None:
    found = inspect('https://example.com/gone', tmp_path / 'nope.md', 'nope.md')
    assert found.shape is Shape.BROKEN
    assert found.bytes == 0
