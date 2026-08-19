import inspect
from collections.abc import Callable, Iterable
from typing import Any


class PluginContext:
    def __init__(self, plugin_id: str, publish: Callable[[str, list[Any]], None]) -> None:
        self.plugin_id = plugin_id
        self._publish = publish
        self._handlers: dict[str, Callable[..., Any]] = {}

    def handle(self, channel: str, handler: Callable[..., Any]) -> None:
        self._handlers[channel] = handler

    def broadcast(self, channel: str, *args: Any) -> None:
        self._publish(channel, list(args))

    @property
    def channels(self) -> Iterable[str]:
        return self._handlers.keys()

    def dispatch(self, channel: str, args: list[Any]) -> Any:
        handler = self._handlers.get(channel)
        if handler is None:
            raise LookupError(f"unknown channel {self.plugin_id}:{channel}")
        result = handler(*args)
        if inspect.isawaitable(result):
            import asyncio

            return asyncio.run(result)
        return result
