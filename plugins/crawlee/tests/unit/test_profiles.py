"""Profile files, the registry and the crawler factory's refusals."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

from dyarchia_crawlee import registry
from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.crawlers.factory import build_crawler
from dyarchia_crawlee.errors import ConfigurationError, ProfileError
from dyarchia_crawlee.models import CrawlerKind, ExtractionMode, RunSpec
from dyarchia_crawlee.profiles.loader import (
    delete_profile,
    load_profile_file,
    render_profile,
    save_profile,
    save_profile_text,
)
from dyarchia_crawlee.profiles.schema import ProfileSpec

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
    body = render_profile(profile)

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
    reloaded = load_profile_file(write(tmp_path, 'demo', render_profile(profile)))
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


def git(path: Path, *args: str) -> None:
    subprocess.run(['git', *args], cwd=path, check=True, capture_output=True)


def versioned_profiles(root: Path) -> Path:
    """A corpus repository the way the split left one, with profiles/ tracked."""
    root.mkdir(parents=True, exist_ok=True)
    git(root, 'init', '-q')
    git(root, 'config', 'user.email', 'test@example.invalid')
    git(root, 'config', 'user.name', 'Test')
    (root / '.gitignore').write_text('output/\n', encoding='utf-8')
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'start')
    directory = root / 'profiles'
    directory.mkdir()
    return directory


def demo(name: str = 'demo', description: str | None = None) -> ProfileSpec:
    return ProfileSpec(name=name, description=description, start_urls=['https://s/one'])


def test_saving_a_tracked_profile_commits_it(tmp_path: Path) -> None:
    """The profile lives beside the corpus it describes, and that corpus is versioned."""
    directory = versioned_profiles(tmp_path / 'corpus-repo')

    saved = save_profile(demo(), directory)

    assert saved.versioned
    assert saved.revision is not None
    logged = subprocess.run(
        ['git', 'log', '--oneline'], cwd=tmp_path / 'corpus-repo', capture_output=True, text=True, check=True
    )
    assert 'profile(demo): added' in logged.stdout


def test_saving_the_same_profile_twice_commits_once(tmp_path: Path) -> None:
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    save_profile(demo(), directory)

    again = save_profile(demo(), directory)

    assert again.versioned
    assert again.revision is None
    assert 'nothing to commit' in str(again)


def test_an_edit_is_committed_as_an_update(tmp_path: Path) -> None:
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    save_profile(demo(), directory)

    saved = save_profile(demo(description='now with a description'), directory)

    assert saved.revision is not None
    logged = subprocess.run(
        ['git', 'log', '--oneline'], cwd=tmp_path / 'corpus-repo', capture_output=True, text=True, check=True
    )
    assert 'profile(demo): updated' in logged.stdout


def test_an_unversioned_profile_still_saves_but_says_so(tmp_path: Path) -> None:
    """A fresh clone writes profiles into a directory git was told to ignore. That must still work."""
    directory = tmp_path / 'loose'

    saved = save_profile(demo(), directory)

    assert saved.path.is_file()
    assert not saved.versioned
    assert saved.unversioned_because is not None


def test_a_caller_that_requires_a_commit_is_refused_before_anything_is_written(tmp_path: Path) -> None:
    """What a save button needs: offering an edit that cannot be recorded is worse than not offering it."""
    directory = tmp_path / 'loose'

    with pytest.raises(ProfileError, match='refusing to save'):
        save_profile(demo(), directory, require_commit=True)

    assert not (directory / 'demo.yaml').exists()


def test_an_ignored_profile_is_refused_even_inside_a_repository(tmp_path: Path) -> None:
    """The dangerous middle case: it looks versioned and is not."""
    root = tmp_path / 'corpus-repo'
    directory = versioned_profiles(root)
    (root / '.gitignore').write_text('output/\nprofiles/*.yaml\n', encoding='utf-8')

    with pytest.raises(ProfileError, match=r'ignored by \.gitignore'):
        save_profile(demo(), directory, require_commit=True)

    assert not (directory / 'demo.yaml').exists()


def test_an_edited_profile_keeps_its_comments(tmp_path: Path) -> None:
    """The comments are the measurements that justify the rules. The model does not hold them."""
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    text = (
        'name: measured\n'
        '# 45 of the 46 pages publish a usable twin, measured 2026-09-04\n'
        'start_urls:\n'
        '  - https://s/one  # the one that mattered\n'
        'snapshot: true\n'
    )

    saved = save_profile_text('measured', text, directory)

    assert saved.versioned
    assert saved.path.read_text(encoding='utf-8') == text
    assert saved.path.read_text(encoding='utf-8').count('#') == 2


def test_a_broken_edit_never_reaches_the_file(tmp_path: Path) -> None:
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    save_profile_text('demo', 'name: demo\nstart_urls:\n  - https://s/one\n', directory)
    before = (directory / 'demo.yaml').read_text(encoding='utf-8')

    with pytest.raises(ProfileError, match='not a valid profile'):
        save_profile_text('demo', 'name: demo\nmax_depth: not a number\n', directory)

    assert (directory / 'demo.yaml').read_text(encoding='utf-8') == before


def test_an_edit_that_renames_the_profile_is_refused(tmp_path: Path) -> None:
    """A file whose name and declared name disagree is a profile nothing can look up."""
    directory = versioned_profiles(tmp_path / 'corpus-repo')

    with pytest.raises(ProfileError, match='would not be found'):
        save_profile_text('demo', 'name: somethingelse\nstart_urls:\n  - https://s/one\n', directory)


def test_a_failed_commit_puts_the_previous_text_back(tmp_path: Path) -> None:
    """Half a saved profile is a profile that no longer describes the corpus beside it."""
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    original = 'name: demo\nstart_urls:\n  - https://s/one\n'
    save_profile_text('demo', original, directory)

    # A pre-commit hook that refuses, which is the failure vcs was built to survive.
    hooks = tmp_path / 'hooks'
    hooks.mkdir()
    hook = hooks / 'pre-commit'
    hook.write_text('#!/bin/sh\nexit 1\n', encoding='utf-8', newline='\n')
    hook.chmod(0o755)
    git(tmp_path / 'corpus-repo', 'config', 'core.hooksPath', str(hooks))
    with pytest.raises(ProfileError, match='was not saved'):
        save_profile_text('demo', original + 'max_depth: 2\n', directory)

    assert (directory / 'demo.yaml').read_text(encoding='utf-8') == original


def test_saving_a_profile_back_unchanged_changes_nothing(tmp_path: Path) -> None:
    """On Windows a plain write_text would rewrite every line, and `* -text` records that."""
    directory = versioned_profiles(tmp_path / 'corpus-repo')
    text = 'name: demo\n# a measurement worth keeping\nstart_urls:\n  - https://s/one\n'
    save_profile_text('demo', text, directory)
    before = (directory / 'demo.yaml').read_bytes()

    again = save_profile_text('demo', text, directory)

    assert (directory / 'demo.yaml').read_bytes() == before
    assert again.revision is None


def test_deleting_a_target_takes_its_corpus_with_it(tmp_path: Path) -> None:
    """A target is the profile and everything it put on disk, removed in one commit."""
    root = tmp_path / 'corpus-repo'
    directory = versioned_profiles(root)
    save_profile(demo(), directory)

    snapshot = root / 'data' / 'demo'
    snapshot.mkdir(parents=True)
    (snapshot / 'manifest.json').write_text('{}', encoding='utf-8')
    export = root / 'data' / 'demo.jsonl'
    export.write_text('{}\n', encoding='utf-8')

    deleted = delete_profile('demo', directory, also=[snapshot, export])

    assert deleted.versioned
    assert deleted.revision is not None
    assert not snapshot.exists()
    assert not export.exists()
    assert not (directory / 'demo.yaml').exists()
    logged = subprocess.run(
        ['git', 'log', '--oneline'], cwd=root, capture_output=True, text=True, check=True
    )
    assert 'profile(demo): removed' in logged.stdout


def test_deleting_the_profile_alone_leaves_the_corpus(tmp_path: Path) -> None:
    root = tmp_path / 'corpus-repo'
    directory = versioned_profiles(root)
    save_profile(demo(), directory)
    snapshot = root / 'data' / 'demo'
    snapshot.mkdir(parents=True)

    delete_profile('demo', directory)

    assert snapshot.is_dir()
    assert not (directory / 'demo.yaml').exists()


def test_deleting_refuses_a_path_outside_the_repository(tmp_path: Path) -> None:
    """The name comes from a panel and the paths are derived from it. That is the whole risk."""
    root = tmp_path / 'corpus-repo'
    directory = versioned_profiles(root)
    save_profile(demo(), directory)
    elsewhere = tmp_path / 'not-the-corpus'
    elsewhere.mkdir()

    with pytest.raises(ProfileError, match='outside'):
        delete_profile('demo', directory, also=[elsewhere])

    assert elsewhere.is_dir()
    assert (directory / 'demo.yaml').is_file()


def test_deleting_an_unknown_profile_says_so(tmp_path: Path) -> None:
    directory = versioned_profiles(tmp_path / 'corpus-repo')

    with pytest.raises(ProfileError, match='no profile named'):
        delete_profile('nobody', directory)


def test_an_ignored_corpus_is_still_removed_from_disk(tmp_path: Path) -> None:
    """`output/` is gitignored in these repositories, and it is still what a target left behind."""
    root = tmp_path / 'corpus-repo'
    directory = versioned_profiles(root)
    save_profile(demo(), directory)
    export = root / 'output' / 'demo.jsonl'
    export.parent.mkdir(parents=True)
    export.write_text('{}\n', encoding='utf-8')

    deleted = delete_profile('demo', directory, also=[export])

    assert deleted.versioned
    assert not export.exists()
    assert not (directory / 'demo.yaml').exists()


def test_deleting_an_unversioned_profile_says_so_rather_than_refusing(tmp_path: Path) -> None:
    directory = tmp_path / 'loose' / 'profiles'
    save_profile(demo(), directory)

    deleted = delete_profile('demo', directory)

    assert not deleted.versioned
    assert 'not inside a git repository' in str(deleted)
    assert not (directory / 'demo.yaml').exists()


def test_a_caller_that_requires_a_commit_will_not_delete_what_it_cannot_record(tmp_path: Path) -> None:
    directory = tmp_path / 'loose' / 'profiles'
    save_profile(demo(), directory)

    with pytest.raises(ProfileError, match='refusing to delete'):
        delete_profile('demo', directory, require_commit=True)

    assert (directory / 'demo.yaml').is_file()
