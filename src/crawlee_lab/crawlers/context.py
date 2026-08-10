"""Safe access to the parts of a crawling context that may not exist.

`AdaptivePlaywrightCrawlingContext.page` is a property that raises when the request was served by
the static sub-crawler, so `getattr(context, 'page', None)` is not enough: the default only covers a
missing attribute, not a raising one.

Crawlee 1.9 does not re-export `AdaptiveContextError` from any public module, so it is imported from
its defining module behind a guard. If that module ever moves, the fallback keeps this file
importable and `safe_page` degrades to recognising the error by name rather than by class.
"""

from __future__ import annotations

from typing import Any

try:
    from crawlee.crawlers._adaptive_playwright._adaptive_playwright_crawling_context import (
        AdaptiveContextError,
    )

    _ADAPTIVE_ERRORS: tuple[type[BaseException], ...] = (AdaptiveContextError,)
except ImportError:  # pragma: no cover
    _ADAPTIVE_ERRORS = ()

_ADAPTIVE_ERROR_NAME = 'AdaptiveContextError'


def safe_page(context: Any) -> Any | None:
    """Return the live Playwright page for this context, or None if the page was never rendered."""
    try:
        return context.page
    except AttributeError:
        return None
    except _ADAPTIVE_ERRORS:
        return None
    except Exception as error:
        if type(error).__name__ == _ADAPTIVE_ERROR_NAME:
            return None
        raise
