"""The corpus can be searched, and the index follows the manifests page by page."""

from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import pytest

from dyarchia_crawlee import mcp, search
from dyarchia_crawlee.config import Settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError
from dyarchia_crawlee.models import PageStatus
from dyarchia_crawlee.versioning.manifest import PageRecord, RunManifest, save_manifest


def repository(root: Path, name: str, pages: dict[str, str], titles: dict[str, str] | None = None) -> Path:
    """A corpus repository holding one snapshotted target, the way a round leaves it."""
    directory = root / 'data' / name
    records: dict[str, PageRecord] = {}
    for url, body in pages.items():
        relative = f'pages/{url.removeprefix("https://")}.md'
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        records[url] = PageRecord(
            url=url,
            status=PageStatus.OK,
            path=relative,
            title=(titles or {}).get(url, url),
            sha256=hashlib.sha256(body.encode('utf-8')).hexdigest(),
        )
    save_manifest(RunManifest(name=name, pages=records), directory)
    (root / 'profiles').mkdir(parents=True, exist_ok=True)
    (root / 'output').mkdir(parents=True, exist_ok=True)
    return root


def settings_for(tmp_path: Path, root: Path) -> Settings:
    return Settings(
        data_dir=root / 'data',
        profiles_dir=root / 'profiles',
        output_dir=root / 'output',
        index_dir=tmp_path / 'index',
        repositories_dir=None,
    )


PAGE = """# Record types

> One object, several shapes.

## Assigning a record type

A Record Type decides which picklist values a user sees. Assign one per profile.

## Limits

Two hundred record types per object.
"""


def test_a_word_in_a_section_finds_that_section(tmp_path: Path) -> None:
    root = repository(
        tmp_path / 'corpus',
        'sf-docs',
        {'https://s/record-types': PAGE},
        {'https://s/record-types': 'Record types'},
    )
    settings = settings_for(tmp_path, root)

    hits = search.search('picklist', settings=settings)

    assert len(hits) == 1
    hit = hits[0]
    assert hit.url == 'https://s/record-types'
    assert hit.title == 'Record types'
    assert hit.heading == 'Assigning a record type'
    assert hit.target == 'sf-docs'
    assert hit.repository == 'corpus'
    assert '[picklist]' in hit.snippet


def test_chunks_break_at_headings_and_keep_the_nearest_one() -> None:
    pieces = search.chunk(PAGE)

    assert [heading for heading, _ in pieces] == ['Record types', 'Assigning a record type', 'Limits']
    assert pieces[2][1] == 'Two hundred record types per object.'


def test_a_long_section_splits_at_a_paragraph_and_keeps_its_heading() -> None:
    body = '\n\n'.join('x' * 700 for _ in range(4))
    pieces = search.chunk(f'# Long\n\n{body}\n')

    assert len(pieces) > 1
    assert {heading for heading, _ in pieces} == {'Long'}


def test_the_index_follows_the_manifest_page_by_page(tmp_path: Path) -> None:
    root = repository(tmp_path / 'corpus', 'docs', {'https://s/one': 'alpha\n', 'https://s/two': 'beta\n'})
    settings = settings_for(tmp_path, root)

    first = search.refresh(root, settings)
    assert (first.added, first.updated, first.removed, first.pages) == (2, 0, 0, 2)

    again = search.refresh(root, settings)
    assert not again.changed

    repository(tmp_path / 'corpus', 'docs', {'https://s/one': 'alpha gamma\n'})
    third = search.refresh(root, settings)
    assert (third.added, third.updated, third.removed, third.pages) == (0, 1, 1, 1)
    assert [hit.url for hit in search.search('gamma', settings=settings)] == ['https://s/one']
    assert search.search('beta', settings=settings) == []

    log = search.log_path(settings).read_text(encoding='utf-8').splitlines()
    assert len(log) == 3
    assert 'trigger=asked' in log[0] and 'added=2' in log[0]
    assert 'added=0 updated=1 removed=1 pages=1' in log[2]


