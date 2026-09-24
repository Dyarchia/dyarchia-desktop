import json
import sys
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .context import PluginContext
from .loader import load_plugin

MAX_WORKERS = 8


class StdioHost:
    def __init__(self, plugin_dir: Path) -> None:
        self._channel = sys.stdout
        sys.stdout = sys.stderr
        self._write_lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self.plugin_id, self.context = load_plugin(plugin_dir, self._broadcast, self._notice)

    def _send(self, payload: dict[str, Any]) -> None:
        line = json.dumps(payload, default=str)
        with self._write_lock:
            try:
                self._channel.write(line + "\n")
                self._channel.flush()
            except (BrokenPipeError, ValueError):
                pass

    def _broadcast(self, channel: str, args: list[Any]) -> None:
        self._send({"t": "broadcast", "channel": channel, "args": args})

    def _notice(self, notice: dict[str, Any]) -> None:
        self._send({"t": "notice", "notice": notice})

    def _run_invoke(self, message_id: Any, channel: str, args: list[Any]) -> None:
        try:
            result = self.context.dispatch(channel, args)
        except LookupError as error:
            self._send({"t": "error", "id": message_id, "error": str(error)})
        except Exception as error:
            traceback.print_exc()
            self._send(
                {"t": "error", "id": message_id, "error": f"{type(error).__name__}: {error}"}
            )
        else:
            self._send({"t": "result", "id": message_id, "result": result})

    def run(self) -> None:
        self._send({"t": "ready", "plugin": self.plugin_id, "channels": sorted(self.context.channels)})
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if message.get("t") != "invoke":
                continue
            self._pool.submit(
                self._run_invoke,
                message.get("id"),
                message.get("channel", ""),
                message.get("args", []),
            )
        self._pool.shutdown(wait=False, cancel_futures=True)


def serve(plugin_dir: Path) -> None:
    StdioHost(plugin_dir).run()
