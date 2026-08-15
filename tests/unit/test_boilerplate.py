"""Detection and removal of the header and footer a site repeats on every page."""

from __future__ import annotations

from crawlee_lab.extraction.boilerplate import find_shared_edges, trim_shared_boilerplate

BANNER = '> ## Documentation Index\n> Fetch the index at https://site.example/llms.txt\n'


def pages(count: int, banner: str = BANNER, footer: str = '') -> list[str]:
    return [f'{banner}\n# Page {index}\n\nBody of page {index}.\n{footer}' for index in range(count)]


def test_a_shared_header_is_found() -> None:
    prefix, suffix = find_shared_edges(pages(5))
    assert prefix == [*BANNER.splitlines(), '']
    assert suffix == []


def test_a_shared_header_is_removed() -> None:
    trimmed = trim_shared_boilerplate(pages(5))
    assert all(document.startswith('# Page ') for document in trimmed)
    assert all('Documentation Index' not in document for document in trimmed)


def test_a_shared_footer_is_removed() -> None:
    trimmed = trim_shared_boilerplate(
        pages(5, banner='', footer='\nCopyright the site.\nAll rights reserved.')
    )
    assert all('All rights reserved' not in document for document in trimmed)
    assert all('Body of page' in document for document in trimmed)


def test_content_is_left_alone_when_nothing_is_shared() -> None:
    documents = ['# One\n\nAlpha.', '# Two\n\nBeta.', '# Three\n\nGamma.', '# Four\n\nDelta.']
    assert trim_shared_boilerplate(documents) == documents


def test_a_run_too_small_to_judge_is_left_alone() -> None:
    """Two pages sharing an opening line is a coincidence, not a banner."""
    documents = ['Shared\n\nAlpha.', 'Shared\n\nBeta.']
    assert trim_shared_boilerplate(documents) == documents


def test_a_minority_header_is_kept() -> None:
    documents = [*pages(3), '# Odd one\n\nNo banner here.', '# Another\n\nNor here.']
    assert trim_shared_boilerplate(documents)[0].startswith(BANNER.splitlines()[0])


def test_a_page_that_is_only_boilerplate_survives() -> None:
    documents = [*pages(4), BANNER]
    trimmed = trim_shared_boilerplate(documents)
    assert trimmed[-1] == BANNER


def test_blank_lines_alone_are_not_treated_as_a_banner() -> None:
    documents = ['\n\n# One\n\nAlpha.', '\n\n# Two\n\nBeta.', '\n\n# Three\n\nGamma.']
    prefix, _ = find_shared_edges(documents)
    assert any(line.strip() for line in prefix) or prefix == []


def test_empty_documents_do_not_break_detection() -> None:
    assert trim_shared_boilerplate(['', '', '']) == ['', '', '']


def test_a_block_of_pure_punctuation_is_not_a_banner() -> None:
    """A rule or a fence opens every page because it is structure, not because it is chrome.

    Removing it does not tidy the document; it opens whatever the delimiter was closing. The front
    matter case is handled before this point, but the invariant has to hold on its own.
    """
    documents = [f'---\n\n# Page {index}\n\nProse number {index}.' for index in range(5)]

    assert trim_shared_boilerplate(documents) == documents
