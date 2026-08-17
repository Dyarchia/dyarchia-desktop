"""Pricing, batching and reading answers back, without reaching the network."""

from __future__ import annotations

from typing import Any

import pytest

from crawlee_lab.audit import judges
from crawlee_lab.errors import CrawleeLabError


def request(model: str = 'claude-haiku-4-5', pages: int = 5) -> judges.Request:
    blocks = (f'<page id="{n}" url="https://example.com/{n}">body</page>' for n in range(pages))
    prompt = '\n'.join(blocks)
    return judges.Request(
        custom_id=f'page-{model}-0',
        model=model,
        system='rubric' * 100,
        prompt=prompt,
        schema={'type': 'object'},
    )


class FakeMessages:
    """Just enough of the client to answer a token count and hand back a batch."""

    def __init__(self, outer: FakeClient) -> None:
        self.outer = outer
        self.batches = outer

    def count_tokens(self, model: str, system: str, messages: list[dict[str, Any]]) -> Any:
        self.outer.counted += 1
        characters = len(system) + len(messages[0]['content'])
        return type('Counted', (), {'input_tokens': max(1, characters // 3)})()


class FakeClient:
    """A stand-in that records what it was asked to do."""

    def __init__(self, results: list[Any] | None = None) -> None:
        self.counted = 0
        self.submitted: list[dict[str, Any]] = []
        self._results = results or []
        self.messages = FakeMessages(self)

    def create(self, requests: list[dict[str, Any]]) -> Any:
        self.submitted = requests
        return type('Batch', (), {'id': 'batch_test'})()

    def results(self, batch_id: str) -> list[Any]:
        return self._results


def block(text: str) -> Any:
    return type('Block', (), {'type': 'text', 'text': text})()


def succeeded(custom_id: str, payload: str) -> Any:
    usage = type('Usage', (), {'input_tokens': 1000, 'output_tokens': 200})()
    message = type('Message', (), {'content': [block(payload)], 'usage': usage})()
    result = type('Result', (), {'type': 'succeeded', 'message': message})()
    return type('Entry', (), {'custom_id': custom_id, 'result': result})()


def failed(custom_id: str, kind: str = 'errored') -> Any:
    result = type('Result', (), {'type': kind})()
    return type('Entry', (), {'custom_id': custom_id, 'result': result})()


def test_a_batch_is_half_the_price_of_the_same_tokens_sent_singly() -> None:
    assert judges.price('claude-haiku-4-5', 1_000_000, 0) == pytest.approx(0.5)
    assert judges.price('claude-haiku-4-5', 1_000_000, 0, batched=False) == pytest.approx(1.0)


def test_an_unpriced_model_is_refused_rather_than_guessed_at() -> None:
    with pytest.raises(CrawleeLabError, match='no published price'):
        judges.price('some-model-nobody-published', 1000, 100)


def test_nothing_to_do_costs_nothing() -> None:
    projection = judges.estimate([])
    assert projection.usd == 0.0
    assert projection.measured


def test_a_projection_without_a_key_says_it_was_not_measured() -> None:
    projection = judges.estimate([request()])
    assert not projection.measured
    assert projection.requests == 1
    assert projection.usd > 0


def test_a_projection_with_a_key_measures_instead_of_assuming() -> None:
    client = FakeClient()
    projection = judges.estimate([request(), request()], client)

    assert projection.measured
    assert client.counted > 0


def test_the_output_estimate_scales_with_the_pages_in_the_request() -> None:
    one = judges.estimate([request(pages=1)])
    many = judges.estimate([request(pages=10)])
    assert many.output_tokens > one.output_tokens


def test_a_batch_carries_the_identity_of_every_request() -> None:
    client = FakeClient()
    judges.submit(client, [request(), request(model='claude-sonnet-5')])

    assert [entry['custom_id'] for entry in client.submitted] == [
        'page-claude-haiku-4-5-0',
        'page-claude-sonnet-5-0',
    ]


def test_thinking_is_turned_off_where_it_would_only_add_cost() -> None:
    client = FakeClient()
    judges.submit(client, [request(model='claude-sonnet-5')])
    assert client.submitted[0]['params']['thinking'] == {'type': 'disabled'}


def test_the_schema_travels_with_the_request() -> None:
    client = FakeClient()
    judges.submit(client, [request()])
    assert client.submitted[0]['params']['output_config']['format']['type'] == 'json_schema'


def test_answers_come_back_parsed_and_keyed() -> None:
    client = FakeClient([succeeded('page-0', '{"pages": [{"id": "3", "form": "ok"}]}')])
    answers = list(judges.collect(client, 'batch_test'))

    assert answers[0].custom_id == 'page-0'
    assert answers[0].payload == {'pages': [{'id': '3', 'form': 'ok'}]}
    assert answers[0].error is None


def test_a_failed_request_is_reported_rather_than_dropped() -> None:
    client = FakeClient([failed('page-1')])
    answers = list(judges.collect(client, 'batch_test'))

    assert answers[0].payload is None
    assert answers[0].error == 'errored'


def test_an_unparseable_answer_is_not_mistaken_for_a_verdict() -> None:
    client = FakeClient([succeeded('page-2', 'sorry, I cannot help with that')])
    answers = list(judges.collect(client, 'batch_test'))

    assert answers[0].payload is None
    assert 'unparseable' in (answers[0].error or '')


def test_what_was_spent_is_read_off_the_usage_the_api_reported() -> None:
    answers = [
        judges.Answer(custom_id='a', input_tokens=1_000_000, output_tokens=0),
        judges.Answer(custom_id='b', input_tokens=1_000_000, output_tokens=0),
    ]
    assert judges.spent(answers, 'claude-haiku-4-5') == pytest.approx(1.0)


def test_an_oversized_batch_is_refused_before_it_is_sent() -> None:
    with pytest.raises(CrawleeLabError, match='at most'):
        judges.submit(FakeClient(), [request()] * (judges.MAX_BATCH_REQUESTS + 1))


def test_a_missing_sdk_says_what_to_install(monkeypatch: pytest.MonkeyPatch) -> None:
    """The audit is opt-in twice over, so the package it needs is not installed by default and a
    user who reaches a model without it deserves the command rather than a traceback."""
    import builtins

    real_import = builtins.__import__

    def refuse(name: str, *args: Any, **kwargs: Any) -> Any:
        if name == 'anthropic':
            raise ImportError('no anthropic here')
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, '__import__', refuse)
    with pytest.raises(CrawleeLabError, match='uv sync --group audit'):
        judges.build_client('key')
