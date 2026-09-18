"""Full-text search over what the corpus repositories hold.

A snapshotted target is a manifest and a folder of markdown pages. This module turns those pages
into an SQLite FTS5 index, one database per corpus repository, and answers a query with the
chunks that match it ranked by BM25. Nothing here needs a model, a service or a package outside
the standard library: the sqlite3 module Python ships with carries FTS5 on every platform this
toolkit runs on.

The index is derived from the snapshots and never versioned with them. It lives under
`index_dir`, one file named after the repository, and it is refreshed page by page from the
manifest's content hashes: a page whose hash the index already holds is skipped, one whose hash
moved is re-chunked, and one the manifest no longer lists is dropped. A round that changed twenty
pages therefore costs twenty pages to bring the index up to date, which is what makes keeping
it current cheap enough to do on every search.

A page is split into chunks at its headings, and a section longer than `CHUNK_CHARS` is split
again at a paragraph boundary, so a hit points at the part of a page that carries the words
rather than at the page as a whole. The rows a page produced are contiguous, and the page table
remembers the range, so dropping a page is a delete by rowid and not a scan of the whole index.

Every refresh writes one line to `search.log` beside the index files: when, which process,
which repository, what triggered it and what it cost. An index that changed when nobody asked
is explained there.
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from dyarchia_crawlee import inventory, repositories
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError
from dyarchia_crawlee.versioning.manifest import load_manifest

CHUNK_CHARS = 1600
SNIPPET_TOKENS = 28
SCHEMA_VERSION = 3
BUSY_SECONDS = 60.0
LOG_NAME = 'search.log'
HEADING = re.compile(r'^#{1,6}\s+(.*\S)\s*$')
WORD = re.compile(r'[\w][\w\-./:]*', re.UNICODE)
NEAR_TOKENS = 12

"""
The words a technical corpus holds on every page, so requiring one narrows nothing and ranking by
one is ranking by noise. Deliberately short and English: the corpus is English documentation, and
a word that carries meaning somewhere is not on this list. `how`, `what` and `why` are not here —
in documentation they are titles.
"""
STOPWORDS = frozenset(
    {
        'a', 'an', 'the',
        'and', 'or', 'but', 'if', 'then', 'else',
        'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'over', 'under',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
        'this', 'that', 'these', 'those', 'it', 'its',
        'as', 'so', 'than', 'too', 'very', 'can', 'will', 'just',
        'i', 'you', 'we', 'they', 'me', 'my', 'your', 'our',
    }
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
    url TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    first_id INTEGER NOT NULL,
    last_id INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
    target UNINDEXED,
    url UNINDEXED,
    path UNINDEXED,
    line UNINDEXED,
    title,
    heading,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);
"""


@dataclass(slots=True)
class Hit:
    """One chunk that matched, with enough around it to decide whether to open the page."""

    repository: str
    target: str
    url: str
    title: str
    heading: str
    snippet: str
    score: float
    match: str = 'all'
    file: str = ''
    line: int = 1

    def to_dict(self) -> dict[str, object]:
        return {
            'repository': self.repository,
            'target': self.target,
            'url': self.url,
            'title': self.title,
            'heading': self.heading,
            'snippet': self.snippet,
            'score': round(self.score, 3),
            'match': self.match,
            'file': self.file,
            'line': self.line,
        }


@dataclass(slots=True)
class Refresh:
    """What bringing one repository's index up to date cost."""

    repository: str
    added: int = 0
    updated: int = 0
    removed: int = 0
    pages: int = 0
    seconds: float = 0.0

    @property
    def changed(self) -> bool:
        return bool(self.added or self.updated or self.removed)

    def to_dict(self) -> dict[str, object]:
        return {
            'repository': self.repository,
            'added': self.added,
            'updated': self.updated,
            'removed': self.removed,
            'pages': self.pages,
            'seconds': round(self.seconds, 2),
        }


def index_path(root: Path, settings: Settings | None = None) -> Path:
    """Where one repository's index lives: under `index_dir`, named after the repository."""
    settings = settings or get_settings()
    return settings.resolve(settings.index_dir) / f'{root.resolve().name}.sqlite'


