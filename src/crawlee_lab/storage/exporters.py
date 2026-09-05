"""Serialisation of scraped items to the formats a run asked for."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from crawlee_lab.models import OutputFormat, RunSpec, ScrapedItem

_UNSAFE = re.compile(r'[^A-Za-z0-9._-]+')


def slugify_url(url: str, fallback: str = 'index') -> str:
    """Derive a filesystem-safe stem from a URL, keeping enough of the path to stay unique."""
    parsed = urlparse(url)
    parts = [parsed.netloc, parsed.path.strip('/'), parsed.query]
    slug = _UNSAFE.sub('-', '/'.join(part for part in parts if part)).strip('-')
    return slug or fallback


def _write_json(items: list[ScrapedItem], target: Path) -> None:
    payload = [item.model_dump(mode='json') for item in items]
    target.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')


def _write_jsonl(items: list[ScrapedItem], target: Path) -> None:
    lines = (json.dumps(item.model_dump(mode='json'), ensure_ascii=False) for item in items)
    target.write_text('\n'.join(lines) + '\n' if items else '', encoding='utf-8')


def _write_csv(items: list[ScrapedItem], target: Path) -> None:
    rows = [item.flatten() for item in items]
    columns: list[str] = []
    for row in rows:
        columns.extend(key for key in row if key not in columns)

    with target.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


def _write_markdown(items: list[ScrapedItem], directory: Path) -> list[Path]:
    directory.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for item in items:
        target = directory / f'{slugify_url(item.url)}.md'
        heading = item.title or item.url
        body = item.content or ''
        target.write_text(f'# {heading}\n\n<{item.url}>\n\n{body}\n', encoding='utf-8')
        written.append(target)
    return written


def export_items(items: list[ScrapedItem], spec: RunSpec, output_dir: Path) -> list[Path]:
    """Write the run output in every requested format and return the paths touched."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for fmt in spec.formats:
        if fmt is OutputFormat.MARKDOWN:
            written.extend(_write_markdown(items, output_dir / spec.name))
            continue

        target = output_dir / f'{spec.name}.{fmt.value}'
        match fmt:
            case OutputFormat.JSON:
                _write_json(items, target)
            case OutputFormat.JSONL:
                _write_jsonl(items, target)
            case OutputFormat.CSV:
                _write_csv(items, target)
        written.append(target)

    return written
