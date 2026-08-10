"""Making a second run in the same process possible.

Crawlee caches storage instances, and the locks guarding them, in a process-global service locator.
Those locks bind to the event loop that created them, so a second `asyncio.run` in the same process
fails with "bound to a different event loop". A CLI that exits after one run never notices; a test
suite, a scheduler, or anything embedding the engine notices immediately.

Clearing the cache before a run is therefore part of what starting a run means. It also implies runs
are sequential: two crawls sharing a process at the same time were never safe under a global
service locator, and this does not change that.
"""

from __future__ import annotations

from typing import Any

from crawlee import service_locator


def reset_storage_state() -> None:
    """Drop cached storage instances so the next run builds its own, on its own event loop."""
    manager: Any = service_locator.storage_instance_manager
    manager.clear_cache()

    locks = getattr(manager, '_opener_locks', None)
    if isinstance(locks, dict):
        locks.clear()
