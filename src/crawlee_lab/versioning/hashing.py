"""Content fingerprints.

Text is normalised before hashing so that a change of line endings or of trailing whitespace, which
no reader would call a change, does not show up as one.
"""

from __future__ import annotations

import hashlib


def normalise(text: str) -> str:
    """Collapse the incidental differences that would otherwise look like content changes."""
    lines = [line.rstrip() for line in text.replace('\r\n', '\n').replace('\r', '\n').split('\n')]
    return '\n'.join(lines).strip() + '\n'


def content_hash(text: str) -> str:
    return hashlib.sha256(normalise(text).encode('utf-8')).hexdigest()
