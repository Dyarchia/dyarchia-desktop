"""The panel's side of dyarchia-crawlee, for Dyarchia Desktop.

The shell runs this under its own interpreter, which is not the toolkit's virtual environment, so
nothing here imports the package. Every answer comes from the CLI instead, which is the surface the
test suite covers: the panel is one more caller, and its button obeys the same lock a prompt does.

Two kinds of channel, because the shell gives an invoke sixty seconds and a crawl takes tens of
minutes. The ones that read something answer in place. The ones that do something start a process,
stream it to the panel a line at a time, and say how it ended on a broadcast.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from pathlib import Path
from typing import Any

CONSOLE_WIDTH = '110'

VERDICTS = {
    0: 'nothing changed',
    1: 'a target failed, so the round cannot vouch for itself',
    10: 'something changed',
    30: 'another round already holds this group',
}

_running: subprocess.Popen[str] | None = None
_lock = threading.Lock()


def _toolkit_root() -> Path:
    """Where the toolkit is checked out.

    The plugin sits at the top of that checkout, so the first walk up finds it. Nothing is
    guessed: a plugin that cannot find its toolkit says so.
    """
    here = Path(__file__).resolve().parent
    for candidate in (here, *here.parents):
        if (candidate / 'pyproject.toml').is_file():
            return candidate
    raise RuntimeError(f'no toolkit around {here}')


def _interpreter(root: Path) -> Path:
    """The toolkit's own interpreter, which is the only one that has the package installed."""
    for relative in ('.venv/Scripts/python.exe', '.venv/bin/python'):
        candidate = root / relative
        if candidate.is_file():
            return candidate
    raise RuntimeError(f'no virtual environment in {root}: run "uv sync --dev" there first')


def _spawn(args: list[str], **extra: Any) -> subprocess.Popen[str]:
    """Run the CLI under the toolkit's own interpreter, with no console window of its own."""
    root = _toolkit_root()
    environment = dict(os.environ)
    environment.update(PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1', COLUMNS=CONSOLE_WIDTH)
    return subprocess.Popen(
        [str(_interpreter(root)), '-m', 'dyarchia_crawlee', *args],
        cwd=root,
        text=True,
        encoding='utf-8',
        errors='replace',
        env=environment,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        **extra,
    )


def _read(args: list[str], stdin: str | None = None) -> str:
    """Run a command that answers quickly and hand back its stdout, or raise what it complained."""
    process = _spawn(
        args,
        stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    out, err = process.communicate(stdin)
    if process.returncode != 0:
        raise RuntimeError((err or out or f'exited with {process.returncode}').strip())
    return out


def _output_directory() -> Path | None:
    """Where the digest of a changed round goes.

    A round can span every corpus repository this machine holds, and the digest describes the round
    rather than any one of them, so it lands in the default repository: the one the settings name,
    which is where anything belonging to no particular corpus already goes. Picking whichever
    repository sorted first would move the file the day somebody clones another one.
    """
    repositories = json.loads(_read(['state', '--json'])).get('repositories', [])
    chosen = next((entry for entry in repositories if entry.get('default')), None) or next(
        iter(repositories), None
    )
    return Path(chosen['output']) if chosen else None


def activate(ctx: Any) -> None:
    def state() -> Any:
        return json.loads(_read(['state', '--json']))

    def profiles() -> Any:
        return json.loads(_read(['profiles', '--json']))

    def show(name: str) -> str:
        return _read(['profile', 'show', name])

    def save(name: str, text: str) -> str:
        return _read(['profile', 'save', name], stdin=text).strip()

    def start(kind: str, payload: dict[str, Any]) -> str:
        """Begin a round or a probe. The panel hears the rest on `line` and `done`."""
        global _running

        if kind == 'run':
            args = ['watch']
            if payload.get('names'):
                args += list(payload['names'])
            elif payload.get('group'):
                args += ['--group', payload['group']]
            if payload.get('commit'):
                args.append('--commit')
        elif kind == 'inspect':
            args = ['inspect', payload['url']]
        else:
            raise RuntimeError(f'unknown job {kind!r}')

        with _lock:
            if _running is not None and _running.poll() is None:
                raise RuntimeError('something is already running in this panel')
            process = _spawn(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            _running = process

        threading.Thread(target=_follow, args=(ctx, kind, process), daemon=True).start()
        return ' '.join(args)

    def stop() -> bool:
        """Kill whatever is running. A crawl killed mid-flight leaves nothing behind to clean up."""
        with _lock:
            if _running is None or _running.poll() is not None:
                return False
            _running.terminate()
            return True

    ctx.handle('state', state)
    ctx.handle('profiles', profiles)
    ctx.handle('show', show)
    ctx.handle('save', save)
    ctx.handle('start', start)
    ctx.handle('stop', stop)


def _follow(ctx: Any, kind: str, process: subprocess.Popen[str]) -> None:
    """Stream one process to the panel and report how it ended.

    Streamed rather than collected, because the interesting round is the one that never reaches the
    end: a crawl the operator stops after twenty minutes should still have said what it found.
    """
    assert process.stdout is not None
    for line in process.stdout:
        ctx.broadcast('line', line.rstrip('\n'))
    code = process.wait()

    digest = None
    if kind == 'run' and code == 10:
        digest = _write_digest(ctx)

    ctx.broadcast(
        'done',
        {
            'kind': kind,
            'code': code,
            'verdict': VERDICTS.get(code, f'exited with {code}'),
            'digest': digest,
        },
    )


def _write_digest(ctx: Any) -> str | None:
    """Bundle what the round just found, while the change reports it reads are still its own.

    The next round overwrites them, so this belongs in the same sitting rather than on a button of
    its own. What the digest is for is somebody else's decision: this writes the file and stops.
    """
    try:
        directory = _output_directory()
        if directory is None:
            return None
        target = directory / 'digest.md'
        ctx.broadcast('line', '')
        for line in _read(['digest', '--changed', '--out', str(target)]).splitlines():
            ctx.broadcast('line', line)
        return str(target)
    except Exception as error:
        """Every failure, deliberately. A digest that fails does not take the round's verdict with
        it: the round is what the operator asked for, it already happened, and the panel has to
        say so."""
        ctx.broadcast('line', f'the digest could not be written: {error}')
        return None
