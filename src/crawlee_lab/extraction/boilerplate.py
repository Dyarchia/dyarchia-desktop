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

from crawlee_lab.extraction import frontmatter

MIN_DOCUMENTS = 3
MIN_SHARE = 0.9
MAX_BLOCK_LINES = 25

# Lines that structure a document rather than say anything in it. A block made only of these is
# shared by every page because it is punctuation, not because it is a banner, and removing it
# leaves whatever it was delimiting broken open.
_STRUCTURAL = frozenset({'---', '***', '___', '```', '=', '-'})


def _is_structural_only(block: tuple[str, ...]) -> bool:
    lines = [line.strip() for line in block if line.strip()]
    return bool(lines) and all(
        line in _STRUCTURAL or set(line) <= {'-', '=', '*', '_', '`'} for line in lines
    )


def _shared_block(edges: list[tuple[str, ...]], share: float) -> tuple[str, ...]:
    """The longest run of lines that at least `share` of the documents open or close with."""
    threshold = max(MIN_DOCUMENTS, int(len(edges) * share))

    for length in range(min(MAX_BLOCK_LINES, min(len(edge) for edge in edges)), 0, -1):
        candidate, count = Counter(edge[:length] for edge in edges).most_common(1)[0]
        if count < threshold or not any(line.strip() for line in candidate):
            continue
        if _is_structural_only(candidate):
            continue
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


def _split_preamble(document: str) -> tuple[str, str]:
    """Separate what a page puts above its shared banner from the rest of the page.

    Two things can sit there and differ on every page: a front matter block, and the page's own
    title. Either one stops the banner from being a prefix of anything, which is the only shape the
    shared-edge search can see. Setting them aside first is what lets a banner that comes third on
    the page be recognised as the banner it is.
    """
    block, rest = frontmatter.split(document)
    lines = rest.splitlines()

    if lines and lines[0].lstrip().startswith('#'):
        body = '\n'.join(lines[1:]).lstrip('\n')
        return frontmatter.join(block, lines[0]), body

    return block, rest


def _join_preamble(preamble: str, body: str) -> str:
    if not preamble:
        return body
    return f'{preamble}{"\n"}{"\n"}{body}' if body else preamble


def trim_shared_boilerplate(documents: list[str], share: float = MIN_SHARE) -> list[str]:
    """Drop the repeated header and footer from every document that carries them.

    A page that is nothing but the shared block is left exactly as it was, rather than vanishing
    from the run.
    """
    split = [_split_preamble(document) for document in documents]
    bodies = [body for _, body in split]

    prefix, suffix = find_shared_edges(bodies, share)
    if not prefix and not suffix:
        return list(documents)

    return [_join_preamble(preamble, _strip_edges(body, prefix, suffix) or body) for preamble, body in split]
