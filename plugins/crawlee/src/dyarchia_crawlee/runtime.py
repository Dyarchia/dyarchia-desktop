"""Making a second run possible, in the same process and beside another process.

Crawlee caches storage instances, and the locks guarding them, in a process-global service locator.
Those locks bind to the event loop that created them, so a second `asyncio.run` in the same process
fails with "bound to a different event loop". A CLI that exits after one run never notices; a test
suite, a scheduler, or anything embedding the engine notices immediately.

Clearing the cache before a run is therefore part of what starting a run means. It also implies runs
are sequential within a process: two crawls sharing a process at the same time were never safe under
a global service locator, and this does not change that.

Two processes are the other half of the same problem, and the more dangerous half, because nothing
fails. Crawlee keeps its request queue on disk under one directory for the whole checkout, so a
crawl started while another is running takes requests from the other's queue and hands over its own.
Neither run errors. Both write a corpus, and one of them holds pages belonging to somebody else's
target while its own are recorded as removed. Giving each process its own directory is what makes
that impossible.
"""

from __future__ import annotations

import atexit
import os
import shutil
from pathlib import Path
from typing import Any

from crawlee import service_locator

STORAGE_ENV = 'CRAWLEE_STORAGE_DIR'


def reset_storage_state() -> None:
    """Drop cached storage instances so the next run builds its own, on its own event loop."""
    manager: Any = service_locator.storage_instance_manager
    manager.clear_cache()

    locks = getattr(manager, '_opener_locks', None)
    if isinstance(locks, dict):
        locks.clear()


def _discard(directory: Path) -> None:
    """Remove a run's working directory, tolerating a process that never created one."""
    shutil.rmtree(directory, ignore_errors=True)


def use_private_storage(root: Path) -> Path:
    """Point Crawlee's working directory at one this process does not share, and return it.

    The directory is named after the process, so two crawls started from the same checkout cannot
    see each other's request queue. It is removed when the process exits; a process killed before
    that leaves one behind, which costs nothing because Crawlee purges the directory it is given at
    the start of every run anyway.

    An explicitly configured CRAWLEE_STORAGE_DIR is left exactly as it was found. Whoever set it has
    said where the working directory goes, including the case of deliberately sharing one.
    """
    configured = os.environ.get(STORAGE_ENV)
    if configured:
        return Path(configured)

    directory = root / f'run-{os.getpid()}'
    os.environ[STORAGE_ENV] = str(directory)
    atexit.register(_discard, directory)
    return directory
