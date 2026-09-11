"""What a snapshot actually brought in, read back off its manifest."""

from __future__ import annotations

from pathlib import Path

from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.inventory import collect, directory_for, human_bytes, section_of, tracked
from dyarchia_crawlee.models import PageStatus
from dyarchia_crawlee.versioning.manifest import PageRecord, RunManifest, save_manifest


def snapshot(
    settings: Settings,
    name: str,
    pages: dict[str, str],
    failed: list[str] | None = None,
    group: str | None = None,
) -> Path:
    """Write a manifest and the page files it points at, the way a snapshotted run leaves them."""
    directory = settings.data_root(group) / name
    records: dict[str, PageRecord] = {}
    for url, body in pages.items():
        relative = f'pages/{url.removeprefix("https://")}.md'
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        records[url] = PageRecord(url=url, status=PageStatus.OK, path=relative)
    for url in failed or []:
        records[url] = PageRecord(url=url, status=PageStatus.FAILED, error='timeout')
    save_manifest(RunManifest(name=name, pages=records), directory)
    return directory


def test_a_page_groups_under_the_path_that_holds_it() -> None:
    assert section_of('https://code.claude.com/docs/en/accessibility') == 'code.claude.com/docs/en'


def test_a_trailing_slash_does_not_invent_a_section() -> None:
    assert section_of('https://developers.openai.com/ads/api-overview/') == 'developers.openai.com/ads'


def test_a_page_at_the_root_groups_under_its_host() -> None:
    assert section_of('https://claude.com/docs') == 'claude.com'


def test_depth_rolls_the_grouping_up() -> None:
    url = 'https://platform.claude.com/docs/en/about-claude/models/choosing-a-model'
    assert section_of(url, depth=2) == 'platform.claude.com/docs/en'


def test_the_inventory_reads_its_pages_off_the_manifest(settings: Settings) -> None:
    snapshot(
        settings,
        'demo',
        {
            'https://example.com/docs/en/one': 'x' * 100,
            'https://example.com/docs/en/two': 'x' * 200,
            'https://example.com/blog/post': 'x' * 50,
        },
        failed=['https://example.com/docs/en/gone'],
    )

    inventory = collect('demo', settings)

    assert inventory is not None
    assert inventory.pages == 3
    assert inventory.bytes == 350
    assert inventory.failed == 1


def test_the_heaviest_section_is_reported_first(settings: Settings) -> None:
    snapshot(
        settings,
        'demo',
        {
            'https://example.com/docs/en/one': 'x' * 10,
            'https://example.com/docs/en/two': 'x' * 10,
            'https://example.com/blog/post': 'x' * 900,
        },
    )

    inventory = collect('demo', settings)

    assert inventory is not None
    sections = inventory.sections()
    assert [section.prefix for section in sections] == ['example.com/docs/en', 'example.com/blog']
    assert sections[0].pages == 2
    assert sections[1].bytes == 900


def test_a_target_that_was_never_snapshotted_has_no_inventory(settings: Settings) -> None:
    assert collect('never-run', settings) is None


def test_tracked_finds_every_snapshotted_target(settings: Settings) -> None:
    snapshot(settings, 'beta', {'https://example.com/a': 'x'})
    snapshot(settings, 'alpha', {'https://example.com/b': 'x'})
    (settings.resolve(settings.data_dir) / 'not-a-target').mkdir(parents=True, exist_ok=True)

    assert tracked(settings) == ['alpha', 'beta']


def test_sizes_read_in_units_a_human_can_compare() -> None:
    assert human_bytes(512) == '512 B'
    assert human_bytes(2048) == '2.0 KB'
    assert human_bytes(5 * 1024 * 1024) == '5.0 MB'


def test_a_grouped_target_is_still_found_by_its_own_name(settings: Settings) -> None:
    directory = snapshot(settings, 'claude-docs', {'https://site.example/a': 'Alpha'}, group='docs-labs')

    assert tracked(settings) == ['claude-docs']
    assert directory_for('claude-docs', settings) == directory
    found = collect('claude-docs', settings)
    assert found is not None
    assert len(found.entries) == 1


def test_grouped_and_ungrouped_targets_report_side_by_side(settings: Settings) -> None:
    """What a corpus part way through a move looks like, which must not hide half of itself."""
    snapshot(settings, 'moved', {'https://site.example/a': 'Alpha'}, group='docs-labs')
    snapshot(settings, 'stayed', {'https://site.example/b': 'Beta'})

    assert tracked(settings) == ['moved', 'stayed']


def test_a_group_folder_is_not_itself_a_target(settings: Settings) -> None:
    snapshot(settings, 'claude-docs', {'https://site.example/a': 'Alpha'}, group='docs-labs')

    assert 'docs-labs' not in tracked(settings)


def test_a_target_that_was_never_snapshotted_points_at_where_it_belongs(settings: Settings) -> None:
    """The answer an error message needs: not where it looked, but where the file should be."""
    assert directory_for('absent', settings) == settings.resolve(settings.data_dir) / 'absent'


def profile(settings: Settings, name: str, group: str | None = None) -> None:
    """A profile file for `name`, which is what tells a reader the group it belongs to."""
    directory = settings.resolve(settings.profiles_dir)
    directory.mkdir(parents=True, exist_ok=True)
    body = """
start_urls:
  - https://site.example/
snapshot: true
"""
    if group:
        body += f'group: {group}'
    (directory / f'{name}.yaml').write_text(body, encoding='utf-8')


def test_a_profile_that_joins_a_group_still_reads_the_files_it_left_behind(settings: Settings) -> None:
    """Changing the profile does not move 94 MB of snapshots, and reading must survive the gap."""
    directory = snapshot(settings, 'claude-docs', {'https://site.example/a': 'Alpha'})
    profile(settings, 'claude-docs', group='docs-labs')

    assert directory_for('claude-docs', settings) == directory
    assert collect('claude-docs', settings) is not None


def test_once_the_files_move_the_group_is_where_they_are_read_from(settings: Settings) -> None:
    moved = snapshot(settings, 'claude-docs', {'https://site.example/a': 'Alpha'}, group='docs-labs')
    profile(settings, 'claude-docs', group='docs-labs')

    assert directory_for('claude-docs', settings) == moved
