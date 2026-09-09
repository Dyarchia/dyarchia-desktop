"""Pre-navigation hooks for the browser-backed crawlers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from playwright.async_api import Route

from euripontida_crawlee.crawlers.context import safe_page

RESOURCE_ALIASES = {
    'image': 'image',
    'images': 'image',
    'media': 'media',
    'font': 'font',
    'fonts': 'font',
    'stylesheet': 'stylesheet',
    'css': 'stylesheet',
    'script': 'script',
    'js': 'script',
}


def normalise_resource_types(names: list[str]) -> set[str]:
    """Map friendly names onto the resource types Playwright reports."""
    return {
        RESOURCE_ALIASES.get(name.strip().lower(), name.strip().lower()) for name in names if name.strip()
    }


def make_resource_blocker(names: list[str]) -> Callable[[Any], Awaitable[None]]:
    """Build a pre-navigation hook that aborts requests for the given resource types.

    Blocking images, media and fonts is the cheapest way to make browser crawling faster without
    changing what the extracted text looks like.
    """
    blocked = normalise_resource_types(names)

    async def hook(context: Any) -> None:
        if not blocked:
            return

        page = safe_page(context)
        if page is None:
            return

        async def route_handler(route: Route) -> None:
            if route.request.resource_type in blocked:
                await route.abort()
            else:
                await route.continue_()

        await page.route('**/*', route_handler)

    return hook