def test_a_search_after_a_round_sees_the_round(tmp_path: Path) -> None:
    root = repository(tmp_path / 'corpus', 'docs', {'https://s/one': 'alpha\n'})
    settings = settings_for(tmp_path, root)
    assert search.search('alpha', settings=settings)

    repository(tmp_path / 'corpus', 'docs', {'https://s/one': 'alpha\n', 'https://s/two': 'delta\n'})
    path = search.index_path(root, settings)
    manifest = root / 'data' / 'docs' / 'manifest.json'
    manifest.touch()
    assert manifest.stat().st_mtime >= path.stat().st_mtime

    assert search.stale(root, settings)
    assert [hit.url for hit in search.search('delta', settings=settings)] == ['https://s/two']


def test_a_target_filter_narrows_the_answer(tmp_path: Path) -> None:
    root = tmp_path / 'corpus'
    repository(root, 'one', {'https://a/x': 'shared word\n'})
    repository(root, 'two', {'https://b/y': 'shared word\n'})
    settings = settings_for(tmp_path, root)

    assert {hit.target for hit in search.search('shared', settings=settings)} == {'one', 'two'}
    assert [hit.target for hit in search.search('shared', target='two', settings=settings)] == ['two']


def test_words_are_required_together_and_then_widened(tmp_path: Path) -> None:
    root = repository(
        tmp_path / 'corpus', 'docs', {'https://s/one': 'apple pie\n', 'https://s/two': 'apple tart\n'}
    )
    settings = settings_for(tmp_path, root)

    assert [hit.url for hit in search.search('apple pie', settings=settings)] == ['https://s/one']
    widened = search.search('pie cake', settings=settings)
    assert [hit.url for hit in widened] == ['https://s/one']


def test_punctuation_never_reaches_the_parser() -> None:
    assert search.match_expression('foo(bar) AND "baz"') == '"foo" "bar" "AND" "baz"'
    with pytest.raises(DyarchiaCrawleeError):
        search.match_expression('!!!')


def test_an_unknown_repository_is_refused_by_name(tmp_path: Path) -> None:
    root = repository(tmp_path / 'corpus', 'docs', {'https://s/one': 'alpha\n'})
    settings = settings_for(tmp_path, root)

    with pytest.raises(DyarchiaCrawleeError, match='no corpus repository named'):
        search.search('alpha', repository='elsewhere', settings=settings)


def test_the_mcp_server_lists_and_calls_its_one_tool(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = repository(
        tmp_path / 'corpus', 'docs', {'https://s/one': '# One\n\nalpha beta\n'}, {'https://s/one': 'One'}
    )
    settings = settings_for(tmp_path, root)
    monkeypatch.setattr('dyarchia_crawlee.search.get_settings', lambda: settings)

    requests = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18'}},
        {'jsonrpc': '2.0', 'method': 'notifications/initialized'},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
        {
            'jsonrpc': '2.0',
            'id': 3,
            'method': 'tools/call',
            'params': {'name': 'search_corpus', 'arguments': {'query': 'beta'}},
        },
        {'jsonrpc': '2.0', 'id': 4, 'method': 'resources/list'},
    ]
    stdin = io.StringIO('\n'.join(json.dumps(request) for request in requests) + '\n')
    stdout = io.StringIO()

    mcp.serve(stdin, stdout)

    answers = [json.loads(line) for line in stdout.getvalue().splitlines()]
    assert [answer['id'] for answer in answers] == [1, 2, 3, 4]
    assert answers[0]['result']['serverInfo']['name'] == 'dyarchia-corpus'
    assert answers[1]['result']['tools'][0]['name'] == 'search_corpus'
    assert 'https://s/one' in answers[2]['result']['content'][0]['text']
    assert answers[2]['result']['structuredContent']['hits'][0]['title'] == 'One'
    assert answers[3]['error']['code'] == -32601
