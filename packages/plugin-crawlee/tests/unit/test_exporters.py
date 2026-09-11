"""Output serialisation."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from dyarchia_crawlee.models import OutputFormat, RunSpec, ScrapedItem
from dyarchia_crawlee.storage.exporters import export_items, slugify_url


def items() -> list[ScrapedItem]:
    return [
        ScrapedItem(
            url='https://site.example/a',
            title='Alpha',
            content='Alpha body',
            fields={'price': '10', 'tags': ['x', 'y']},
        ),
        ScrapedItem(url='https://site.example/b', title='Beta', content='Beta body', fields={'price': '20'}),
    ]


def spec_for(*formats: OutputFormat) -> RunSpec:
    return RunSpec(name='demo', start_urls=['https://site.example/'], formats=list(formats))


def test_json_is_a_list_of_records(tmp_path: Path) -> None:
    written = export_items(items(), spec_for(OutputFormat.JSON), tmp_path)
    payload = json.loads(written[0].read_text(encoding='utf-8'))

    assert [record['title'] for record in payload] == ['Alpha', 'Beta']


def test_jsonl_is_one_record_per_line(tmp_path: Path) -> None:
    written = export_items(items(), spec_for(OutputFormat.JSONL), tmp_path)
    lines = written[0].read_text(encoding='utf-8').strip().splitlines()

    assert len(lines) == 2
    assert json.loads(lines[1])['title'] == 'Beta'


def test_csv_flattens_fields_into_columns(tmp_path: Path) -> None:
    written = export_items(items(), spec_for(OutputFormat.CSV), tmp_path)
    rows = list(csv.DictReader(written[0].read_text(encoding='utf-8').splitlines()))

    assert rows[0]['price'] == '10'
    assert rows[0]['tags'] == 'x | y'
    assert rows[1]['tags'] == ''


def test_markdown_writes_one_file_per_page(tmp_path: Path) -> None:
    written = export_items(items(), spec_for(OutputFormat.MARKDOWN), tmp_path)

    assert len(written) == 2
    assert written[0].read_text(encoding='utf-8').startswith('# Alpha')


def test_every_requested_format_is_produced(tmp_path: Path) -> None:
    written = export_items(items(), spec_for(OutputFormat.JSON, OutputFormat.CSV), tmp_path)
    assert {path.suffix for path in written} == {'.json', '.csv'}


def test_empty_runs_still_produce_a_file(tmp_path: Path) -> None:
    written = export_items([], spec_for(OutputFormat.JSON), tmp_path)
    assert json.loads(written[0].read_text(encoding='utf-8')) == []


def test_slugs_stay_filesystem_safe() -> None:
    assert slugify_url('https://site.example/a b/c?d=1') == 'site.example-a-b-c-d-1'
    assert slugify_url('https://site.example/') == 'site.example'


def test_slugs_keep_the_query_so_pages_do_not_collide() -> None:
    assert slugify_url('https://site.example/p?page=1') != slugify_url('https://site.example/p?page=2')
