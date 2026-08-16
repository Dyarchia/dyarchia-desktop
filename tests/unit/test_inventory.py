"""What a snapshot actually brought in, read back off its manifest."""

from __future__ import annotations

from pathlib import Path

from crawlee_lab.config import Settings
from crawlee_lab.inventory import collect, human_bytes, section_of, tracked
from crawlee_lab.models import PageStatus
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, save_manifest


def snapshot(settings: Settings, name: str, pages: dict[str, str], failed: list[str] | None = None) -> Path:
    """Write a manifest and the page files it points at, the way a snapshotted run leaves them."""
    directory = settings.resolve(settings.data_dir) / name
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
