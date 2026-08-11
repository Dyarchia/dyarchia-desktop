"""URL shaping helpers shared by seeding, snapshots and the manifest."""

from __future__ import annotations

import re
from pathlib import PurePosixPath
from urllib.parse import urlparse, urlunparse

_UNSAFE_SEGMENT = re.compile(r'[^A-Za-z0-9._-]+')
_RESERVED_STEMS = frozenset({'', '.', '..'})
INDEX_STEM = 'index'
CANONICAL_URL_KEY = 'canonical_url'


def suffix_candidates(url: str, suffix: str | None) -> list[str]:
    """Every place the suffixed variant of a page might live, best guess first.

    A documentation site that serves `page.md` alongside `page` puts the variant of a section root
    at `section/index.md`, not at `section.md`. Which of the two a URL is cannot be known from the
    URL alone, so both are offered and the fetch decides.
    """
    if not suffix:
        return [url]

    parsed = urlparse(url)
    path = parsed.path

    if path.endswith(suffix):
        return [url]

    def at(new_path: str) -> str:
        return urlunparse(parsed._replace(path=new_path))

    if not path or path.endswith('/'):
        return [at(f'{path}{INDEX_STEM}{suffix}')]
    return [at(f'{path}{suffix}'), at(f'{path}/{INDEX_STEM}{suffix}')]


def apply_suffix(url: str, suffix: str | None) -> str | None:
    """The first place to look for the suffixed variant of a page."""
    candidates = suffix_candidates(url, suffix)
    return candidates[0] if candidates else None


def strip_suffix(url: str, suffix: str | None) -> str:
    """Undo `apply_suffix`, so records are keyed by the page rather than by how it was fetched."""
    if not suffix:
        return url

    parsed = urlparse(url)
    if not parsed.path.endswith(suffix):
        return url
    return urlunparse(parsed._replace(path=parsed.path[: -len(suffix)]))


def _safe_segment(segment: str) -> str:
    cleaned = _UNSAFE_SEGMENT.sub('-', segment).strip('-.')
    return cleaned if cleaned not in _RESERVED_STEMS else INDEX_STEM


def snapshot_relative_path(url: str, extension: str = '.md') -> PurePosixPath:
    """Mirror a URL as a repository path, so `git diff` reads like a tour of the site.

    Every segment is sanitised and reserved stems are replaced, which keeps the result inside the
    snapshot directory no matter what the target puts in its URLs.
    """
    parsed = urlparse(url)
    segments = [_safe_segment(parsed.netloc or 'unknown-host')]
    segments.extend(_safe_segment(part) for part in parsed.path.split('/') if part)

    if parsed.query:
        segments.append(_safe_segment(parsed.query))
    if len(segments) == 1 or parsed.path.endswith('/'):
        segments.append(INDEX_STEM)

    return PurePosixPath(*segments[:-1], f'{segments[-1]}{extension}')
