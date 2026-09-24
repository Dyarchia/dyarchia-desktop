import inspect
from collections.abc import Callable, Iterable
from typing import Any


class PluginContext:
    def __init__(
        self,
        plugin_id: str,
        publish: Callable[[str, list[Any]], None],
        notice: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self.plugin_id = plugin_id
        self._publish = publish
        self._notice = notice
        self._handlers: dict[str, Callable[..., Any]] = {}

    def handle(self, channel: str, handler: Callable[..., Any]) -> None:
        self._handlers[channel] = handler

    def broadcast(self, channel: str, *args: Any) -> None:
        self._publish(channel, list(args))

    def notify(self, title: str, body: str = "", action: Any = None) -> None:
        """Tell the person, not the panel: the shell's notice, and the system's when the window
        is not in front. The same contract a Node main module has in `ctx.notify`, for the
        thing that finishes while nobody is watching -- a crawl, a build, a long probe."""
        if self._notice is not None:
            self._notice({"title": title, "body": body, "action": action})

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
