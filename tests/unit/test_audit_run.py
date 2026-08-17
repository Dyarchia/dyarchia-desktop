"""Choosing what to read, keeping the answers, and reporting them."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from crawlee_lab.audit import run, sampling, store
from crawlee_lab.audit.panel import (
    Confidence,
    Form,
    Opinion,
    PageRuling,
    Relevance,
    SectionOpinion,
    SectionRuling,
    SectionVerdict,
)
from crawlee_lab.audit.signals import Shape
from crawlee_lab.config import Settings
from crawlee_lab.errors import CrawleeLabError
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, save_manifest

PROSE = """# {title}

This page explains {title} at enough length that the local signals treat it as a page carrying
content rather than as a stub, which needs a few dozen words of ordinary prose to establish.

```python
print('{title}')
```

There is a closing paragraph as well, so the document ends outside its fenced example.
"""

MDX = """# {title}

<div className="landing">
  <Card title="One" href="/one" />
  <Card title="Two" href="/two" />
  <Card title="Three" href="/three" />
</div>

Some prose survives here, and there is enough of it that the page is not an empty stub: the
signals have to decide this page on its layout residue rather than on its length, which is the
case the fixture exists to cover. The component tags above were never cleaned out of the page,
so what a reader gets is markup where the document promised them documentation.
"""


def build_corpus(root: Path, name: str, pages: dict[str, str]) -> Path:
    """A snapshotted target on disk, shaped exactly as a real crawl leaves one."""
    directory = root / name
    records = {}
    for url, body in pages.items():
        relative = url.split('://')[1] + '.md'
        path = directory / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding='utf-8')
        records[url] = PageRecord(url=url, status='ok', sha256=f'hash-{relative}', path=relative)

    save_manifest(RunManifest(name=name, pages=records), directory)
    return directory


@pytest.fixture
def corpus(tmp_path: Path) -> Settings:
    settings = Settings(data_dir=tmp_path / 'data', output_dir=tmp_path, profiles_dir=tmp_path)
    build_corpus(
        settings.resolve(settings.data_dir),
        'docs',
        {
            'https://example.com/docs/guides/streaming': PROSE.format(title='streaming'),
            'https://example.com/docs/guides/batching': PROSE.format(title='batching'),
            'https://example.com/docs/guides/landing': MDX.format(title='landing'),
            'https://example.com/legal/terms': PROSE.format(title='terms'),
        },
    )
    return settings


def test_a_corpus_is_measured_without_any_key(corpus: Settings) -> None:
    plan = run.plan('docs', corpus)

    assert len(plan.pages) == 4
    assert len(plan.suspect) == 1
    assert plan.suspect[0].url.endswith('landing')
    assert {brief.prefix for brief in plan.sections} == {
        'example.com/docs/guides',
        'example.com/legal',
    }


def test_an_unsnapshotted_target_says_what_to_run(corpus: Settings) -> None:
    with pytest.raises(CrawleeLabError, match='no snapshot'):
        run.plan('never-crawled', corpus)


def test_pages_in_a_dropped_section_are_never_read(corpus: Settings) -> None:
    """The saving that pays for the whole design: a section already ruled out is not read page by
    page to find out how well it was formatted first."""
    plan = run.plan('docs', corpus)
    rulings = {
        'docs:example.com/docs/guides': SectionRuling(
            corpus='docs',
            prefix='example.com/docs/guides',
            opinions=[SectionOpinion(model='m', verdict=SectionVerdict.DROP, confidence=Confidence.HIGH)],
        ),
        'docs:example.com/legal': SectionRuling(
            corpus='docs',
            prefix='example.com/legal',
            opinions=[SectionOpinion(model='m', verdict=SectionVerdict.KEEP, confidence=Confidence.HIGH)],
        ),
    }

    chosen = run.candidates([plan], rulings)
    assert all('/docs/guides/' not in page.url for _, page in chosen)


def test_an_unruled_section_sends_every_page_to_be_read(corpus: Settings) -> None:
    plan = run.plan('docs', corpus)
    chosen = run.candidates([plan], {})
    assert len(chosen) == len(plan.pages)


def test_a_broken_page_is_never_sent_to_a_model(corpus: Settings) -> None:
    directory = corpus.resolve(corpus.data_dir) / 'docs'
    (directory / 'example.com/docs/guides/streaming.md').write_text('# Stub\n\ntoo short\n', encoding='utf-8')

    plan = run.plan('docs', corpus)
    chosen = run.candidates([plan], {})

    assert any(page.shape is Shape.BROKEN for page in plan.pages)
    assert all(page.shape is not Shape.BROKEN for _, page in chosen)


def test_requests_carry_identities_that_survive_a_second_round(corpus: Settings) -> None:
    plan = run.plan('docs', corpus)
    index = run.key_pages(run.candidates([plan], {}))

    first = run.page_requests(list(index.items()), 'claude-haiku-4-5')
    subset = {key: index[key] for key in list(index)[:2]}
    second = run.page_requests(list(subset.items()), 'claude-sonnet-5')

    for key in subset:
        assert any(f'<page id="{key}"' in request.prompt for request in first)
        assert any(f'<page id="{key}"' in request.prompt for request in second)


def test_only_changed_skips_what_was_already_judged(corpus: Settings) -> None:
    directory = corpus.resolve(corpus.data_dir) / 'docs'
    state = store.AuditState(name='docs')
    for page in run.plan('docs', corpus).pages:
        assert page.sha256 is not None
        state.rulings[page.sha256] = PageRuling(url=page.url, sha256=page.sha256)
    store.save_state(state, directory)

    assert run.plan('docs', corpus, only_changed=True).pages == []


def test_an_excerpt_keeps_the_ends_of_a_long_page() -> None:
    body = 'START' + ('filler ' * 5000) + 'END'
    trimmed = sampling.excerpt(body)

    assert trimmed.startswith('START')
    assert trimmed.endswith('END')
    assert len(trimmed) < len(body) / 4


def test_a_short_page_is_sent_whole() -> None:
    body = '# Short\n\nNothing to trim here.\n'
    assert sampling.excerpt(body) == body.strip()


def test_the_control_sample_is_the_same_pages_every_run(corpus: Settings) -> None:
    """Two audits of an unchanged corpus have to choose the same control pages, or the second one
    pays again for an answer the first already bought."""
    first = run.plan('docs', corpus).control
    second = run.plan('docs', corpus).control
    assert [page.url for page in first] == [page.url for page in second]


def opinion(form: Form = Form.OK, relevance: Relevance = Relevance.KEEP) -> Opinion:
    return Opinion(
        model='claude-haiku-4-5',
        form=form,
        relevance=relevance,
        confidence=Confidence.HIGH,
        reason='because',
    )


def test_the_report_separates_what_to_fix_from_what_to_exclude() -> None:
    state = store.AuditState(name='docs', pages_seen=3)
    state.rulings['a'] = PageRuling(url='https://example.com/a', opinions=[opinion(form=Form.MDX_RESIDUE)])
    state.rulings['b'] = PageRuling(url='https://example.com/b', opinions=[opinion(relevance=Relevance.DROP)])
    state.rulings['c'] = PageRuling(
        url='https://example.com/c',
        opinions=[opinion(form=Form.NAV_DUMP), opinion(form=Form.OK)],
        disputed=True,
    )
    state.broken['https://example.com/d'] = ['a code fence is left open']

    sorted_buckets = store.buckets(state)
    assert [url for url, _ in sorted_buckets['malformed']] == [
        'https://example.com/d',
        'https://example.com/a',
    ]
    assert [url for url, _ in sorted_buckets['irrelevant']] == ['https://example.com/b']
    assert [url for url, _ in sorted_buckets['disputed']] == ['https://example.com/c']


def test_a_dropped_section_is_reported_once_rather_than_per_page() -> None:
    state = store.AuditState(name='docs')
    state.sections['docs:example.com/legal'] = SectionRuling(
        corpus='docs',
        prefix='example.com/legal',
        pages=30,
        opinions=[SectionOpinion(model='m', verdict=SectionVerdict.DROP, confidence=Confidence.HIGH)],
    )

    entries = store.buckets(state)['irrelevant']
    assert entries == [('example.com/legal/*', 'whole section, 30 pages: ')]


def test_verdicts_survive_a_round_trip_through_disk(tmp_path: Path) -> None:
    state = store.AuditState(name='docs', usd_spent=0.42)
    state.rulings['hash'] = PageRuling(url='https://example.com/a', sha256='hash', opinions=[opinion()])
    store.save_state(state, tmp_path)

    read_back = store.load_state(tmp_path, 'docs')
    assert read_back.usd_spent == 0.42
    assert read_back.judged('hash') is not None
    assert read_back.judged('missing') is None


def test_a_corrupt_state_file_starts_over_rather_than_crashing(tmp_path: Path) -> None:
    (tmp_path / store.AUDIT_FILENAME).write_text('{not json', encoding='utf-8')
    assert store.load_state(tmp_path, 'docs').rulings == {}


def test_the_written_report_names_every_bucket(tmp_path: Path) -> None:
    state = store.AuditState(name='docs', pages_seen=1)
    state.broken['https://example.com/d'] = ['a code fence is left open']
    path = store.save_report(state, tmp_path)
    written = path.read_text(encoding='utf-8')

    for bucket in store.BUCKETS:
        assert f'## {bucket.heading}' in written
    assert 'https://example.com/d' in written


def test_the_state_file_is_stable_across_saves(tmp_path: Path) -> None:
    """A file that reorders itself on every save would make every audit look like a change."""
    state = store.AuditState(name='docs')
    state.rulings['z'] = PageRuling(url='https://example.com/z')
    state.rulings['a'] = PageRuling(url='https://example.com/a')
    store.save_state(state, tmp_path)

    payload = json.loads((tmp_path / store.AUDIT_FILENAME).read_text(encoding='utf-8'))
    assert list(payload['rulings']) == ['a', 'z']


def test_a_verdict_about_content_that_is_gone_is_dropped(corpus: Settings) -> None:
    """A page flagged, fixed and re-crawled gets a new hash. Keeping the old verdict would leave
    the report naming a URL whose defect was already repaired."""
    plan = run.plan('docs', corpus)
    plan.state.rulings['hash-of-a-page-that-was-fixed'] = PageRuling(
        url='https://example.com/docs/guides/landing',
        sha256='hash-of-a-page-that-was-fixed',
        opinions=[opinion(form=Form.MDX_RESIDUE)],
    )

    state = run.finish([plan], {}, {}, {}, {}, {})[0]

    assert 'hash-of-a-page-that-was-fixed' not in state.rulings
    assert store.buckets(state)['malformed'] == []


def test_a_verdict_about_content_that_is_unchanged_is_kept(corpus: Settings) -> None:
    plan = run.plan('docs', corpus)
    surviving = next(page.sha256 for page in plan.pages if page.sha256)
    plan.state.rulings[surviving] = PageRuling(url='https://example.com/kept', sha256=surviving)

    state = run.finish([plan], {}, {}, {}, {}, {})[0]
    assert surviving in state.rulings


def test_pruning_survives_an_only_changed_run(corpus: Settings) -> None:
    """The filtered run sees almost no pages, but it must not read that as the corpus having
    emptied out and throw away every verdict it holds."""
    full = run.plan('docs', corpus)
    kept = next(page.sha256 for page in full.pages if page.sha256)
    full.state.rulings[kept] = PageRuling(url='https://example.com/kept', sha256=kept)
    store.save_state(full.state, corpus.resolve(corpus.data_dir) / 'docs')

    filtered = run.plan('docs', corpus, only_changed=True)
    state = run.finish([filtered], {}, {}, {}, {}, {})[0]

    assert kept in state.rulings
    assert state.pages_seen == len(full.pages)
