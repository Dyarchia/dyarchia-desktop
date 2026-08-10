"""URL suffix rewriting and snapshot path derivation."""

from __future__ import annotations

import pytest

from crawlee_lab.urls import apply_suffix, snapshot_relative_path, strip_suffix

PAGE = 'https://site.example/docs/intro'


def test_apply_suffix_appends_to_the_path() -> None:
    assert apply_suffix(PAGE, '.md') == 'https://site.example/docs/intro.md'


def test_apply_suffix_is_idempotent() -> None:
    once = apply_suffix(PAGE, '.md')
    assert once is not None
    assert apply_suffix(once, '.md') == once


def test_apply_suffix_refuses_directory_urls() -> None:
    assert apply_suffix('https://site.example/docs/', '.md') is None
    assert apply_suffix('https://site.example', '.md') is None


def test_apply_suffix_without_a_suffix_is_a_no_op() -> None:
    assert apply_suffix(PAGE, None) == PAGE


def test_strip_suffix_round_trips() -> None:
    suffixed = apply_suffix(PAGE, '.md')
    assert suffixed is not None
    assert strip_suffix(suffixed, '.md') == PAGE


def test_strip_suffix_leaves_unsuffixed_urls_alone() -> None:
    assert strip_suffix(PAGE, '.md') == PAGE


@pytest.mark.parametrize(
    ('url', 'expected'),
    [
        ('https://site.example/docs/intro', 'site.example/docs/intro.md'),
        ('https://site.example/', 'site.example/index.md'),
        ('https://site.example', 'site.example/index.md'),
        ('https://site.example/docs/', 'site.example/docs/index.md'),
        ('https://site.example/a b/c?d=1', 'site.example/a-b/c/d-1.md'),
    ],
)
def test_snapshot_paths_mirror_the_url(url: str, expected: str) -> None:
    assert snapshot_relative_path(url).as_posix() == expected


def test_snapshot_paths_cannot_escape_upwards() -> None:
    """A target that puts traversal in its URLs must not be able to steer where we write."""
    path = snapshot_relative_path('https://site.example/../../etc/passwd')
    assert '..' not in path.parts
