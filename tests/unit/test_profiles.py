"""Profile files, the registry and the crawler factory's refusals."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from crawlee_lab import registry
from crawlee_lab.config import Settings
from crawlee_lab.crawlers.factory import build_crawler
from crawlee_lab.errors import ConfigurationError, ProfileError
from crawlee_lab.models import CrawlerKind, ExtractionMode, RunSpec
from crawlee_lab.profiles.loader import load_profile_file, save_profile_file
from crawlee_lab.profiles.schema import ProfileSpec

MINIMAL = """
description: A demo target
start_urls:
  - https://site.example/
crawler: parsel
selectors:
  title: h1
"""


def write(directory: Path, name: str, body: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f'{name}.yaml'
    path.write_text(body, encoding='utf-8')
    return path


def test_a_profile_takes_its_name_from_the_filename(tmp_path: Path) -> None:
    profile = load_profile_file(write(tmp_path, 'demo', MINIMAL))
    assert profile.name == 'demo'
    assert profile.crawler is CrawlerKind.PARSEL


def test_an_unknown_key_is_rejected(tmp_path: Path) -> None:
    path = write(tmp_path, 'demo', MINIMAL + '\ncrawlerr: parsel\n')
    with pytest.raises(ProfileError, match='not a valid profile'):
        load_profile_file(path)


def test_broken_yaml_names_the_file(tmp_path: Path) -> None:
    path = write(tmp_path, 'demo', 'start_urls: [\n')
    with pytest.raises(ProfileError, match=r'demo\.yaml is not valid YAML'):
        load_profile_file(path)


def test_a_profile_without_a_source_is_rejected(tmp_path: Path) -> None:
    path = write(tmp_path, 'demo', 'description: nothing to crawl\n')
    with pytest.raises(ProfileError, match='at least one start URL'):
        load_profile_file(path)


def test_saving_keeps_only_what_differs_from_the_defaults(tmp_path: Path) -> None:
    profile = ProfileSpec(
        name='demo',
        start_urls=['https://site.example/'],
        crawler=CrawlerKind.PARSEL,
        extract=ExtractionMode.AUTO,
    )
    body = save_profile_file(profile, tmp_path).read_text(encoding='utf-8')

    assert 'crawler: parsel' in body
    assert 'extract:' not in body
    assert body.startswith('name: demo')


def test_a_saved_profile_reloads_identically(tmp_path: Path) -> None:
    profile = ProfileSpec(
        name='demo',
        start_urls=['https://site.example/'],
        crawler=CrawlerKind.BEAUTIFULSOUP,
        selectors={'title': 'h1'},
        max_depth=2,
    )
    reloaded = load_profile_file(save_profile_file(profile, tmp_path))
    assert reloaded == profile


def test_overrides_win_over_the_profile() -> None:
    profile = ProfileSpec(name='demo', start_urls=['https://site.example/'], max_depth=1)
    assert profile.to_run_spec(max_depth=5).max_depth == 5
    assert profile.to_run_spec().max_depth == 1


def test_the_registry_finds_yaml_and_python_profiles(settings: Settings) -> None:
    write(settings.resolve(settings.profiles_dir), 'demo', MINIMAL)
    found = registry.discover(settings)

    assert 'demo' in found
    assert 'claude-docs' in found


def test_a_yaml_profile_shadows_a_python_one(settings: Settings) -> None:
    write(settings.resolve(settings.profiles_dir), 'claude-docs', MINIMAL)
    assert registry.discover(settings)['claude-docs'].crawler is CrawlerKind.PARSEL


def test_an_unknown_profile_lists_the_known_ones(settings: Settings) -> None:
    with pytest.raises(ProfileError, match='Available profiles'):
        registry.load('nope', settings)


def test_the_http_crawler_refuses_to_follow_links(settings: Settings) -> None:
    """It fetches raw bodies, so there is no parsed document to discover links in."""
    spec = RunSpec(
        name='demo',
        start_urls=['https://site.example/'],
        crawler=CrawlerKind.HTTP,
        max_depth=2,
    )

    async def handler(context: object) -> None:
        return None

    with pytest.raises(ConfigurationError, match='cannot discover links'):
        build_crawler(spec, settings, handler)


def test_a_negative_depth_is_rejected() -> None:
    with pytest.raises(ValidationError):
        RunSpec(name='demo', start_urls=['https://site.example/'], max_depth=-1)


def test_a_group_travels_from_the_file_into_the_run(tmp_path: Path) -> None:
    path = write(tmp_path, 'claude-docs', MINIMAL + 'group: docs-labs')

    profile = load_profile_file(path)

    assert profile.group == 'docs-labs'
    assert profile.to_run_spec().group == 'docs-labs'


def test_a_group_that_could_escape_its_folder_is_refused() -> None:
    """The group becomes a path segment, so it may not be one that walks out of the data tree."""
    for escape in ('../elsewhere', 'labs/docs', 'C:'):
        with pytest.raises(ValidationError):
            RunSpec(name='demo', start_urls=['https://site.example/'], group=escape)
