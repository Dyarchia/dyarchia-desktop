"""Committing a snapshot, so the change history lives in git rather than in a bespoke format.

Committing is always explicit. A scraper that writes to your working tree is expected; one that
writes to your history without being asked is not.
"""

from __future__ import annotations

import subprocess
from collections.abc import Sequence
from pathlib import Path

from dyarchia_crawlee.errors import DyarchiaCrawleeError

_GIT_TIMEOUT = 600


def _git(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    """Run one git command, turning anything that goes wrong into a DyarchiaCrawleeError.

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
        raise DyarchiaCrawleeError(f'git {args[0]} could not be run: {error}') from error


def repository_root(path: Path) -> Path | None:
    """The top of the working tree that holds `path`, or None when it is in no repository.

    The corpora do not have to live inside the tool's own checkout, and since they were split out
    they no longer do. Asking git which repository owns the data directory is the only way to reach
    the right one; deriving it from where pyproject.toml sits only ever finds the tool.

    A file is asked about from the directory holding it: git runs somewhere, and a file is not a
    somewhere. Profiles are single files, so this is reached with one every time one is saved.
    """
    directory = path if path.is_dir() else path.parent
    if not directory.is_dir():
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


def commit_paths(targets: Sequence[Path], message: str) -> str | None:
    """Stage and commit several paths of one repository at once, returning the new hash.

    One commit, because the paths that go together came from one decision: a profile, the corpus
    it describes and the output that corpus produced are one target, and removing them in three
    commits leaves two states of the repository in which a target half exists.

    A path git has been told to ignore is skipped rather than refused, which is the difference
    between this and `commit_path`. A corpus deliberately kept out of the history is still a
    corpus, and a deletion that takes it off the disk has nothing to record about it either way;
    refusing the whole commit because one of several paths is ignored would leave the profile
    behind to describe a corpus that is gone.
    """
    if not targets:
        return None

    root = repository_root(targets[0])
    if root is None:
        raise DyarchiaCrawleeError(
            f'{targets[0]} is not inside a git repository, so there is nothing to write to'
        )

    staged: list[Path] = []
    for path in targets:
        if is_ignored(path, root):
            continue
        added = _git(['add', '--', str(path)], root)
        if added.returncode == 0:
            staged.append(path)
            continue
        # A path that is gone from the disk and was never in the index matches nothing, which is
        # what git says about a corpus nobody committed. There is nothing to record about it and
        # nothing wrong with it either, so it leaves the commit rather than failing it.
        if 'did not match any files' in added.stderr:
            continue
        raise DyarchiaCrawleeError(f'git add failed: {added.stderr.strip()}')

    if not staged:
        return None

    arguments = [str(path) for path in staged]
    pending = _git(['diff', '--cached', '--quiet', '--', *arguments], root)
    if pending.returncode == 0:
        return None

    committed = _git(['commit', '-m', message, '--', *arguments], root)
    if committed.returncode != 0:
        detail = committed.stderr.strip() or committed.stdout.strip()
        raise DyarchiaCrawleeError(f'git commit failed: {detail}')

    revision = _git(['rev-parse', 'HEAD'], root)
    return revision.stdout.strip() or None


def commit_path(target: Path, message: str) -> str | None:
    """Stage and commit one path, a corpus directory or a single file, returning the new hash.

    The repository is the one that owns `target`, whichever that is. Returns None when the path
    produced no change, which is the normal outcome for a corpus nothing edited since the previous
    run, and for a profile saved with the same content it already had.
    """
    root = repository_root(target)
    if root is None:
        raise DyarchiaCrawleeError(
            f'{target} is not inside a git repository, so there is nothing to write to'
        )

    if is_ignored(target, root):
        raise DyarchiaCrawleeError(
            f'{target} is ignored by .gitignore, so the commit cannot record anything. '
            f'Change detection does not need git and keeps working; only the long-term history '
            f'is lost. Remove the entry from .gitignore if you want the history back.'
        )

    staged = _git(['add', '--', str(target)], root)
    if staged.returncode != 0:
        raise DyarchiaCrawleeError(f'git add failed: {staged.stderr.strip()}')

    pending = _git(['diff', '--cached', '--quiet', '--', str(target)], root)
    if pending.returncode == 0:
        return None

    committed = _git(['commit', '-m', message, '--', str(target)], root)
    if committed.returncode != 0:
        detail = committed.stderr.strip() or committed.stdout.strip()
        raise DyarchiaCrawleeError(f'git commit failed: {detail}')

    revision = _git(['rev-parse', 'HEAD'], root)
    return revision.stdout.strip() or None
