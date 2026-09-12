"""What a run is allowed to say, so the line worth reading is not buried.

A sweep is streamed straight into the desktop panel and read there as a narrative: which target is
being fetched, how far it has got, what changed. Three sources talk over that narrative, and none of
them answers a question anybody asked.

`trafilatura` warns once per anchor whose own text is empty, which on a documentation index is every
card in the grid. Measured on ai.google.dev/gemini-api/docs: nine warnings, and the only thing the
extraction loses is the card's href. Every card's text is kept, and every destination is a sitemap
entry the same run fetches on its own. Forty-five of those warnings at eight lines each were four
fifths of one sweep's output.

Crawlee's autoscaler reports its own arithmetic once a minute, and the numbers are the ones it was
configured with. Its statistics table repeats every minute, in twelve lines, what the progress line
above it already said in one; the table printed when a crawler finishes is the summary of the run
and is kept.

Nothing here raises a threshold or hides a failure. Each of the three is matched exactly, anything
else those loggers have to say still arrives, and a run asked for DEBUG is left alone entirely.
"""

from __future__ import annotations

import logging
from typing import Any

EMPTY_LINK = 'empty link'
PERIODIC_STATISTICS = 'Current request statistics'
AUTOSCALER = 'crawlee._autoscaling.autoscaled_pool'


class _Without(logging.Filter):
    """Drops the one message it is named after and passes everything else."""

    def __init__(self, marker: str) -> None:
        super().__init__()
        self.marker = marker

    def filter(self, record: logging.LogRecord) -> bool:
        return self.marker not in record.getMessage()


def _drop_once(logger: logging.Logger, marker: str) -> None:
    """Install the filter unless this logger already carries it.

    A sweep builds one crawler per target and every one of them asks for the same policy, while the
    loggers behind it live as long as the process. Without this a nine-target round would stack nine
    identical filters on `trafilatura.xml`.
    """
    if not any(isinstance(existing, _Without) and existing.marker == marker for existing in logger.filters):
        logger.addFilter(_Without(marker))


def apply_log_policy(crawler: Any) -> None:
    """Quiet the three recurring lines a run cannot act on, unless the operator asked for DEBUG."""
    if logging.getLogger().getEffectiveLevel() <= logging.DEBUG:
        return

    _drop_once(logging.getLogger('trafilatura.xml'), EMPTY_LINK)
    _drop_once(crawler.log, PERIODIC_STATISTICS)
    logging.getLogger(AUTOSCALER).setLevel(logging.WARNING)
