"""Committing a snapshot, so the change history lives in git rather than in a bespoke format.

Committing is always explicit. A scraper that writes to your working tree is expected; one that
writes to your history without being asked is not.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from crawlee_lab.errors import CrawleeLabError

_GIT_TIMEOUT = 60


def _git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ['git', *args],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=_GIT_TIMEOUT,
        check=False,
    )


def is_repository(root: Path) -> bool:
    return _git(['rev-parse', '--git-dir'], root).returncode == 0


def commit_snapshot(directory: Path, message: str, root: Path) -> str | None:
    """Stage and commit one snapshot directory, returning the new commit hash.

    Returns None when the snapshot produced no change, which is the normal outcome for a target
    that has not been edited since the previous run.
    """
    if not is_repository(root):
        raise CrawleeLabError(f'{root} is not a git repository, so --commit has nothing to write to')

    staged = _git(['add', '--', str(directory)], root)
    if staged.returncode != 0:
        raise CrawleeLabError(f'git add failed: {staged.stderr.strip()}')

    pending = _git(['diff', '--cached', '--quiet', '--', str(directory)], root)
    if pending.returncode == 0:
        return None

    committed = _git(['commit', '-m', message, '--', str(directory)], root)
    if committed.returncode != 0:
        raise CrawleeLabError(f'git commit failed: {committed.stderr.strip()}')

    revision = _git(['rev-parse', 'HEAD'], root)
    return revision.stdout.strip() or None
