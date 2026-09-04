"""Committing a snapshot, so the change history lives in git rather than in a bespoke format.

Committing is always explicit. A scraper that writes to your working tree is expected; one that
writes to your history without being asked is not.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from crawlee_lab.errors import CrawleeLabError

_GIT_TIMEOUT = 600


def _git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    """Run one git command, turning anything that goes wrong into a CrawleeLabError.

    The timeout is generous because commit hooks run inside `git commit`, and a hook suite that
    installs its own environments on first use takes minutes, not seconds. A crawl must not report
    a traceback because the repository was being linted.
    """
    try:
        return subprocess.run(
            ['git', *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise CrawleeLabError(f'git {args[0]} could not be run: {error}') from error


def repository_root(directory: Path) -> Path | None:
    """The top of the working tree that holds `directory`, or None when it holds no repository.

    The corpora do not have to live inside the tool's own checkout, and since they were split out
    they no longer do. Asking git which repository owns the data directory is the only way to reach
    the right one; deriving it from where pyproject.toml sits only ever finds the tool.
    """
    if not directory.exists():
        return None
    found = _git(['rev-parse', '--show-toplevel'], directory)
    if found.returncode != 0:
        return None
    top = found.stdout.strip()
    return Path(top) if top else None


def head(root: Path) -> str | None:
    """The short hash at the tip of this repository, or None when there is no commit yet."""
    found = _git(['rev-parse', '--short', 'HEAD'], root)
    return found.stdout.strip() or None if found.returncode == 0 else None


def is_dirty(root: Path) -> bool:
    """Whether this repository has uncommitted changes, staged or not."""
    status = _git(['status', '--porcelain'], root)
    return bool(status.stdout.strip()) if status.returncode == 0 else False


def is_ignored(directory: Path, root: Path) -> bool:
    """Whether git has been told to ignore this snapshot directory."""
    return _git(['check-ignore', '-q', '--', str(directory)], root).returncode == 0


def commit_snapshot(directory: Path, message: str) -> str | None:
    """Stage and commit one snapshot directory, returning the new commit hash.

    The repository is the one that owns `directory`, whichever that is. Returns None when the
    snapshot produced no change, which is the normal outcome for a target that has not been edited
    since the previous run.
    """
    root = repository_root(directory)
    if root is None:
        raise CrawleeLabError(
            f'{directory} is not inside a git repository, so --commit has nothing to write to'
        )

    if is_ignored(directory, root):
        raise CrawleeLabError(
            f'{directory} is ignored by .gitignore, so --commit cannot record anything. '
            f'Change detection does not need git and keeps working; only the long-term history '
            f'is lost. Remove the entry from .gitignore if you want the history back.'
        )

    staged = _git(['add', '--', str(directory)], root)
    if staged.returncode != 0:
        raise CrawleeLabError(f'git add failed: {staged.stderr.strip()}')

    pending = _git(['diff', '--cached', '--quiet', '--', str(directory)], root)
    if pending.returncode == 0:
        return None

    committed = _git(['commit', '-m', message, '--', str(directory)], root)
    if committed.returncode != 0:
        detail = committed.stderr.strip() or committed.stdout.strip()
        raise CrawleeLabError(f'git commit failed: {detail}')

    revision = _git(['rev-parse', 'HEAD'], root)
    return revision.stdout.strip() or None
