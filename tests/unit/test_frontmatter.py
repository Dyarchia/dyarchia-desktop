"""Front matter, which must survive the corpus-wide boilerplate pass intact."""

from __future__ import annotations

from crawlee_lab.extraction import frontmatter
from crawlee_lab.extraction.boilerplate import trim_shared_boilerplate

BANNER = '> Documentation index\n> Fetch it at /llms.txt'


def page(title: str, body: str) -> str:
    return f'---\ntitle: {title}\nurl: https://site.example/{title}\n---\n\n{BANNER}\n\n{body}'


def test_a_document_without_front_matter_is_returned_whole() -> None:
    block, body = frontmatter.split('# Heading\n\nProse.')
    assert block == ''
    assert body == '# Heading\n\nProse.'


def test_a_block_keeps_its_delimiters() -> None:
    block, body = frontmatter.split('---\ntitle: One\n---\n\nProse.')
    assert block == '---\ntitle: One\n---'
    assert body == 'Prose.'


def test_an_unclosed_block_is_not_a_block() -> None:
    """Three dashes at the top of a document may just be a horizontal rule."""
    document = '---\n\nSome prose that never closes a metadata block.'
    assert frontmatter.split(document) == ('', document)


def test_a_split_block_rejoins_to_something_equivalent() -> None:
    document = '---\ntitle: One\n---\n\nProse.'
    block, body = frontmatter.split(document)
    assert frontmatter.join(block, body) == document


def test_the_shared_banner_goes_and_the_metadata_stays() -> None:
    """The opening delimiter is shared by every page, and must not be read as a shared banner."""
    documents = [page('one', 'First.'), page('two', 'Second.'), page('three', 'Third.')]

    trimmed = trim_shared_boilerplate(documents)

    for document, expected in zip(trimmed, ('one', 'two', 'three'), strict=True):
        assert document.startswith('---\ntitle: ')
        assert f'title: {expected}' in document
        assert 'Documentation index' not in document
    assert trimmed[0].endswith('First.')
