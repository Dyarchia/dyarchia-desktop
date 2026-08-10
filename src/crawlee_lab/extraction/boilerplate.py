"""Removal of the header and footer a site repeats on every page.

Extraction that starts from HTML can lean on structure to tell content from chrome. Text that
arrives already clean, such as a publisher's own markdown, has no structure left to lean on, and any
banner the publisher injects into every page survives into the snapshot.

The corpus itself gives the answer. A block of lines that opens or closes nearly every page of a run
is chrome by definition, whatever it says. Removing it is also free for change tracking: content
identical across every page is constant, and constant content never appears in a diff.
"""

from __future__ import annotations

from collections import Counter

MIN_DOCUMENTS = 3
MIN_SHARE = 0.9
MAX_BLOCK_LINES = 25


def _shared_block(edges: list[tuple[str, ...]], share: float) -> tuple[str, ...]:
    """The longest run of lines that at least `share` of the documents open or close with."""
    threshold = max(MIN_DOCUMENTS, int(len(edges) * share))

    for length in range(min(MAX_BLOCK_LINES, min(len(edge) for edge in edges)), 0, -1):
        candidate, count = Counter(edge[:length] for edge in edges).most_common(1)[0]
        if count >= threshold and any(line.strip() for line in candidate):
            return candidate

    return ()


def find_shared_edges(documents: list[str], share: float = MIN_SHARE) -> tuple[list[str], list[str]]:
    """Return the leading and trailing line blocks shared by almost every document."""
    if len(documents) < MIN_DOCUMENTS:
        return [], []

    split = [document.splitlines() for document in documents]
    usable = [lines for lines in split if lines]
    if len(usable) < MIN_DOCUMENTS:
        return [], []

    heads = [tuple(lines[:MAX_BLOCK_LINES]) for lines in usable]
    tails = [tuple(reversed(lines[-MAX_BLOCK_LINES:])) for lines in usable]

    prefix = _shared_block(heads, share)
    suffix = _shared_block(tails, share)
    return list(prefix), list(reversed(suffix))


def _strip_edges(document: str, prefix: list[str], suffix: list[str]) -> str:
    lines = document.splitlines()
    changed = False

    if prefix and lines[: len(prefix)] == prefix and len(lines) > len(prefix):
        lines = lines[len(prefix) :]
        changed = True
    if suffix and lines[-len(suffix) :] == suffix and len(lines) > len(suffix):
        lines = lines[: -len(suffix)]
        changed = True

    return '\n'.join(lines).strip('\n') if changed else document


def trim_shared_boilerplate(documents: list[str], share: float = MIN_SHARE) -> list[str]:
    """Drop the repeated header and footer from every document that carries them.

    A page that is nothing but the shared block is left exactly as it was, rather than vanishing
    from the run.
    """
    prefix, suffix = find_shared_edges(documents, share)
    if not prefix and not suffix:
        return list(documents)

    return [_strip_edges(document, prefix, suffix) or document for document in documents]
