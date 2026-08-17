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
from enum import StrEnum

_FENCE_DELIMITER = re.compile(r'^ {0,3}(`{3,}|~{3,})(.*)$')
_VOID_BLOCKS = re.compile(r'<(svg|style|script|noscript)\b[^>]*>.*?</\1\s*>', re.DOTALL | re.IGNORECASE)
_SELF_CLOSING_MEDIA = re.compile(r'<(svg|path|circle|rect|line|polygon)\b[^>]*/>', re.IGNORECASE)
_ANCHOR = re.compile(r'<a\b[^>]*?href=["\']([^"\']+)["\'][^>]*>(.*?)</a\s*>', re.DOTALL | re.IGNORECASE)
_ANY_TAG = re.compile(r'</?[a-zA-Z][^>]*>')
_OPEN_TAG = re.compile(r'<[a-zA-Z][\w.:-]*((?:\s+[^<>]*?)?)\s*/?>')
_TAGGED_LINE = re.compile(r'<[a-zA-Z/]')
_COMPONENT_DEFINITION = re.compile(r'^export\s+(const|default|function)\b')
_MARKDOWN_HEADING = re.compile(r'^#{1,6}\s')
_GLUED_FENCE = re.compile(r'^(?!\s*[`~]{3,}\s*$)(.*?)([`~]{3,})\s*$')
_BLANK_RUN = re.compile(r'\n{3,}')
_SPACE_RUN = re.compile(r'[ \t]{2,}')
_MAX_INDENT = 3

MARKUP_LINE_RATIO = 0.15
TEXTUAL_ATTRIBUTES = ('title', 'label', 'heading', 'alt', 'description')


class FenceState(StrEnum):
    """Where a single line sits relative to the fenced code blocks of its document."""

    OUTSIDE = 'outside'
    OPEN = 'open'
    INSIDE = 'inside'
    CLOSE = 'close'


def _attribute_pattern(name: str) -> re.Pattern[str]:
    return re.compile(rf'\b{name}\s*=\s*(?:"([^"]*)"|\'([^\']*)\')', re.IGNORECASE)


_ATTRIBUTE = {name: _attribute_pattern(name) for name in TEXTUAL_ATTRIBUTES}
_HREF = _attribute_pattern('href')


def fence_states(text: str) -> list[FenceState]:
    """Classify every line by its relationship to the fenced code blocks around it.

    Counting delimiters and flipping a flag on each one is wrong, and wrong in a way that matters:
    documentation about markdown wraps a three-backtick block inside a four-backtick one, which a
    flag-flipper reads as two openings and thereafter has the document inverted, treating the code
    samples as prose and the prose as code. `ai.google.dev/gemini-api/docs/generate-content/tokens`
    is one such page, and it is not the only one.

    A fence therefore closes only on a delimiter of the same character, at least as long as the one
    that opened it, carrying nothing after it. That is the rule the markdown is written to.
    """
    states: list[FenceState] = []
    marker = ''

    for line in text.splitlines():
        match = _FENCE_DELIMITER.match(line)

        if not marker:
            opens = match is not None and not (match.group(1)[0] == '`' and '`' in match.group(2))
            if opens and match is not None:
                marker = match.group(1)
            states.append(FenceState.OPEN if opens else FenceState.OUTSIDE)
            continue

        closes = (
            match is not None
            and match.group(1)[0] == marker[0]
            and len(match.group(1)) >= len(marker)
            and not match.group(2).strip()
        )
        if closes:
            marker = ''
        states.append(FenceState.CLOSE if closes else FenceState.INSIDE)

    return states


def ends_inside_a_fence(states: list[FenceState]) -> bool:
    """Whether the document stopped with a fence still open, which is what truncation looks like."""
    for state in reversed(states):
        if state is FenceState.CLOSE:
            return False
        if state is FenceState.OPEN:
            return True
    return False


def repair_glued_fences(text: str) -> str:
    """Put back on its own line an opening fence that arrived glued to the text before it.

    Extracting markdown from HTML can collapse a paragraph and the code block that follows it onto
    a single line, leaving `...for example:```` with the delimiter stranded mid-line. A fence has to
    open its own line to count, so no parser sees it, and every delimiter after it is read as the
    opposite of what it is: the page's prose is treated as code, and the page's code as prose. On
    `ai.google.dev` this swallowed the closing section of seventeen pages.

    The repair is refused unless it works. A document whose fences already balance is returned
    untouched, and so is one that stays unbalanced afterwards, because a page that is merely broken
    is worth more than a page that has been guessed at.
    """
    if not ends_inside_a_fence(fence_states(text)):
        return text

    repaired: list[str] = []
    for line in text.splitlines():
        match = _GLUED_FENCE.match(line)
        if match and match.group(1).strip():
            repaired.append(match.group(1).rstrip())
            repaired.append(match.group(2))
        else:
            repaired.append(line)

    candidate = '\n'.join(repaired) + ('\n' if text.endswith('\n') else '')
    return candidate if not ends_inside_a_fence(fence_states(candidate)) else text


