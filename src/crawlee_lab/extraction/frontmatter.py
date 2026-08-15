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

DELIMITER = '---'
MAX_LINES = 40


def split(document: str) -> tuple[str, str]:
    """Separate a leading front matter block from the body, keeping the delimiters with the block.

    Returns an empty block when the document does not open with one, so the caller can treat every
    document the same way.
    """
    lines = document.splitlines()
    if not lines or lines[0].strip() != DELIMITER:
        return '', document

    for index in range(1, min(len(lines), MAX_LINES + 1)):
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
