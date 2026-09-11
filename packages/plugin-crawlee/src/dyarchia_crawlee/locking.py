"""One round over a corpus at a time.

Two sweeps of the same group no longer corrupt each other -- `runtime.use_private_storage` fixed
that -- but they still both crawl, and a round measured at forty minutes is forty minutes wasted.
The scheduled task fires at every logon; a panel offers a button; somebody runs the command by
hand. Any two of those can meet.

The lock is taken by the toolkit rather than by whatever calls it, because a lock only one caller
respects is not a lock: the scheduled task has to obey the same one the button does.

Enforcement is an advisory lock held by the operating system for the life of the process, not a
witness file. A witness has to be reaped when its owner dies, and this project has already paid
once for a bookkeeping file a killed run left behind. The kernel releases this one on its own,
however the holder ends -- promptly rather than instantly, measured at 56 ms on Windows after a
kill, so a caller that retries immediately after one may still be refused once.
"""

from __future__ import annotations

import json
import os
import socket
import sys
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import DyarchiaCrawleeError
from dyarchia_crawlee.models import utcnow

LOCK_DIRECTORY = 'locks'
EVERYTHING = 'all'


class RoundInProgressError(DyarchiaCrawleeError):
    """Raised when another round already holds this group."""


@dataclass(slots=True)
class Holder:
    """Who took the lock, as far as they were willing to say. Never the authority, only the label."""

    key: str
    pid: int | None = None
    host: str | None = None
    since: datetime | None = None
    description: str | None = None

    def __str__(self) -> str:
        parts = [f'a round over {self.key!r} is already running']
        if self.description:
            parts.append(self.description)
        if self.pid is not None:
            parts.append(f'pid {self.pid}')
        if self.host:
            parts.append(f'on {self.host}')
        if self.since:
            parts.append(f'since {self.since.isoformat()}')
        return ', '.join(parts)


def _paths(settings: Settings, key: str) -> tuple[Path, Path]:
    directory = settings.resolve(settings.output_dir) / LOCK_DIRECTORY
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f'{key}.lock', directory / f'{key}.owner'


def _take(handle: int) -> bool:
    """Try to lock the file exclusively without waiting. False when somebody else holds it."""
    try:
        if sys.platform == 'win32':
            import msvcrt

            msvcrt.locking(handle, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


def _release(handle: int) -> None:
    try:
        if sys.platform == 'win32':
            import msvcrt

            os.lseek(handle, 0, os.SEEK_SET)
            msvcrt.locking(handle, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle, fcntl.LOCK_UN)
    except OSError:
        pass


def holder(key: str, settings: Settings | None = None) -> Holder:
    """What the current holder said about itself, for an error message or a panel.

    Read from a file the holder writes and nobody locks, so it can be missing, stale or partial.
    It is never consulted to decide whether the lock is free; that is the kernel's answer alone.
    """
    settings = settings or get_settings()
    _, owner = _paths(settings, key)
    found = Holder(key=key)
    try:
        raw = json.loads(owner.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return found

    found.pid = raw.get('pid')
    found.host = raw.get('host')
    found.description = raw.get('description')
    with suppress(KeyError, TypeError, ValueError):
        found.since = datetime.fromisoformat(raw['since'])
    return found


@contextmanager
def hold(key: str, description: str = '', settings: Settings | None = None) -> Iterator[None]:
    """Hold the round lock for `key`, or raise RoundInProgress naming whoever has it."""
    settings = settings or get_settings()
    lock, owner = _paths(settings, key)

    handle = os.open(lock, os.O_RDWR | os.O_CREAT, 0o644)
    if not _take(handle):
        os.close(handle)
        raise RoundInProgressError(str(holder(key, settings)))

    # The label is a courtesy. Losing it costs a good error message, not correctness.
    with suppress(OSError):
        owner.write_text(
            json.dumps(
                {
                    'key': key,
                    'pid': os.getpid(),
                    'host': socket.gethostname(),
                    'since': utcnow().isoformat(),
                    'description': description,
                },
                indent=2,
            ),
            encoding='utf-8',
        )

    try:
        yield
    finally:
        _release(handle)
        os.close(handle)
        with suppress(OSError):
            owner.unlink(missing_ok=True)
