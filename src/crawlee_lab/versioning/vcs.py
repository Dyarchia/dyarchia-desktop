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


def is_repository(root: Path) -> bool:
    return _git(['rev-parse', '--git-dir'], root).returncode == 0


def is_ignored(directory: Path, root: Path) -> bool:
    """Whether git has been told to ignore this snapshot directory."""
    return _git(['check-ignore', '-q', '--', str(directory)], root).returncode == 0


def commit_snapshot(directory: Path, message: str, root: Path) -> str | None:
    """Stage and commit one snapshot directory, returning the new commit hash.

    Returns None when the snapshot produced no change, which is the normal outcome for a target
    that has not been edited since the previous run.
    """
    if not is_repository(root):
        raise CrawleeLabError(f'{root} is not a git repository, so --commit has nothing to write to')

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
