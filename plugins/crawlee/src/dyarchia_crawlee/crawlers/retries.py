"""One readable line per retry, in place of the one Crawlee writes.

Crawlee says `Retrying request to <url> due to: <str(error)>. <a line of traceback>`. A connection
the server drops mid-response raises an exception whose text is empty, so the line read
`due to: .` followed by a fragment of asyncio's Windows event loop: a warning that looked like a
crash and said nothing about what happened. The reason is usually further down the chain, in the
socket error the client wrapped, and that is where this looks for it.
"""

from __future__ import annotations

import logging
from typing import Any

from crawlee.errors import SessionError

CRAWLEE_PREFIX = 'Retrying request to '

UNSAID = {
    'ConnectionResetError': 'the server reset the connection',
    'ConnectionAbortedError': 'the connection was aborted',
    'ReadError': 'the connection closed mid-response',
    'RemoteProtocolError': 'the server closed the connection mid-response',
    'ReadTimeout': 'the response timed out',
    'ConnectTimeout': 'connecting timed out',
    'TimeoutError': 'timed out',
}


def _chain(error: BaseException) -> list[BaseException]:
    links: list[BaseException] = []
    current: BaseException | None = error
    while current is not None and all(current is not link for link in links):
        links.append(current)
        current = current.__cause__ or current.__context__
    return links


def reason(error: BaseException) -> str:
    """What went wrong, from the first exception in the chain that says anything at all."""
    links = _chain(error)
    for link in links:
        text = str(link).strip().split('\n')[0].strip()
        if text:
            return text
    for link in links:
        if type(link).__name__ in UNSAID:
            return UNSAID[type(link).__name__]
    return type(links[-1]).__name__


class _QuietRetries(logging.Filter):
    """Drops Crawlee's own retry warning, which `announce` below replaces."""

    def filter(self, record: logging.LogRecord) -> bool:
        return not str(record.msg).startswith(CRAWLEE_PREFIX)


def install(crawler: Any, retries: int) -> None:
    """Say each retry once, as `retry 1 of 3 · reason · url`.

    A session error is left alone: Crawlee reports a session rotation in its own words, and the
    error handler also runs once rotations are exhausted, where there is no retry to announce.
    """
    log: logging.Logger = crawler.log
    if not any(isinstance(existing, _QuietRetries) for existing in log.filters):
        log.addFilter(_QuietRetries())

    async def announce(context: Any, error: Exception) -> None:
        if isinstance(error, SessionError):
            return
        request = context.request
        log.warning(f'retry {request.retry_count} of {retries} · {reason(error)} · {request.url}')

    crawler.error_handler(announce)
