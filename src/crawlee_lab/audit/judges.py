"""Putting the questions to the models, and knowing what that will cost before it is spent.

Everything here goes through the Message Batches API. The audit is not interactive, nobody is
waiting on any single answer, and a batch is half the price of the same requests sent one at a
time. The only thing lost is latency, which this task does not have.

Cost is projected before anything is submitted and reported after. A projection that is never
checked against the invoice is a guess wearing a number, so `estimate` measures the real token
count through the API's own counter whenever a key is present, and falls back to a ratio only when
running without one.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any

from crawlee_lab.errors import CrawleeLabError

BATCH_DISCOUNT = 0.5
POLL_SECONDS = 20
MAX_BATCH_REQUESTS = 100_000

CHARS_PER_TOKEN = 4.0
"""Fallback only, used when no key is available to measure with. Documentation markdown is dense
with punctuation and code, which tokenises worse than prose, so this is a floor rather than a
guess to rely on: `estimate` replaces it with a measured ratio whenever it can."""

PRICES: dict[str, tuple[float, float]] = {
    'claude-haiku-4-5': (1.00, 5.00),
    'claude-sonnet-5': (3.00, 15.00),
    'claude-opus-5': (5.00, 25.00),
}
"""List price per million tokens, input then output. Sonnet 5's introductory rate is lower and
ends on 2026-08-31; projecting at the standard rate keeps the estimate from flattering itself."""


@dataclass(slots=True)
class Request:
    """One question for one model, carrying the identity of what it is about."""

    custom_id: str
    model: str
    system: str
    prompt: str
    schema: dict[str, Any]
    max_tokens: int = 4096


@dataclass(slots=True)
class Projection:
    """What a set of requests is expected to cost, before any of it is submitted."""

    requests: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    usd: float = 0.0
    measured: bool = False
    by_model: dict[str, int] = field(default_factory=dict)

    def add(self, other: Projection) -> Projection:
        return Projection(
            requests=self.requests + other.requests,
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            usd=self.usd + other.usd,
            measured=self.measured and other.measured,
            by_model={
                model: self.by_model.get(model, 0) + other.by_model.get(model, 0)
                for model in {*self.by_model, *other.by_model}
            },
        )


def price(model: str, input_tokens: int, output_tokens: int, batched: bool = True) -> float:
    """What a model charges for a given number of tokens, in dollars."""
    if model not in PRICES:
        raise CrawleeLabError(f'no published price for {model!r}, so its cost cannot be projected')
    per_input, per_output = PRICES[model]
    total = (input_tokens * per_input + output_tokens * per_output) / 1_000_000
    return total * BATCH_DISCOUNT if batched else total


def _rough_tokens(text: str) -> int:
    return max(1, round(len(text) / CHARS_PER_TOKEN))


def estimate(requests: list[Request], client: Any | None = None) -> Projection:
    """Project the cost of a set of requests, measuring the token counts when that is possible.

    Only a sample is measured. Counting every request exactly would mean an API round trip per
    request before making an API round trip per request, and the sampled ratio is applied to the
    rest, which is accurate enough to decide whether to spend and is reported as such.
    """
    if not requests:
        return Projection(measured=True)

    ratio = CHARS_PER_TOKEN
    measured = False
    if client is not None:
        ratio = _calibrate(requests, client) or CHARS_PER_TOKEN
        measured = ratio != CHARS_PER_TOKEN

    projection = Projection(measured=measured)
    for request in requests:
        characters = len(request.system) + len(request.prompt)
        inputs = max(1, round(characters / ratio))
        outputs = _expected_output(request)
        projection = projection.add(
            Projection(
                requests=1,
                input_tokens=inputs,
                output_tokens=outputs,
                usd=price(request.model, inputs, outputs),
                measured=measured,
                by_model={request.model: 1},
            )
        )
    return projection


def _expected_output(request: Request) -> int:
    """How much a structured verdict costs to write back.

    The schema fixes the shape, so the answer is a known number of short fields per item rather
    than an open-ended response, and the item count is what the prompt already carries.
    """
    items = max(1, request.prompt.count('<page id=') + request.prompt.count('<section id='))
    return min(request.max_tokens, items * 60 + 40)


def _calibrate(requests: list[Request], client: Any, samples: int = 8) -> float | None:
    """Measure characters per token on real requests, so the projection is not a folk constant."""
    step = max(1, len(requests) // samples)
    chosen = requests[::step][:samples]

    characters = 0
    tokens = 0
    for request in chosen:
        try:
            counted = client.messages.count_tokens(
                model=request.model,
                system=request.system,
                messages=[{'role': 'user', 'content': request.prompt}],
            )
        except Exception:
            return None
        characters += len(request.system) + len(request.prompt)
        tokens += counted.input_tokens

    return characters / tokens if tokens else None


def build_client(api_key: str | None = None) -> Any:
    """The Anthropic client, imported only when the audit is actually going to call a model."""
    try:
        import anthropic
    except ImportError as error:
        raise CrawleeLabError(
            'the audit needs the anthropic package to reach a model. '
            'Install it with "uv sync --group audit", or run "audit --dry-run" to stay local.'
        ) from error

    return anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()


def _payload(request: Request) -> dict[str, Any]:
    body: dict[str, Any] = {
        'model': request.model,
        'max_tokens': request.max_tokens,
        'system': request.system,
        'messages': [{'role': 'user', 'content': request.prompt}],
        'output_config': {'format': {'type': 'json_schema', 'schema': request.schema}},
    }
    if request.model != 'claude-haiku-4-5':
        body['thinking'] = {'type': 'disabled'}
    return body


def submit(client: Any, requests: list[Request]) -> str:
    """Hand a set of requests to the Batches API and return the batch id."""
    if len(requests) > MAX_BATCH_REQUESTS:
        raise CrawleeLabError(f'a batch holds at most {MAX_BATCH_REQUESTS} requests')

    batch = client.messages.batches.create(
        requests=[{'custom_id': request.custom_id, 'params': _payload(request)} for request in requests]
    )
    return str(batch.id)


def wait(client: Any, batch_id: str, on_tick: Callable[[str], None] | None = None) -> None:
    """Block until a batch has finished processing, reporting progress as it goes."""
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == 'ended':
            return
        if on_tick is not None:
            counts = batch.request_counts
            on_tick(f'{counts.succeeded} done, {counts.processing} running, {counts.errored} errored')
        time.sleep(POLL_SECONDS)


@dataclass(slots=True)
class Answer:
    """One model's reply to one request, already parsed, or the reason there is none."""

    custom_id: str
    payload: dict[str, Any] | None = None
    error: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0


def collect(client: Any, batch_id: str) -> Iterator[Answer]:
    """Read a finished batch back, keyed by the identity each request carried into it."""
    for result in client.messages.batches.results(batch_id):
        if result.result.type != 'succeeded':
            yield Answer(custom_id=result.custom_id, error=result.result.type)
            continue

        message = result.result.message
        text = next((block.text for block in message.content if block.type == 'text'), '')
        try:
            payload = json.loads(text)
        except ValueError as error:
            yield Answer(custom_id=result.custom_id, error=f'unparseable answer: {error}')
            continue

        yield Answer(
            custom_id=result.custom_id,
            payload=payload,
            input_tokens=message.usage.input_tokens,
            output_tokens=message.usage.output_tokens,
        )


def spent(answers: Iterable[Answer], model: str) -> float:
    """What a finished batch actually cost, read off the usage the API reported."""
    inputs = sum(answer.input_tokens for answer in answers)
    outputs = sum(answer.output_tokens for answer in answers)
    return price(model, inputs, outputs)
