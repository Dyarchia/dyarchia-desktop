"""YAML front matter, kept whole.

A publisher that serves its documentation as markdown may open every page with a fenced metadata
block. The block is delimited by a line of three dashes, which every page therefore shares, and a
shared opening line is exactly what boilerplate detection is built to remove. Removing it leaves a
document whose metadata has lost its opening fence and is no longer parseable as anything.

Splitting it off first keeps both halves honest: the corpus decides what is boilerplate by looking
only at the prose, and the metadata travels through untouched, so a changed description still shows
up as a change.
"""

from __future__ import annotations

import re

DELIMITER = '---'
_KEY = re.compile(r'^[A-Za-z_][A-Za-z0-9_.-]*\s*:')


def _opens_like_yaml(lines: list[str]) -> bool:
    """Whether what follows the opening fence reads as metadata rather than as prose.

    A document may open with a horizontal rule and close a section with another, which gives the
    same pair of delimiters and none of the meaning. Asking what sits between them tells the two
    apart, and it does so without guessing at a maximum length: real front matter starts with a key.

    An earlier version capped the search at forty lines instead. On learn.chatgpt.com the median
    block is fifty-one lines and the longest is a hundred and twenty-five, so that cap silently
    declined to recognise most of the metadata it was written to protect.
    """
    for line in lines:
        if line.strip():
            return _KEY.match(line) is not None
    return False


def split(document: str) -> tuple[str, str]:
    """Separate a leading front matter block from the body, keeping the delimiters with the block.

    Returns an empty block when the document does not open with one, so the caller can treat every
    document the same way.
    """
    lines = document.splitlines()
    if not lines or lines[0].strip() != DELIMITER or not _opens_like_yaml(lines[1:]):
        return '', document

    for index in range(1, len(lines)):
        if lines[index].strip() == DELIMITER:
            block = '\n'.join(lines[: index + 1])
            body = '\n'.join(lines[index + 1 :])
            return block, body.lstrip('\n')

    return '', document


def join(block: str, body: str) -> str:
    """Reattach a block split off earlier, restoring the blank line the split consumed."""
    if not block:
        return body
    return f'{block}\n\n{body}' if body else block
