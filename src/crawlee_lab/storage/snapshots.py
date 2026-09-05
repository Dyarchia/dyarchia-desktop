"""Snapshotting a run into the repository so git becomes the change history.

Content lands under `data/<name>/pages/<host>/<path>.md`, which makes `git log` and `git diff` the
interface for "what changed and when" without inventing a storage format. The manifest beside it
records status and hashes so a report can be produced without invoking git at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from crawlee_lab.config import Settings
from crawlee_lab.errors import RunAbortedError
from crawlee_lab.models import FailureRecord, PageStatus, RunSpec, ScrapedItem
from crawlee_lab.urls import snapshot_relative_path, strip_suffix
from crawlee_lab.versioning.diffing import ChangeReport, compare, save_report
from crawlee_lab.versioning.hashing import content_hash, normalise
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest
from crawlee_lab.versioning.report import render_markdown

PAGES_DIRNAME = 'pages'
CHANGES_DOCUMENT = 'CHANGES.md'

# Above this share of the corpus, a change is more likely to be systematic than editorial. Sites do
# rewrite themselves wholesale, so this warns rather than blocks; the point is that nobody should
# have to notice the ratio by eye.
CHURN_WARNING_SHARE = 0.5


@dataclass(slots=True)
class SnapshotResult:
    """Where the snapshot landed and what it changed."""

    directory: Path
    manifest: RunManifest
    report: ChangeReport
    written: list[Path] = field(default_factory=list)
    deleted: list[Path] = field(default_factory=list)
    persisted: bool = True
    warnings: list[str] = field(default_factory=list)


def content_fingerprint(manifest: RunManifest) -> dict[str, tuple[str, str | None]]:
    """The part of a manifest that says something about the target rather than about the run.

    Timestamps move on every run. Comparing on this instead is what keeps a run that found nothing
    from rewriting files, and therefore from turning `git log` into a record of how often the
    scraper ran rather than of how often the target changed.
    """
    return {url: (record.status.value, record.sha256) for url, record in manifest.pages.items()}


def snapshot_directory(spec: RunSpec, settings: Settings) -> Path:
    return settings.data_root(spec.group) / spec.name


def _resolve_inside(base: Path, relative: Path | str) -> Path:
    """Resolve a snapshot path, refusing anything that would escape the snapshot directory."""
    target = (base / relative).resolve()
    if not target.is_relative_to(base.resolve()):
        raise RunAbortedError(f'refusing to write outside the snapshot directory: {relative}')
    return target


def _build_records(items: list[ScrapedItem], spec: RunSpec) -> dict[str, tuple[PageRecord, str]]:
    records: dict[str, tuple[PageRecord, str]] = {}

    for item in items:
        if not item.content:
            continue

        url = strip_suffix(item.url, spec.fetch_suffix)
        relative = Path(PAGES_DIRNAME) / snapshot_relative_path(url)
        text = normalise(item.content)
        records[url] = (
            PageRecord(
                url=url,
                status=PageStatus.OK,
                fetched_at=item.fetched_at,
                sha256=content_hash(text),
                path=relative.as_posix(),
                title=item.title,
            ),
            text,
        )

    return records


def _failure_records(failures: list[FailureRecord], spec: RunSpec) -> dict[str, PageRecord]:
    return {
        strip_suffix(failure.url, spec.fetch_suffix): PageRecord(
            url=strip_suffix(failure.url, spec.fetch_suffix),
            status=PageStatus.FAILED,
            fetched_at=failure.failed_at,
            error=failure.error,
        )
        for failure in failures
    }


def _read_previous(directory: Path, record: PageRecord | None) -> str:
    if record is None or record.path is None:
        return ''
    path = directory / record.path
    return path.read_text(encoding='utf-8') if path.is_file() else ''


def _prune(directory: Path, path: Path) -> None:
    path.unlink(missing_ok=True)
    for parent in path.parents:
        if parent == directory or not parent.is_dir() or any(parent.iterdir()):
            break
        parent.rmdir()


def _guard_coverage(stored: int, previous: RunManifest | None, spec: RunSpec, settings: Settings) -> None:
    """Refuse a run that reaches far fewer pages than the snapshot it is about to replace.

    The success rate cannot catch this. A run capped at three pages downloads three of three and
    reports a hundred per cent, then deletes everything it did not visit. The same happens with a
    mistyped include pattern or a sitemap that came back truncated. Coverage asks the other
    question: did this run actually see the target, or only a corner of it.
    """
    if previous is None:
        return

    before = len(previous.stored)
    if before == 0:
        return

    threshold = settings.min_coverage if spec.min_coverage is None else spec.min_coverage
    coverage = stored / before
    if coverage >= threshold:
        return

    limit = f' The run was capped at {spec.max_pages} pages.' if spec.max_pages is not None else ''
    raise RunAbortedError(
        f'this run stored {stored} pages against {before} in the previous snapshot, '
        f'{coverage:.0%} coverage, below the {threshold:.0%} threshold, so nothing was written.'
        f'{limit} Re-run without a page limit, check the include and exclude patterns, or lower '
        f'min_coverage if the target really did shrink.'
    )


def take_snapshot(
    items: list[ScrapedItem],
    failures: list[FailureRecord],
    spec: RunSpec,
    settings: Settings,
    success_rate: float,
) -> SnapshotResult:
    """Write this run's content, compare it with the previous one and report the difference.

    A run that failed too often writes nothing. Half a snapshot would read as mass deletion on the
    next comparison, which is worse than having no snapshot for that day.
    """
    threshold = settings.min_success_rate if spec.min_success_rate is None else spec.min_success_rate
    if success_rate < threshold:
        raise RunAbortedError(
            f'success rate {success_rate:.0%} is below the {threshold:.0%} threshold, '
            f'so no snapshot was written. Re-run, or lower min_success_rate to accept it.'
        )

    directory = snapshot_directory(spec, settings)
    directory.mkdir(parents=True, exist_ok=True)
    previous = load_manifest(directory)

    records = _build_records(items, spec)
    failed = _failure_records(failures, spec)

    _guard_coverage(len(records), previous, spec, settings)

    manifest = RunManifest(
        name=spec.name,
        success_rate=success_rate,
        pages={
            **{url: record for url, (record, _) in records.items()},
            **{url: record for url, record in failed.items() if url not in records},
        },
    )

    old_stored = previous.stored if previous is not None else {}
    texts_before = {
        url: _read_previous(directory, old_stored.get(url))
        for url, (record, _) in records.items()
        if url in old_stored and old_stored[url].sha256 != record.sha256
    }
    texts_after = {url: text for url, (_, text) in records.items()}

    written: list[Path] = []
    for url, (record, text) in records.items():
        if record.path is None:
            continue
        old = old_stored.get(url)
        target = _resolve_inside(directory, record.path)
        if old is not None and old.sha256 == record.sha256 and target.is_file():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8', newline='\n')
        written.append(target)

    deleted: list[Path] = []
    for url, old in old_stored.items():
        if url in records or url in failed or old.path is None:
            continue
        target = _resolve_inside(directory, old.path)
        if target.is_file():
            _prune(directory, target)
            deleted.append(target)

    report = compare(previous, manifest, texts_before, texts_after)

    persisted = previous is None or content_fingerprint(previous) != content_fingerprint(manifest)
    if persisted:
        save_manifest(manifest, directory)
        save_report(report, directory)
        (directory / CHANGES_DOCUMENT).write_text(render_markdown(report), encoding='utf-8', newline='\n')

    return SnapshotResult(
        directory=directory,
        manifest=manifest if persisted else previous or manifest,
        report=report,
        written=written,
        deleted=deleted,
        persisted=persisted,
        warnings=churn_warnings(report),
    )


def churn_warnings(report: ChangeReport) -> list[str]:
    """Say so when a change looks like the site changed shape rather than changed its mind.

    A handful of edited pages is a site being maintained. Most of the corpus moving at once is
    almost always one of three things: the publisher changed its output format, an extraction step
    of ours changed, or a template was edited. All three are worth a second look before the diff is
    read as news, and none of them is a reason to refuse the snapshot.
    """
    if report.is_first_run:
        return []

    compared = len(report.modified) + len(report.removed) + report.unchanged
    if compared == 0:
        return []

    moved = len(report.modified) + len(report.removed)
    share = moved / compared
    if share < CHURN_WARNING_SHARE:
        return []

    return [
        f'{moved} of {compared} pages changed, {share:.0%} of the corpus. That is high enough to '
        f'suspect a format change at the source or in extraction rather than edits to the content. '
        f'Read one diff before trusting the rest.'
    ]
