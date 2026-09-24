"""The retry line: a reason found down the exception chain, said once."""

from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from dyarchia_crawlee.crawlers.retries import CRAWLEE_PREFIX, install, reason


def _raised(outer: BaseException, inner: BaseException) -> BaseException:
    try:
        try:
            raise inner
        except BaseException as caught:
            raise outer from caught
    except BaseException as error:
        return error


def test_a_silent_error_takes_its_cause_s_words() -> None:
    error = _raised(httpx.ReadError(''), OSError(64, 'the network name is no longer available'))
    assert reason(error) == '[Errno 64] the network name is no longer available'


def test_a_silent_chain_is_named_by_what_it_is() -> None:
    error = _raised(httpx.ReadError(''), ConnectionResetError())
    assert reason(error) == 'the connection closed mid-response'


def test_an_unknown_silent_error_is_named_by_its_type() -> None:
    class OddError(Exception):
        pass

    assert reason(OddError()) == 'OddError'


def test_the_outer_message_wins_when_there_is_one() -> None:
    error = _raised(RuntimeError('status 503'), ConnectionResetError('reset'))
    assert reason(error) == 'status 503'


class _Crawler:
    def __init__(self, log: logging.Logger) -> None:
        self.log = log
        self.handler: Any = None

    def error_handler(self, handler: Any) -> Any:
        self.handler = handler
        return handler


def test_the_crawlee_line_is_replaced_by_one_that_says_the_attempt(
    caplog: pytest.LogCaptureFixture,
) -> None:
    log = logging.getLogger('dyarchia-test-retries')
    crawler = _Crawler(log)
    install(crawler, 3)
    install(crawler, 3)
    assert len(log.filters) == 1

    with caplog.at_level(logging.WARNING, logger=log.name):
        log.warning(f'{CRAWLEE_PREFIX}https://example.com/a due to: . traceback')
        context = SimpleNamespace(request=SimpleNamespace(retry_count=1, url='https://example.com/a'))
        asyncio.run(crawler.handler(context, _raised(httpx.ReadError(''), ConnectionResetError())))

    assert [record.getMessage() for record in caplog.records] == [
        'retry 1 of 3 · the connection closed mid-response · https://example.com/a'
    ]
