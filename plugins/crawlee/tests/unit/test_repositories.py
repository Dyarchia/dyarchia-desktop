"""Finding the corpus repositories a machine holds, and keeping each one's answer its own."""

from __future__ import annotations

from pathlib import Path

import pytest

from dyarchia_crawlee import registry, repositories
from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.errors import ConfigurationError, ProfileError
from dyarchia_crawlee.watch import rounds

SITEMAP = 'name: {name}\ngroup: {group}\nsitemap_urls:\n  - https://{name}.example/s.xml\nsnapshot: true\n'


def corpus_repository(root: Path, *profiles: str, group: str = 'a-group') -> Path:
    (root / 'profiles').mkdir(parents=True, exist_ok=True)
    (root / 'data').mkdir(parents=True, exist_ok=True)
    for name in profiles:
        (root / 'profiles' / f'{name}.yaml').write_text(
            SITEMAP.format(name=name, group=group), encoding='utf-8'
        )
    return root


def settings_over(parent: Path, default: Path) -> Settings:
    return Settings(
        repositories_dir=parent,
        data_dir=default / 'data',
        profiles_dir=default / 'profiles',
        output_dir=default / 'output',
    )


def test_an_unset_directory_leaves_one_root(tmp_path: Path) -> None:
    """The behaviour of every machine that never asked for a second repository."""
    only = corpus_repository(tmp_path / 'only')
    settings = Settings(data_dir=only / 'data', profiles_dir=only / 'profiles', repositories_dir=None)

    assert repositories.roots(settings) == [only.resolve()]


def test_every_subdirectory_holding_profiles_is_a_repository(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')
    second = corpus_repository(parent / 'beta-data', 'beta')
    (parent / 'notes').mkdir()

    found = repositories.roots(settings_over(parent, first))

    assert found == [first.resolve(), second.resolve()]


def test_the_default_repository_is_listed_once(tmp_path: Path) -> None:
    """The configured root usually sits inside the folder, and is one entry rather than two."""
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')

    assert repositories.roots(settings_over(parent, first)) == [first.resolve()]


def test_a_named_directory_that_is_not_there_is_created(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    default = corpus_repository(tmp_path / 'alpha-data', 'alpha')

    assert repositories.roots(settings_over(parent, default)) == [default.resolve()]
    assert parent.is_dir()
    assert list(parent.iterdir()) == []


def test_a_named_directory_that_is_a_file_is_refused(tmp_path: Path) -> None:
    blocker = tmp_path / 'crawlee-data'
    blocker.write_text('not a directory', encoding='utf-8')
    default = corpus_repository(tmp_path / 'alpha-data', 'alpha')

    with pytest.raises(ConfigurationError, match='not a directory'):
        repositories.roots(settings_over(blocker, default))


def test_one_repository_settings_does_not_expand_back_into_all_of_them(tmp_path: Path) -> None:
    """Settings for one repository that carried the folder would quietly mean every repository."""
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')
    corpus_repository(parent / 'beta-data', 'beta')

    one = Settings.for_repository(first)

    assert one.repositories_dir is None
    assert repositories.roots(one) == [first.resolve()]


def test_a_profile_is_found_with_the_repository_that_defines_it(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')
    second = corpus_repository(parent / 'beta-data', 'beta')
    settings = settings_over(parent, first)

    _, owner = registry.locate('beta', settings)

    assert owner.resolve(owner.data_dir) == second / 'data'


def test_one_name_in_two_repositories_is_refused(tmp_path: Path) -> None:
    """Either answer would write somebody's corpus into somebody else's."""
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'shared')
    corpus_repository(parent / 'beta-data', 'shared')

    with pytest.raises(ProfileError, match='two repositories define a profile'):
        registry.everywhere(settings_over(parent, first))


def test_a_sweep_is_one_round_per_repository(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha', 'alpha-two')
    corpus_repository(parent / 'beta-data', 'beta', group='other-group')
    settings = settings_over(parent, first)

    covered = [(one.resolve(one.data_dir).parent.name, names) for one, names in rounds(settings=settings)]

    assert covered == [('alpha-data', ['alpha', 'alpha-two']), ('beta-data', ['beta'])]


def test_naming_targets_across_repositories_groups_them(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha', 'alpha-two')
    corpus_repository(parent / 'beta-data', 'beta', group='other-group')
    settings = settings_over(parent, first)

    covered = [
        (one.resolve(one.data_dir).parent.name, names)
        for one, names in rounds(['beta', 'alpha'], settings=settings)
    ]

    assert covered == [('alpha-data', ['alpha']), ('beta-data', ['beta'])]


def test_a_group_narrows_the_sweep_to_the_repository_that_holds_it(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')
    corpus_repository(parent / 'beta-data', 'beta', group='other-group')
    settings = settings_over(parent, first)

    covered = [
        one.resolve(one.data_dir).parent.name for one, _ in rounds(group='other-group', settings=settings)
    ]

    assert covered == ['beta-data']


def test_an_unknown_target_is_refused_before_anything_is_crawled(tmp_path: Path) -> None:
    parent = tmp_path / 'crawlee-data'
    first = corpus_repository(parent / 'alpha-data', 'alpha')

    with pytest.raises(ProfileError, match='unknown profile'):
        rounds(['nowhere'], settings=settings_over(parent, first))
