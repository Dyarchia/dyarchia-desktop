import platform
import sys
import threading
import time

TICK_SECONDS = 5


def activate(ctx):
    def info():
        return {
            "python": sys.version.split()[0],
            "implementation": platform.python_implementation(),
            "platform": platform.platform(),
            "executable": sys.executable,
            "pluginId": ctx.plugin_id,
        }

    def echo(message):
        return f"{message} -> handled by python {sys.version.split()[0]}"

    ctx.handle("info", info)
    ctx.handle("echo", echo)

    def ticker():
        count = 0
        while True:
            time.sleep(TICK_SECONDS)
            count += 1
            ctx.broadcast("tick", count)

    threading.Thread(target=ticker, daemon=True).start()
