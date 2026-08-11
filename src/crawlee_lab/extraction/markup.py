"""Cleaning markup that arrives embedded in a document that claims to be markdown.

Documentation sites built on MDX serve their prose pages as prose, and their landing pages as the
JSX layout that produced them: class names, inline SVG path coordinates, wrapper elements. Nothing
is missing from such a page, but for change tracking it is unusable, because nudging an icon by a
pixel would read as a content change.

Fenced code blocks are left exactly as they are. On a documentation site an HTML example inside a
fence is the content, and stripping tags there would corrupt what the page is trying to teach.
"""

from __future__ import annotations

import re

_FENCE = re.compile(r'^\s*(?:```|~~~)')
_VOID_BLOCKS = re.compile(r'<(svg|style|script|noscript)\b[^>]*>.*?</\1\s*>', re.DOTALL | re.IGNORECASE)
_SELF_CLOSING_MEDIA = re.compile(r'<(svg|path|circle|rect|line|polygon)\b[^>]*/>', re.IGNORECASE)
_ANCHOR = re.compile(r'<a\b[^>]*?href=["\']([^"\']+)["\'][^>]*>(.*?)</a\s*>', re.DOTALL | re.IGNORECASE)
_ANY_TAG = re.compile(r'</?[a-zA-Z][^>]*>')
_OPEN_TAG = re.compile(r'<[a-zA-Z][\w.:-]*((?:\s+[^<>]*?)?)\s*/?>')
_TAGGED_LINE = re.compile(r'<[a-zA-Z/]')
_BLANK_RUN = re.compile(r'\n{3,}')
_SPACE_RUN = re.compile(r'[ \t]{2,}')
_MAX_INDENT = 3

MARKUP_LINE_RATIO = 0.15
TEXTUAL_ATTRIBUTES = ('title', 'label', 'heading', 'alt', 'description')


def _attribute_pattern(name: str) -> re.Pattern[str]:
    return re.compile(rf'\b{name}\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', re.IGNORECASE)


_ATTRIBUTE = {name: _attribute_pattern(name) for name in TEXTUAL_ATTRIBUTES}
_HREF = _attribute_pattern('href')


def _outside_fences(text: str) -> list[str]:
    """Line indices that are not inside a fenced code block."""
    inside = False
    free: list[str] = []
    for line in text.splitlines():
        if _FENCE.match(line):
            inside = not inside
            continue
        if not inside:
            free.append(line)
    return free


def looks_like_markup(text: str) -> bool:
    """Whether enough of this document is raw markup to be worth cleaning."""
    lines = [line for line in _outside_fences(text) if line.strip()]
    if not lines:
        return False
    tagged = sum(1 for line in lines if _TAGGED_LINE.search(line))
    return tagged / len(lines) >= MARKUP_LINE_RATIO


def visible_attribute_text(attributes: str) -> str:
    """The part of a tag's attributes a reader actually sees on the page.

    Component syntax puts real prose in attributes: `<Step title="Connect GitLab">` and
    `<Update label="August 2026">` carry headings that appear nowhere in the element's children.
    Stripping the tag without rescuing them loses content rather than noise.
    """
    values: list[str] = []
    for pattern in _ATTRIBUTE.values():
        for match in pattern.finditer(attributes):
            value = (match.group(1) or match.group(2) or '').strip()
            if value and not value.startswith('{'):
                values.append(value)
    return ' - '.join(dict.fromkeys(values))


def _replace_anchor(match: re.Match[str]) -> str:
    """Flatten a link into markdown, keeping its label on one line and its words apart."""
    label = ' '.join(_ANY_TAG.sub(' ', match.group(2)).split())
    return f'[{label}]({match.group(1)})' if label else ''


def _first_value(pattern: re.Pattern[str], attributes: str) -> str:
    found = pattern.search(attributes)
    return (found.group(1) or found.group(2) or '').strip() if found else ''


def _replace_open_tag(match: re.Match[str]) -> str:
    """Turn an opening tag into whatever of it a reader would have seen, or into nothing."""
    attributes = match.group(1) or ''
    text = visible_attribute_text(attributes)
    href = _first_value(_HREF, attributes)

    if text and href:
        return f'\n[{text}]({href})\n'
    if text:
        return f'\n**{text}**\n'
    return ''


def _clean_segment(segment: str) -> str:
    segment = _VOID_BLOCKS.sub('', segment)
    segment = _SELF_CLOSING_MEDIA.sub('', segment)
    segment = _ANCHOR.sub(_replace_anchor, segment)
    segment = _OPEN_TAG.sub(_replace_open_tag, segment)
    segment = _ANY_TAG.sub(' ', segment)
    return '\n'.join(_tidy_line(line) for line in segment.splitlines())


def _tidy_line(line: str) -> str:
    """Collapse the spaces a removed tag left behind, and cap the indentation it was nested in.

    Unwrapping adjacent elements would otherwise run their words together, and layout indentation
    of four spaces or more would make markdown render the prose as a code block.
    """
    indent = len(line) - len(line.lstrip())
    body = _SPACE_RUN.sub(' ', line.strip())
    return ' ' * min(indent, _MAX_INDENT) + body if body else ''


def clean_embedded_markup(text: str) -> str:
    """Reduce a markdown document carrying raw markup to the prose and links inside it."""
    output: list[str] = []
    buffer: list[str] = []
    inside = False

    for line in text.splitlines():
        if _FENCE.match(line):
            if not inside:
                output.append(_clean_segment('\n'.join(buffer)))
                buffer = []
            else:
                output.append('\n'.join(buffer))
                buffer = []
            output.append(line)
            inside = not inside
            continue
        buffer.append(line)

    output.append('\n'.join(buffer) if inside else _clean_segment('\n'.join(buffer)))
    return _BLANK_RUN.sub('\n\n', '\n'.join(output)).strip() + '\n'


def clean_if_markup(text: str) -> str:
    """Clean the document only when it is markup-heavy, leaving ordinary prose untouched."""
    return clean_embedded_markup(text) if looks_like_markup(text) else text
