"""Exception hierarchy for the toolkit."""

from __future__ import annotations


class CrawleeLabError(Exception):
    """Base class for every error raised by euripontida-crawlee."""


class ConfigurationError(CrawleeLabError):
    """The requested run cannot be described with the given options."""


class ProfileError(CrawleeLabError):
    """A profile is missing, malformed or contradictory."""


class BrowserNotInstalledError(CrawleeLabError):
    """A browser-backed crawler was requested but Playwright browsers are missing."""

    def __init__(self, browser: str = 'chromium') -> None:
        super().__init__(
            f'Playwright browsers are not installed. Run "uv run playwright install {browser}" '
            f'or pick a browserless crawler with --crawler beautifulsoup.'
        )


class RunAbortedError(CrawleeLabError):
    """The run finished below the configured success threshold."""
