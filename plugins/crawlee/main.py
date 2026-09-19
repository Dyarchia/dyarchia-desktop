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

OFFER_SERVER = 'dyarchia-corpus'
OFFER_NOTE = (
    'full-text search over the documentation this machine has snapshotted; it answers with page '
    'URLs and the passage that matched. Use it before guessing how an API or a platform works.'
)


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
    """The toolkit's own interpreter, which is the only one that has the package installed.

    Two places, and the order matters. A checkout keeps its environment beside the code, which is
    what a developer builds with `uv sync --dev` and what the test suite runs under. An installed
    copy cannot: the plugin ships inside the application, in a directory nothing may write to, so
    the shell names an environment directory of its own in `DYARCHIA_PLUGIN_ENV` and the setup
    panel builds the environment there. The local one wins, so a developer working in the checkout
    is never answered by an installation they forgot they had.
    """
    roots = [root]
    provided = os.environ.get('DYARCHIA_PLUGIN_ENV')
    if provided:
        roots.append(Path(provided))

    for candidate_root in roots:
        for relative in ('.venv/Scripts/python.exe', '.venv/bin/python'):
            candidate = candidate_root / relative
            if candidate.is_file():
                return candidate

    looked = ' or '.join(str(candidate) for candidate in roots)
    raise RuntimeError(f'no virtual environment in {looked}: install this plugin from Setup')


def _installed_paths(root: Path) -> dict[str, str]:
    """Where an installed copy keeps the corpus, and nothing at all in a checkout.

    Every path the toolkit reads defaults to a relative one, resolved against the directory its
    `pyproject.toml` sits in. In a checkout that is the repository and it is the right answer. In
    an installation it is a directory inside the application, which the user did not choose, cannot
    find and may not write to — and under the portable build this plugin shipped with until now, it
    was a folder in %TEMP% that Windows deleted between launches, taking the corpus with it.

    So an installed copy is told where to write instead. The shell names one directory,
    DYARCHIA_DATA_HOME, under the user's Documents; the corpus repositories go there, one per
    subdirectory, with `local` as the default one a command falls back to. Derived data does not:
    the index is rebuilt from the snapshots and the crawler's working directory is purged on every
    run, so both live beside the application's own state rather than in the user's folders.

    A checkout is left alone, and is recognised by the `.env` beside its `pyproject.toml` — the
    file whose whole purpose is to say where that machine keeps its corpora. Overriding it from
    here would answer a question the developer has already answered, and an environment variable
    wins over `.env` in the settings the toolkit loads, so it would win silently.
    """
    home = os.environ.get('DYARCHIA_DATA_HOME')
    if not home or (root / '.env').is_file():
        return {}

    corpora = Path(home) / 'crawlee'
    default = corpora / 'local'
    derived = Path(os.environ.get('DYARCHIA_USER_DATA', home)) / 'crawlee'
    for directory in (default / 'profiles', default / 'data', default / 'output'):
        directory.mkdir(parents=True, exist_ok=True)

    return {
        'DYARCHIA_CRAWLEE_REPOSITORIES_DIR': str(corpora),
        'DYARCHIA_CRAWLEE_DATA_DIR': str(default / 'data'),
        'DYARCHIA_CRAWLEE_PROFILES_DIR': str(default / 'profiles'),
        'DYARCHIA_CRAWLEE_OUTPUT_DIR': str(default / 'output'),
        'DYARCHIA_CRAWLEE_INDEX_DIR': str(derived / 'index'),
        'DYARCHIA_CRAWLEE_STORAGE_DIR': str(derived / 'storage'),
    }


def _spawn(args: list[str], **extra: Any) -> subprocess.Popen[str]:
    """Run the CLI under the toolkit's own interpreter, with no console window of its own."""
    root = _toolkit_root()
    environment = dict(os.environ)
    environment.update(PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1', COLUMNS=CONSOLE_WIDTH)
    environment.update(_installed_paths(root))
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


def _offer_path() -> Path | None:
    """Where an offer to other plugins goes, when this host runs under the shell at all."""
    user_data = os.environ.get('DYARCHIA_USER_DATA')
    return Path(user_data) / 'mcp' / 'crawlee.json' if user_data else None


def _publish() -> None:
    """Offer the corpus search to other plugins, or withdraw it.

    The shell reserves <userData>/mcp/ for plugins that can serve a tool over the Model Context
    Protocol: a file there is an offer, and a plugin that launches agents reads the folder without
    knowing who wrote it. The offer stands only while there is something to search, so a fresh
    install with no corpus repository publishes nothing, and a round that leaves one behind
    publishes on its way out.
    """
    path = _offer_path()
    if path is None:
        return
    try:
        state = json.loads(_read(['state', '--json']))
        pages = sum(
            corpus.get('pages', 0)
            for repository in state.get('repositories', [])
            for corpus in repository.get('corpora', [])
        )
    except Exception:
        pages = 0
    if pages <= 0:
        path.unlink(missing_ok=True)
        return
    root = _toolkit_root()
    offer = {
        'plugin': 'crawlee',
        'server': OFFER_SERVER,
        'command': str(_interpreter(root)),
        'args': ['-m', 'dyarchia_crawlee', 'mcp', '--root', str(root)],
        'env': {'PYTHONIOENCODING': 'utf-8', 'PYTHONUNBUFFERED': '1'},
        'tools': [{'name': 'search_corpus', 'note': OFFER_NOTE}],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(offer, indent=4) + '\n', encoding='utf-8')


def activate(ctx: Any) -> None:
    def state() -> Any:
        return json.loads(_read(['state', '--json']))

    def profiles() -> Any:
        return json.loads(_read(['profiles', '--json']))

    def show(name: str) -> str:
        return _read(['profile', 'show', name])

    def save(name: str, text: str) -> str:
        return _read(['profile', 'save', name], stdin=text).strip()

    def search(payload: dict[str, Any]) -> Any:
        """Ask the index. The CLI refreshes it first when a manifest moved since it was built."""
        args = ['search', str(payload['query']), '--json', '--limit', str(int(payload.get('limit') or 20))]
        if payload.get('repository'):
            args += ['--repository', str(payload['repository'])]
        if payload.get('target'):
            args += ['--target', str(payload['target'])]
        return json.loads(_read(args))

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
    ctx.handle('search', search)
    ctx.handle('start', start)
    ctx.handle('stop', stop)
    threading.Thread(target=_publish, daemon=True).start()


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
    if kind == 'run':
        _publish()

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
