"""Quieting the three recurring lines a run cannot act on, and nothing beside them."""

from __future__ import annotations

import logging
from types import SimpleNamespace
from typing import Any, cast

import pytest

from dyarchia_crawlee.logs import AUTOSCALER, EMPTY_LINK, PERIODIC_STATISTICS, apply_log_policy


@pytest.fixture(autouse=True)
def clean_loggers() -> Any:
    """Start from untouched loggers and leave them as they were found.

    The process-wide loggers this policy installs itself on outlive any one test, and the
    integration suite runs the engine, so a test that only restored them afterwards would be asked
    whether the filter it just added was already there.
    """
    loggers = [logging.getLogger('trafilatura.xml'), logging.getLogger(AUTOSCALER)]
    before = [(logger, list(logger.filters), logger.level) for logger in loggers]
    for logger in loggers:
        logger.filters = []
        logger.setLevel(logging.NOTSET)
    yield
    for logger, filters, level in before:
        logger.filters = filters
        logger.setLevel(level)


def crawler_with(logger: logging.Logger) -> Any:
    return cast('Any', SimpleNamespace(log=logger))


def passes(logger: logging.Logger, message: str, level: int = logging.WARNING) -> bool:
    record = logger.makeRecord(logger.name, level, __file__, 1, message, None, None)
    return all(candidate.filter(record) for candidate in logger.filters)


def test_the_empty_link_warning_is_dropped() -> None:
    apply_log_policy(crawler_with(logging.getLogger('test_logs.crawler.a')))
    trafilatura = logging.getLogger('trafilatura.xml')

    assert passes(trafilatura, 'empty link:  {"target": "https://site.example/a"}') is False
    assert passes(trafilatura, 'missing link attribute: text {}') is True


def test_the_periodic_table_goes_and_the_final_one_stays() -> None:
    logger = logging.getLogger('test_logs.crawler.b')
    apply_log_policy(crawler_with(logger))

    assert passes(logger, f'{PERIODIC_STATISTICS}:\n| requests_finished | 96 |', logging.INFO) is False
    assert passes(logger, 'Final request statistics:\n| requests_finished | 96 |', logging.INFO) is True
    assert passes(logger, 'Crawled 33/129 pages, 0 failed requests', logging.INFO) is True


def test_the_autoscaler_keeps_its_warnings_and_loses_its_arithmetic() -> None:
    apply_log_policy(crawler_with(logging.getLogger('test_logs.crawler.c')))
    autoscaler = logging.getLogger(AUTOSCALER)

    assert autoscaler.isEnabledFor(logging.INFO) is False
    assert autoscaler.isEnabledFor(logging.WARNING) is True


def test_a_sweep_does_not_stack_a_filter_per_target() -> None:
    """One crawler is built per target and every one of them asks for the same policy."""
    trafilatura = logging.getLogger('trafilatura.xml')
    before = len(trafilatura.filters)

    for index in range(5):
        apply_log_policy(crawler_with(logging.getLogger(f'test_logs.crawler.sweep{index}')))

    assert len(trafilatura.filters) == before + 1


def test_a_verbose_run_is_left_alone() -> None:
    root = logging.getLogger()
    was = root.level
    root.setLevel(logging.DEBUG)
    try:
        logger = logging.getLogger('test_logs.crawler.verbose')
        apply_log_policy(crawler_with(logger))
        assert logger.filters == []
        assert passes(logging.getLogger('trafilatura.xml'), f'{EMPTY_LINK}: x {{}}') is True
    finally:
        root.setLevel(was)
