"""Exception hierarchy for the toolkit."""

from __future__ import annotations


class DyarchiaCrawleeError(Exception):
    """Base class for every error raised by dyarchia-crawlee."""


class ConfigurationError(DyarchiaCrawleeError):
    """The requested run cannot be described with the given options."""


class ProfileError(DyarchiaCrawleeError):
    """A profile is missing, malformed or contradictory."""


class BrowserNotInstalledError(DyarchiaCrawleeError):
    """A browser-backed crawler was requested but Playwright browsers are missing."""

    def __init__(self, browser: str = 'chromium') -> None:
        super().__init__(
            f'Playwright browsers are not installed. Run "uv run playwright install {browser}" '
            f'or pick a browserless crawler with --crawler beautifulsoup.'
        )


class RunAbortedError(DyarchiaCrawleeError):
    """The run finished below the configured success threshold."""