def strip_component_definitions(text: str) -> str:
    """Remove the JavaScript an MDX page defines its interactive components with.

    A documentation page built on MDX may declare the component it renders in the document itself:
    `export const ClaudeExplorer = () => {...}`, a thousand lines of arrow functions, hooks and
    style objects ahead of any prose. What a reader of the published page sees is the rendered
    widget; what a reader of the markdown gets is the source, and no amount of tag-stripping helps
    because the problem is not tags.

    The invocation is kept. `<ContextWindow />` tells a reader that something interactive stood
    here, which is worth knowing; the four hundred lines that built it are not.

    Two things bound the removal. Anything inside a code fence is untouched, because a page
    teaching JavaScript is a page whose `export const` is the lesson. And a markdown heading ends
    the block wherever it is found, so a brace counted inside a string literal costs one component
    rather than the rest of the document.
    """
    lines = text.splitlines()
    states = fence_states(text)

    kept: list[str] = []
    depth = 0
    inside = False
    quoted = False

    for line, state in zip(lines, states, strict=True):
        if state is not FenceState.OUTSIDE:
            kept.append(line)
            continue

        if not inside and _COMPONENT_DEFINITION.match(line):
            inside, depth, quoted = True, 0, False

        if not inside:
            kept.append(line)
            continue

        if _MARKDOWN_HEADING.match(line) and not quoted:
            inside = False
            kept.append(line)
            continue

        quoted ^= line.count('`') % 2 == 1
        depth += sum(line.count(c) for c in '{([') - sum(line.count(c) for c in '})]')
        if depth <= 0:
            inside = False

    if inside:
        return text

    return '\n'.join(kept) + ('\n' if text.endswith('\n') else '')


def lines_outside_fences(text: str) -> list[str]:
    """The lines of a document that are not inside a fenced code block.

    Every judgement about how a document is written has to ask this first. A fenced block on a
    documentation page routinely holds HTML, JSX or a nav-shaped list of links as its subject
    matter, and counting those as defects would condemn the pages that teach them.
    """
    return [
        line
        for line, state in zip(text.splitlines(), fence_states(text), strict=True)
        if state is FenceState.OUTSIDE
    ]


def markup_line_ratio(text: str) -> float:
    """How much of a document, outside its code fences, is raw markup rather than prose."""
    lines = [line for line in lines_outside_fences(text) if line.strip()]
    if not lines:
        return 0.0
    tagged = sum(1 for line in lines if _TAGGED_LINE.search(line))
    return tagged / len(lines)


def looks_like_markup(text: str) -> bool:
    """Whether enough of this document is raw markup to be worth cleaning."""
    return markup_line_ratio(text) >= MARKUP_LINE_RATIO


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
    states = fence_states(text)

    for line, state in zip(text.splitlines(), states, strict=True):
        if state is FenceState.OPEN:
            output.append(_clean_segment('\n'.join(buffer)))
        elif state is FenceState.CLOSE:
            output.append('\n'.join(buffer))
        else:
            buffer.append(line)
            continue
        buffer = []
        output.append(line)

    trailing = '\n'.join(buffer)
    output.append(trailing if ends_inside_a_fence(states) else _clean_segment(trailing))
    return _BLANK_RUN.sub('\n\n', '\n'.join(output)).strip() + '\n'


def clean_if_markup(text: str) -> str:
    """Clean the document only where it needs it, leaving ordinary prose untouched.

    Two different things arrive looking like one. A landing page is markup all the way down and is
    reduced to the prose inside it, which is what the ratio measures. A prose page that happens to
    define an interactive component carries a block of JavaScript and is otherwise fine, and it
    fails that ratio precisely because it is mostly prose. Removing the definition is therefore
    unconditional and the ratio is measured afterwards, on what is left.
    """
    text = strip_component_definitions(text)
    return clean_embedded_markup(text) if looks_like_markup(text) else text
