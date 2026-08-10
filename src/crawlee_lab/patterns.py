"""URL pattern matching for link following.

Crawlee matches `include` and `exclude` patterns against the whole URL, anchored at the start. That
makes the obvious command line pattern `**/docs/**` silently match nothing, because `**` refuses to
cross the empty segment inside `https://`. This module gives the CLI a predictable contract instead:

    /docs/                     the URL contains this text
    /docs/*.html               contains this glob, where * stops at a path separator
    /docs/**                   contains this glob, where ** crosses path separators
    https://site.com/docs/**   starts with this glob, Crawlee's own full-URL semantics
    re:^https://site\\.com/\\d+  an explicit regular expression, anchored at the start
"""

from __future__ import annotations

import re

from crawlee import Glob

REGEX_PREFIX = 're:'


def _glob_body(pattern: str) -> str:
    """Translate a glob into a regex fragment where `*` stops at `/` and `**` does not."""
    fragments: list[str] = []
    index = 0
    length = len(pattern)

    while index < length:
        char = pattern[index]
        if char == '*':
            if pattern[index + 1 : index + 2] == '*':
                fragments.append('.*')
                index += 2
                continue
            fragments.append('[^/]*')
            index += 1
            continue
        if char == '?':
            fragments.append('[^/]')
            index += 1
            continue
        fragments.append(re.escape(char))
        index += 1

    return ''.join(fragments)


def to_matcher(pattern: str) -> re.Pattern[str] | Glob:
    """Turn one user-supplied pattern into something Crawlee can filter URLs with."""
    expression = pattern.strip()
    if not expression:
        raise ValueError('empty URL pattern')

    if expression.startswith(REGEX_PREFIX):
        return re.compile(expression[len(REGEX_PREFIX) :])

    if '://' in expression:
        return Glob(expression)

    return re.compile(f'.*{_glob_body(expression)}.*', re.DOTALL)


def to_matchers(patterns: list[str]) -> list[re.Pattern[str] | Glob]:
    return [to_matcher(pattern) for pattern in patterns]
