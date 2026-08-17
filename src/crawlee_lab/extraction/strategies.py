"""Extraction strategies applied to a fetched page."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import trafilatura

from crawlee_lab.extraction.dom import DomAdapter, read_fields
from crawlee_lab.extraction.markup import clean_if_markup, repair_glued_fences
from crawlee_lab.models import ExtractionMode, RunSpec, ScrapedItem, utcnow


@dataclass(slots=True)
class RawPage:
    """A fetched page normalised away from whichever Crawlee context produced it."""

    url: str
    status_code: int | None = None
    dom: DomAdapter | None = None
    body_text: str | None = None
    depth: int = 0
    label: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def main_content(html: str, url: str) -> str | None:
    """Strip navigation and boilerplate, returning the article body as markdown.

    The markdown is repaired before it is returned. Extraction sometimes closes a paragraph and
    opens the code block after it on the same line, which produces a delimiter no parser can see
    and inverts every fence that follows. That is a defect of this step, so it is corrected here,
    where it is made. Documents fetched as markdown from a publisher never pass through this
    function: those are stored as published, and repairing somebody else's document would break
    the one promise a snapshot makes.
    """
    extracted = trafilatura.extract(
        html,
        url=url,
        output_format='markdown',
        include_links=True,
        include_tables=True,
        favor_recall=True,
    )
    return repair_glued_fences(extracted) if extracted else extracted


def _content_for(mode: ExtractionMode, page: RawPage) -> str | None:
    if mode is ExtractionMode.NONE or mode is ExtractionMode.LINKS or mode is ExtractionMode.JSONLD:
        return None

    if page.dom is None:
        if page.body_text is None or mode is ExtractionMode.HTML:
            return page.body_text
        return clean_if_markup(page.body_text)

    if mode is ExtractionMode.HTML:
        return page.dom.html()
    if mode is ExtractionMode.TEXT:
        return page.dom.text()
    return main_content(page.dom.html(), page.url) or page.dom.text()


def markdown_title(text: str) -> str | None:
    """First level-one heading of a markdown document, used when there is no DOM to ask."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith('# '):
            return stripped[2:].strip() or None
    return None


def build_item(page: RawPage, spec: RunSpec) -> ScrapedItem:
    """Combine the configured extraction mode and selectors into a single record."""
    fields: dict[str, Any] = {}
    links: list[str] = []
    title: str | None = None

    if page.dom is not None:
        title = page.dom.title()
        if spec.selectors:
            fields.update(read_fields(page.dom, spec.selectors, page.url))
        if spec.extract is ExtractionMode.LINKS:
            links = page.dom.hrefs(page.url, spec.link_selector)
        elif spec.extract is ExtractionMode.JSONLD:
            fields['json_ld'] = page.dom.json_ld()

    fields.update(page.extra)

    content = _content_for(spec.extract, page)
    if title is None and content:
        title = markdown_title(content)

    return ScrapedItem(
        url=page.url,
        label=page.label,
        depth=page.depth,
        status_code=page.status_code,
        fetched_at=utcnow(),
        title=title,
        content=content,
        fields=fields,
        links=links,
    )
