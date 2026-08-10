"""The result checker that makes `AdaptivePlaywrightCrawler` actually adapt.

Without a checker the adaptive crawler accepts whatever the cheap static path produced, even when
that is an empty shell waiting for JavaScript. The checker below rejects a static result that
carries no signal, which is what forces a browser render for exactly the pages that need one.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from crawlee._types import RequestHandlerRunResult

from crawlee_lab.models import ExtractionMode, RunSpec

_EMPTY: tuple[Any, ...] = (None, '', [], {})


def _records(payload: Any) -> list[Mapping[str, Any]]:
    if isinstance(payload, Mapping):
        return [payload]
    if isinstance(payload, Sequence):
        return [record for record in payload if isinstance(record, Mapping)]
    return []


def _carries_signal(record: Mapping[str, Any]) -> bool:
    if record.get('content') or record.get('links'):
        return True
    fields = record.get('fields') or {}
    return isinstance(fields, Mapping) and any(value not in _EMPTY for value in fields.values())


def make_result_checker(spec: RunSpec) -> Callable[[RequestHandlerRunResult], bool]:
    """Decide whether the static pass produced enough to skip rendering the page in a browser."""
    expects_content = bool(spec.selectors) or spec.extract is not ExtractionMode.NONE

    def check(result: RequestHandlerRunResult) -> bool:
        records = [record for call in result.push_data_calls for record in _records(call['data'])]
        if not records:
            return False
        if not expects_content:
            return True
        return any(_carries_signal(record) for record in records)

    return check
