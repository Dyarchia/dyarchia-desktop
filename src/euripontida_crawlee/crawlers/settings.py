"""Politeness, concurrency and transport settings shared by every crawler."""

from __future__ import annotations

from crawlee import ConcurrencySettings
from crawlee.http_clients import HttpClient, HttpxHttpClient, ImpitHttpClient

from euripontida_crawlee.config import Settings
from euripontida_crawlee.models import RunSpec


def effective_user_agent(spec: RunSpec, settings: Settings) -> str:
    return spec.user_agent or settings.user_agent


def build_concurrency(spec: RunSpec, settings: Settings) -> ConcurrencySettings:
    """Cap parallelism and request rate, favouring the explicit per-run override."""
    max_concurrency = spec.max_concurrency or settings.max_concurrency
    desired = min(settings.desired_concurrency, max_concurrency)
    return ConcurrencySettings(
        min_concurrency=min(settings.min_concurrency, max_concurrency),
        desired_concurrency=desired,
        max_concurrency=max_concurrency,
        max_tasks_per_minute=spec.max_requests_per_minute or settings.max_requests_per_minute,
    )


def build_http_client(spec: RunSpec, settings: Settings) -> HttpClient:
    """Pick a transport: an identifiable polite client by default, an impersonating one on demand.

    Stealth mode exists because some sites reject anything that does not look like a browser. It is
    opt-in so that the default behaviour stays honest about who is knocking.
    """
    if spec.stealth:
        return ImpitHttpClient()
    return HttpxHttpClient(
        header_generator=None,
        headers={'User-Agent': effective_user_agent(spec, settings)},
    )
