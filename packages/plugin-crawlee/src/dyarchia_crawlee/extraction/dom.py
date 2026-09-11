"""A single DOM interface over the different parsers Crawlee hands us.

Field selectors use a small extension of CSS so a whole extraction can be expressed on a command line:

    h1                  text of the first match
    .price@data-value   the data-value attribute of the first match
    all:.tag            a list with the text of every match
    all:a@href          a list with the href of every match
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag
from parsel import Selector

_ATTRIBUTE_NAME = re.compile(r'^[A-Za-z_][\w:.-]*$')
_LIST_PREFIX = 'all:'

URL_ATTRIBUTES = frozenset(
    {'href', 'src', 'data-src', 'data-href', 'srcset', 'poster', 'action', 'cite', 'formaction'}
)


@dataclass(frozen=True, slots=True)
class FieldSelector:
    """A parsed field selector: the CSS part plus how the value should be read."""

    css: str
    attribute: str | None = None
    many: bool = False

    @classmethod
    def parse(cls, raw: str) -> FieldSelector:
        expression = raw.strip()
        many = expression.startswith(_LIST_PREFIX)
        if many:
            expression = expression[len(_LIST_PREFIX) :].strip()

        attribute: str | None = None
        head, separator, tail = expression.rpartition('@')
        if separator and _ATTRIBUTE_NAME.match(tail) and head.strip():
            expression, attribute = head.strip(), tail

        if not expression:
            raise ValueError(f'empty CSS selector in {raw!r}')
        return cls(css=expression, attribute=attribute, many=many)


class DomAdapter(Protocol):
    """The minimum a parsed document must offer for extraction to work."""

    def html(self) -> str: ...

    def text(self) -> str: ...

    def title(self) -> str | None: ...

    def texts(self, css: str) -> list[str]: ...

    def attributes(self, css: str, attribute: str) -> list[str]: ...

    def hrefs(self, base_url: str, css: str = 'a') -> list[str]: ...

    def json_ld(self) -> list[Any]: ...


def read_field(dom: DomAdapter, selector: FieldSelector, base_url: str | None = None) -> Any:
    """Apply one parsed selector to a document, resolving URL-bearing attributes when possible."""
    if selector.attribute:
        values = dom.attributes(selector.css, selector.attribute)
        if base_url and selector.attribute.lower() in URL_ATTRIBUTES:
            values = [urljoin(base_url, value) for value in values]
    else:
        values = dom.texts(selector.css)

    if selector.many:
        return values
    return values[0] if values else None


def read_fields(dom: DomAdapter, selectors: dict[str, str], base_url: str | None = None) -> dict[str, Any]:
    """Apply every configured selector, keeping fields that yielded nothing as None."""
    return {name: read_field(dom, FieldSelector.parse(raw), base_url) for name, raw in selectors.items()}


def _parse_json_ld(blocks: list[str]) -> list[Any]:
    import json

    documents: list[Any] = []
    for block in blocks:
        try:
            documents.append(json.loads(block))
        except (ValueError, TypeError):
            continue
    return documents


class SoupAdapter:
    """DOM access backed by BeautifulSoup."""

    def __init__(self, soup: BeautifulSoup) -> None:
        self._soup = soup

    @classmethod
    def from_html(cls, html: str) -> SoupAdapter:
        return cls(BeautifulSoup(html, 'lxml'))

    def html(self) -> str:
        return str(self._soup)

    def text(self) -> str:
        return self._soup.get_text(separator=' ', strip=True)

    def title(self) -> str | None:
        for css in ('title', 'h1'):
            found = self._soup.select_one(css)
            if found is not None:
                text = found.get_text(strip=True)
                if text:
                    return text
        return None

    def texts(self, css: str) -> list[str]:
        return [text for node in self._soup.select(css) if (text := node.get_text(strip=True))]

    def attributes(self, css: str, attribute: str) -> list[str]:
        values: list[str] = []
        for node in self._soup.select(css):
            raw = node.get(attribute)
            if isinstance(raw, str):
                values.append(raw)
            elif isinstance(raw, list):
                values.append(' '.join(raw))
        return values

    def hrefs(self, base_url: str, css: str = 'a') -> list[str]:
        return [urljoin(base_url, href) for href in self.attributes(css, 'href')]

    def json_ld(self) -> list[Any]:
        blocks = [
            node.get_text()
            for node in self._soup.select('script[type="application/ld+json"]')
            if isinstance(node, Tag)
        ]
        return _parse_json_ld(blocks)


class ParselAdapter:
    """DOM access backed by Parsel."""

    def __init__(self, selector: Selector) -> None:
        self._selector = selector

    @classmethod
    def from_html(cls, html: str) -> ParselAdapter:
        return cls(Selector(text=html))

    def html(self) -> str:
        return str(self._selector.get() or '')

    def text(self) -> str:
        parts = (part.strip() for part in self._selector.css('::text').getall())
        return ' '.join(part for part in parts if part)

    def title(self) -> str | None:
        for css in ('title', 'h1'):
            values = self.texts(css)
            if values:
                return values[0]
        return None

    def texts(self, css: str) -> list[str]:
        collected: list[str] = []
        for node in self._selector.css(css):
            text = ' '.join(part.strip() for part in node.css('::text').getall() if part.strip())
            if text:
                collected.append(text)
        return collected

    def attributes(self, css: str, attribute: str) -> list[str]:
        return [
            value for node in self._selector.css(css) if (value := node.attrib.get(attribute)) is not None
        ]

    def hrefs(self, base_url: str, css: str = 'a') -> list[str]:
        return [urljoin(base_url, href) for href in self.attributes(css, 'href')]

    def json_ld(self) -> list[Any]:
        blocks = self._selector.css('script[type="application/ld+json"]::text').getall()
        return _parse_json_ld(blocks)


def adapt(parsed: Any, html: str | None = None) -> DomAdapter:
    """Wrap whatever a Crawlee context exposes as parsed content into a `DomAdapter`."""
    if isinstance(parsed, BeautifulSoup):
        return SoupAdapter(parsed)
    if isinstance(parsed, Selector):
        return ParselAdapter(parsed)
    if isinstance(parsed, Tag):
        return SoupAdapter(BeautifulSoup(str(parsed), 'lxml'))
    if html is not None:
        return SoupAdapter.from_html(html)
    raise TypeError(f'cannot adapt parsed content of type {type(parsed)!r}')