def log_path(settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    return settings.resolve(settings.index_dir) / LOG_NAME


def _note(settings: Settings, line: str) -> None:
    path = log_path(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
    with path.open('a', encoding='utf-8') as handle:
        handle.write(f'{stamp} pid={os.getpid()} {line}\n')


def chunk(text: str) -> list[tuple[str, str, int]]:
    """Split a markdown page into (heading, body, line) pieces at its headings and at length.

    The heading attached to a piece is the nearest one above it, so a long section split at a
    paragraph keeps its heading on every piece. Blank pieces are dropped.

    The line is where the piece's first non-blank line sits in the file, counted from one, so a
    hit can be opened at the passage rather than at the top of a page that may be hundreds of
    lines long. It is recorded when the buffer takes its first line rather than when the piece is
    flushed, because the leading blank lines a flush skips would otherwise be counted in.
    """
    pieces: list[tuple[str, str, int]] = []
    heading = ''
    buffer: list[str] = []
    size = 0
    start = 0

    def flush() -> None:
        nonlocal buffer, size, start
        body = '\n'.join(buffer).strip()
        if body:
            pieces.append((heading, body, start or 1))
        buffer = []
        size = 0
        start = 0

    for number, line in enumerate(text.splitlines(), start=1):
        matched = HEADING.match(line)
        if matched:
            flush()
            heading = matched.group(1)
            continue
        if size + len(line) > CHUNK_CHARS and not line.strip():
            flush()
            continue
        if not start and line.strip():
            start = number
        buffer.append(line)
        size += len(line) + 1
    flush()
    return pieces


def _writer(path: Path) -> sqlite3.Connection:
    """A connection that may change the index: write-ahead log, explicit transactions, one schema.

    An index written by an older layout is dropped and rebuilt rather than read wrongly; the
    version lives in the file itself.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=BUSY_SECONDS, isolation_level=None)
    connection.execute('PRAGMA journal_mode = WAL')
    version = connection.execute('PRAGMA user_version').fetchone()[0]
    if version != SCHEMA_VERSION:
        connection.executescript('DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS pages;')
        connection.executescript(SCHEMA)
        connection.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
    return connection


def _reader(path: Path) -> sqlite3.Connection:
    """A connection that only reads. It never runs the schema, so it never takes a write lock."""
    return sqlite3.connect(path, timeout=BUSY_SECONDS, isolation_level=None)


def _held(connection: sqlite3.Connection) -> dict[str, tuple[str, str, int, int]]:
    return {
        url: (target, sha, first, last)
        for url, target, sha, first, last in connection.execute(
            'SELECT url, target, sha256, first_id, last_id FROM pages'
        )
    }


def refresh(
    root: Path,
    settings: Settings | None = None,
    rebuild: bool = False,
    trigger: str = 'asked',
) -> Refresh:
    """Bring one repository's index level with its manifests, page by page, in one transaction."""
    settings = settings or get_settings()
    own = Settings.for_repository(root)
    path = index_path(root, settings)
    started = time.monotonic()
    if rebuild:
        for suffix in ('', '-wal', '-shm'):
            Path(f'{path}{suffix}').unlink(missing_ok=True)

    report = Refresh(repository=root.resolve().name)
    connection = _writer(path)
    try:
        connection.execute('BEGIN IMMEDIATE')
        held = _held(connection)
        seen: set[str] = set()
        tracked = inventory.tracked(own)

        for name in tracked:
            directory = inventory.directory_for(name, own)
            manifest = load_manifest(directory)
            if manifest is None:
                continue
            for url, record in manifest.stored.items():
                if not record.path or not record.sha256:
                    continue
                seen.add(url)
                previous = held.get(url)
                if previous is not None and previous[0] == name and previous[1] == record.sha256:
                    continue
                page = directory / record.path
                if not page.is_file():
                    continue
                text = page.read_text(encoding='utf-8', errors='replace')
                title = record.title or url
                if previous is not None:
                    connection.execute(
                        'DELETE FROM chunks WHERE rowid BETWEEN ? AND ?', (previous[2], previous[3])
                    )
                relative = page.resolve().relative_to(root.resolve()).as_posix()
                first = last = 0
                for heading, body, line in chunk(text):
                    cursor = connection.execute(
                        'INSERT INTO chunks (target, url, path, line, title, heading, body) '
                        'VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (name, url, relative, line, title, heading, body),
                    )
                    last = int(cursor.lastrowid or 0)
                    first = first or last
                connection.execute(
                    'INSERT OR REPLACE INTO pages (url, target, sha256, first_id, last_id) '
                    'VALUES (?, ?, ?, ?, ?)',
                    (url, name, record.sha256, first, last),
                )
                if previous is None:
                    report.added += 1
                else:
                    report.updated += 1

        for url in set(held) - seen:
            _, _, first, last = held[url]
            connection.execute('DELETE FROM chunks WHERE rowid BETWEEN ? AND ?', (first, last))
            connection.execute('DELETE FROM pages WHERE url = ?', (url,))
            report.removed += 1

        report.pages = connection.execute('SELECT COUNT(*) FROM pages').fetchone()[0]
        connection.execute('COMMIT')
    except BaseException:
        connection.execute('ROLLBACK')
        raise
    finally:
        connection.close()

    report.seconds = time.monotonic() - started
    _note(
        settings,
        f'{report.repository} refresh trigger={trigger} rebuild={rebuild} tracked={len(tracked)} '
        f'held={len(held)} added={report.added} updated={report.updated} removed={report.removed} '
        f'pages={report.pages} seconds={report.seconds:.1f}',
    )
    return report


def stale(root: Path, settings: Settings | None = None) -> str | None:
    """Why the index needs a refresh before it is read, or None when it does not.

    Missing is one reason; a manifest written after the index is the other, named by target.
    """
    settings = settings or get_settings()
    path = index_path(root, settings)
    if not path.is_file():
        return 'missing'
    built = path.stat().st_mtime
    own = Settings.for_repository(root)
    for name in inventory.tracked(own):
        manifest = inventory.directory_for(name, own) / 'manifest.json'
        if manifest.is_file() and manifest.stat().st_mtime > built:
            return f'manifest:{name}'
    return None


def match_expression(query: str) -> str:
    """Turn free text into an FTS5 expression that cannot raise on the user's punctuation.

    Every word becomes a quoted phrase token joined by the implicit AND, so `Record Type` finds
    chunks holding both words and `foo(bar)` does not reach the parser as an operator. An empty
    query is refused rather than matched against everything.
    """
    words = _words(query)
    return ' '.join(f'"{word}"' for word in words)


def _words(query: str) -> list[str]:
    words = [word.replace('"', '') for word in WORD.findall(query)]
    words = [word for word in words if word]
    if not words:
        raise DyarchiaCrawleeError('a search needs at least one word')
    return words


def _carrying(words: list[str]) -> list[str]:
    """The words that carry the question, which is every word that is not furniture.

    A stopword is dropped from what a chunk is required to hold, never from the phrase: asking for
    `how to create a skill` and requiring `to` and `a` is asking for nothing, because every page
    in the corpus holds both, and BM25 then ranks by the words that mean least. It stays in the
    phrase rung because `state of the art` is not the same question as `state art`.
    """
    carrying = [word for word in words if word.lower() not in STOPWORDS]
    return carrying or words


def ladder(query: str) -> list[tuple[str, str]]:
    """The rungs a query is tried on, most exacting first, each labelled with what it proved.

    A reader who types a sentence means the sentence, and a chunk holding it verbatim is a better
    answer than one holding its words scattered over sixteen hundred characters. Nothing above the
    last rung existed before: every query went straight to the words-together rung and fell to
    any-word when that was empty, so a five-word question was answered by whatever page happened
    to hold `to` and `a` near something relevant.

    Each rung is tried across every repository before the next one is, so a weaker match elsewhere
    never outranks a stronger match here.
    """
    words = _words(query)
    carrying = _carrying(words)
    rungs: list[tuple[str, str]] = []

    if len(words) > 1:
        rungs.append(('phrase', '"{}"'.format(' '.join(words))))
    if len(carrying) > 1:
        near = ' '.join(f'"{word}"' for word in carrying)
        rungs.append(('near', f'NEAR({near}, {NEAR_TOKENS})'))
    rungs.append(('all', ' '.join(f'"{word}"' for word in carrying)))
    if len(carrying) > 1:
        rungs.append(('any', ' OR '.join(f'"{word}"' for word in carrying)))

    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for label, expression in rungs:
        if expression in seen:
            continue
        seen.add(expression)
        unique.append((label, expression))
    return unique


def _roots(repository: str | None, settings: Settings) -> list[Path]:
    roots = repositories.roots(settings)
    if repository is None:
        return roots
    chosen = [root for root in roots if root.name == repository]
    if not chosen:
        names = ', '.join(root.name for root in roots) or 'none'
        raise DyarchiaCrawleeError(f'no corpus repository named {repository!r}; this machine holds: {names}')
    return chosen


def search(
    query: str,
    repository: str | None = None,
    target: str | None = None,
    limit: int = 10,
    settings: Settings | None = None,
    refresh_first: bool = True,
) -> list[Hit]:
    """Answer a query across one repository or every one, best chunks first.

    The index is brought up to date before it is read when a manifest moved since it was built,
    so a search after a round sees the round.

    The rungs of `ladder` are walked in order and their hits appended, each rung sorted among
    itself by BM25, until there are enough. Order therefore carries precision: everything the
    phrase rung found comes before anything the any-word rung did, and `Hit.match` names which
    rung a hit came from. Accumulating rather than stopping at the first rung that answers is
    deliberate — one page holding the sentence verbatim should not hide nine that answer the
    question, which is the difference between a search and a lookup.
    """
    settings = settings or get_settings()
    roots = _roots(repository, settings)

    readable: list[Path] = []
    for root in roots:
        if refresh_first:
            reason = stale(root, settings)
            if reason:
                refresh(root, settings, trigger=f'search:{reason}')
        path = index_path(root, settings)
        if path.is_file():
            readable.append(root)

    hits: list[Hit] = []
    seen: set[tuple[str, str, str]] = set()

    for label, expression in ladder(query):
        rung: list[Hit] = []
        for root in readable:
            connection = _reader(index_path(root, settings))
            try:
                found = _query(connection, root, expression, target, limit, label)
            except sqlite3.OperationalError as error:
                if 'no such table' in str(error) or 'fts5: syntax error' in str(error):
                    found = []
                else:
                    raise
            finally:
                connection.close()
            rung.extend(found)

        rung.sort(key=lambda hit: hit.score)
        for hit in rung:
            key = (hit.repository, hit.url, hit.heading)
            if key in seen:
                continue
            seen.add(key)
            hits.append(hit)
        if len(hits) >= limit:
            break

    return hits[:limit]


"""
The columns of `chunks`, in the order the table declares them, because FTS5 addresses them by
position: `snippet()` takes the index of the column to quote and `bm25()` takes one weight per
column, in order. Adding a column shifts both, silently — a stale snippet index quotes the wrong
field and a short weight list is a different ranking, neither of which fails loudly.
"""
BODY_COLUMN = 6
COLUMN_WEIGHTS = '0, 0, 0, 0, 3.0, 2.0, 1.0'


def _query(
    connection: sqlite3.Connection,
    root: Path,
    expression: str,
    target: str | None,
    limit: int,
    match: str = 'all',
) -> list[Hit]:
    clauses = ['chunks MATCH ?']
    params: list[object] = [expression]
    if target:
        clauses.append('target = ?')
        params.append(target)
    params.append(limit)
    rows = connection.execute(
        'SELECT target, url, path, line, title, heading, '
        f"snippet(chunks, {BODY_COLUMN}, '[', ']', ' ... ', {SNIPPET_TOKENS}), "
        f'bm25(chunks, {COLUMN_WEIGHTS}) AS score '
        f'FROM chunks WHERE {" AND ".join(clauses)} ORDER BY score LIMIT ?',
        params,
    ).fetchall()
    return [
        Hit(
            repository=root.name,
            target=row[0],
            url=row[1],
            file=str(root / str(row[2])) if row[2] else '',
            line=int(row[3] or 1),
            title=row[4],
            heading=row[5],
            snippet=' '.join(str(row[6]).split()),
            score=float(row[7]),
            match=match,
        )
        for row in rows
    ]
