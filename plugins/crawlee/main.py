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
import time
from pathlib import Path
from typing import Any

CONSOLE_WIDTH = '110'

"""The opening of the sentence `_interpreter` raises with when there is no environment yet.

It is a name rather than a literal in two places because `state` answers with a state instead of
raising when it sees it, and a condition recognised by matching prose is a condition that breaks
the day somebody rewords the prose.
"""
NO_ENVIRONMENT = 'no virtual environment'

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
    raise RuntimeError(f'{NO_ENVIRONMENT} in {looked}: install this plugin from Setup')


def _installed_paths(root: Path) -> dict[str, str]:
    """Where an installed copy keeps the corpus, and nothing at all in a checkout.

    Every path the toolkit reads defaults to a relative one, resolved against the directory its
    `pyproject.toml` sits in. In a checkout that is the repository and it is the right answer. In
    an installation it is a directory inside the application, which the user did not choose, cannot
    find and may not write to — and under the portable build this plugin shipped with until now, it
    was a folder in %TEMP% that Windows deleted between launches, taking the corpus with it.

    So an installed copy is told where to write instead. The shell names one directory,
    DYARCHIA_DATA_HOME, inside `~/.dyarchia`; the corpus repositories go there, one per
    subdirectory, and a command that names none falls back to the first of them. Derived data does
    not: the index is rebuilt from the snapshots and the crawler's working directory is purged on
    every run, so both live beside the application's own state rather than in the user's folders.

    A checkout is left alone, and is recognised by the `.env` beside its `pyproject.toml` — the
    file whose whole purpose is to say where that machine keeps its corpora. Overriding it from
    here would answer a question the developer has already answered, and an environment variable
    wins over `.env` in the settings the toolkit loads, so it would win silently.
    """
    home = os.environ.get('DYARCHIA_DATA_HOME')
    if not home or (root / '.env').is_file():
        return {}

    """A value the environment already carries is a choice somebody made, and it is kept.

    Everything below is a default, which is what an installation owes a machine that has said
    nothing. It is not an instruction. Somebody who keeps their corpora somewhere else says so
    once, in their own environment, and every installation after this one finds them there:

        setx DYARCHIA_CRAWLEE_REPOSITORIES_DIR "D:/wherever/crawlee-data"

    The repositories directory is the root the rest hang off, so setting only that one moves the
    corpora, the profiles and the output together and leaves the derived data where it belongs.
    """
    derived = Path(os.environ.get('DYARCHIA_USER_DATA', home)) / 'crawlee'
    settings = {
        name: value
        for name, value in (
            ('DYARCHIA_CRAWLEE_INDEX_DIR', str(derived / 'index')),
            ('DYARCHIA_CRAWLEE_STORAGE_DIR', str(derived / 'storage')),
        )
        if not os.environ.get(name)
    }

    """The corpora this installation reads, and the three directories inside the one a command
    falls back to when it names no repository.

    Naming the repositories directory answers where the corpora are. It does not answer which of
    them an ad-hoc crawl writes to, and that question has a default the installation must not
    accept: a relative path resolved against the toolkit's own directory, which in an installation
    is inside the application. A machine that had set only that one variable therefore reported no
    corpora at all, from a panel whose repositories directory was right — the fallback pointed at
    `resources/plugins/crawlee`, and every corpus on the disk was invisible beside it.

    So the fallback is named here whatever the repositories directory is, and only the variables
    the environment does not already carry are set.
    """
    named = os.environ.get('DYARCHIA_CRAWLEE_REPOSITORIES_DIR')
    corpora = Path(named) if named else Path(home) / 'crawlee'
    if not named:
        settings['DYARCHIA_CRAWLEE_REPOSITORIES_DIR'] = str(corpora)

    default = _fallback_repository(corpora)
    for name, directory in (
        ('DYARCHIA_CRAWLEE_DATA_DIR', default / 'data'),
        ('DYARCHIA_CRAWLEE_PROFILES_DIR', default / 'profiles'),
        ('DYARCHIA_CRAWLEE_OUTPUT_DIR', default / 'output'),
    ):
        if not os.environ.get(name):
            directory.mkdir(parents=True, exist_ok=True)
            settings[name] = str(directory)

    return settings


def _fallback_repository(corpora: Path) -> Path:
    """The repository a command falls back to: the first one already there, or a new `local`.

    `local` is what a machine holding no corpus gets, and it stops being the right answer the
    moment one is cloned. An empty repository that keeps the default takes the digest of every
    round with it — the document describing thirteen targets in two corpora lands in the one
    directory that holds none of them — so an existing repository wins over a new one.

    The marker is the toolkit's own: a directory holding `profiles/` is a corpus repository. The
    first in sorted order is chosen, which is a stable answer rather than one that moves the day
    another corpus is cloned beside it.
    """
    try:
        existing = sorted(child for child in corpora.iterdir() if (child / 'profiles').is_dir())
    except OSError:
        existing = []

    return existing[0] if existing else corpora / 'local'


def _source_path(root: Path) -> str:
    """The toolkit's own source, ahead of whatever copy of it the environment holds.

    An installed environment is built once, by Setup, with the package copied into it rather than
    linked, and an application update replaces the plugin's files without touching it. A build
    that changed the CLI therefore kept running the one Setup had copied: 0.2.9 shipped round
    progress, and a machine that had built its environment on an earlier release ran a CLI that
    never printed any, so the panel said `0 of …` for the whole round. The environment is kept for
    the dependencies, which a lockfile pins; the code that runs is the code that shipped with this
    build.
    """
    entries = [str(root / 'src')]
    if os.environ.get('PYTHONPATH'):
        entries.append(os.environ['PYTHONPATH'])
    return os.pathsep.join(entries)


def _spawn(args: list[str], **extra: Any) -> subprocess.Popen[str]:
    """Run the CLI under the toolkit's own interpreter, with no console window of its own."""
    root = _toolkit_root()
    environment = dict(os.environ)
    environment.update(
        PYTHONIOENCODING='utf-8',
        PYTHONUNBUFFERED='1',
        PYTHONPATH=_source_path(root),
        COLUMNS=CONSOLE_WIDTH,
        DYARCHIA_PROGRESS='1',
    )
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
        'env': {'PYTHONIOENCODING': 'utf-8', 'PYTHONUNBUFFERED': '1', 'PYTHONPATH': str(root / 'src')},
        'tools': [{'name': 'search_corpus', 'note': OFFER_NOTE}],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(offer, indent=4) + '\n', encoding='utf-8')


CATALOG = Path(__file__).resolve().parent / 'catalog'


def _heading(path: Path) -> dict[str, str]:
    """The name and the description a profile opens with, read without a YAML parser.

    This process runs under the shell's interpreter, which has the standard library and nothing
    else, and the two keys it needs are plain scalars on the first lines of every file in the
    catalogue. Anything richer is the CLI's business once the profile is installed.
    """
    found: dict[str, str] = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        key, _, value = line.partition(':')
        if key in ('name', 'description') and value.strip():
            found[key] = value.strip()
        if len(found) == 2:
            break
    return {'name': found.get('name', path.stem), 'description': found.get('description', '')}


def _catalog(installed: dict[str, str]) -> list[dict[str, Any]]:
    """Every group the plugin ships profiles for, and which of them this machine already has."""
    if not CATALOG.is_dir():
        return []
    groups = []
    for folder in sorted(child for child in CATALOG.iterdir() if child.is_dir()):
        profiles = []
        for path in sorted(folder.glob('*.yaml')):
            heading = _heading(path)
            profiles.append({**heading, 'installed': heading['name'] in installed})
        if profiles:
            groups.append({'group': folder.name, 'profiles': profiles})
    return groups


def _install(group: str, installed: dict[str, str], folder: str) -> dict[str, Any]:
    """Copy the profiles of one group that this machine does not have yet.

    They go where that group already lives, so a group is never split across two repositories; a
    group nobody has installed gets a repository of its own, named after it, under the directory
    every corpus repository sits in. A profile that is already here is left exactly as it is,
    because it may have been edited since, and an install that overwrote it would lose the edit.
    """
    source = (CATALOG / group).resolve()
    if not source.is_dir() or source.parent != CATALOG:
        raise RuntimeError(f'no group called {group!r} in the catalogue')

    names = [_heading(path)['name'] for path in source.glob('*.yaml')]
    homes = {installed[name] for name in names if name in installed}
    repository = Path(sorted(homes)[0]) if homes else Path(folder) / group
    target = repository / 'profiles'
    target.mkdir(parents=True, exist_ok=True)

    copied = []
    for path in sorted(source.glob('*.yaml')):
        name = _heading(path)['name']
        if name in installed or (target / path.name).exists():
            continue
        (target / path.name).write_bytes(path.read_bytes())
        copied.append(name)
    return {'group': group, 'repository': str(repository), 'installed': copied}


def activate(ctx: Any) -> None:
    def state() -> Any:
        """The corpus, or the reason there is nothing to read yet.

        A missing environment is not a failure of this call: it is what every installation looks
        like before Setup has built one, and `state` is the first thing the panel asks for when it
        opens. Raising here put an interpreter path and an exception class on screen to say a
        sentence the panel can say itself, so it answers with a state instead. Every other channel
        still raises, because asking to crawl without a crawler is a real error.
        """
        try:
            return json.loads(_read(['state', '--json']))
        except RuntimeError as thrown:
            if NO_ENVIRONMENT not in str(thrown):
                raise
            return {'needsEnvironment': True}

    def profiles() -> Any:
        """The targets, or the same state `state` answers with. Both are read when a tab opens."""
        try:
            return json.loads(_read(['profiles', '--json']))
        except RuntimeError as thrown:
            if NO_ENVIRONMENT not in str(thrown):
                raise
            return {'needsEnvironment': True}

    def show(name: str) -> str:
        return _read(['profile', 'show', name])

    def save(name: str, text: str) -> str:
        return _read(['profile', 'save', name], stdin=text).strip()

    def delete(name: str, data: bool) -> str:
        """Remove a target. With `data`, everything it put on disk goes with it."""
        return _read(['profile', 'delete', name, *(['--data'] if data else [])]).strip()

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

    def installed() -> dict[str, str]:
        """Each profile this machine has, by name, and the repository it lives in."""
        return {entry['name']: entry['repository'] for entry in json.loads(_read(['profiles', '--json']))}

    def catalog() -> Any:
        """The profiles this plugin ships, grouped, each marked with whether it is already here."""
        try:
            return _catalog(installed())
        except RuntimeError as thrown:
            if NO_ENVIRONMENT not in str(thrown):
                raise
            return {'needsEnvironment': True}

    def install(group: str) -> Any:
        folder = json.loads(_read(['state', '--json']))['folder']
        return _install(group, installed(), folder)

    ctx.handle('state', state)
    ctx.handle('profiles', profiles)
    ctx.handle('show', show)
    ctx.handle('save', save)
    ctx.handle('delete', delete)
    ctx.handle('search', search)
    ctx.handle('start', start)
    ctx.handle('stop', stop)
    ctx.handle('catalog', catalog)
    ctx.handle('install', install)
    threading.Thread(target=_publish, daemon=True).start()


def _follow(ctx: Any, kind: str, process: subprocess.Popen[str]) -> None:
    """Stream one process to the panel and report how it ended.

    Streamed rather than collected, because the interesting round is the one that never reaches the
    end: a crawl the operator stops after twenty minutes should still have said what it found.
    """
    assert process.stdout is not None
    started = time.monotonic()
    tally = {'total': 0, 'done': 0, 'changed': 0, 'failed': 0}
    for line in process.stdout:
        line = line.rstrip('\n')
        if line.startswith(PROGRESS_PREFIX):
            try:
                event = json.loads(line[len(PROGRESS_PREFIX):])
            except json.JSONDecodeError:
                ctx.broadcast('line', line)
                continue
            _count(tally, event)
            ctx.broadcast('progress', event)
            continue
        ctx.broadcast('line', line)
    code = process.wait()
    minutes = round((time.monotonic() - started) / 60)

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
            'minutes': minutes,
            **tally,
        },
    )
    if kind == 'run' and code != 30:
        ctx.notify(_finished_title(code, tally), _finished_body(tally, minutes))


PROGRESS_PREFIX = '::progress:: '


def _count(tally: dict[str, int], event: dict[str, Any]) -> None:
    if event.get('event') == 'round':
        tally['total'] = int(event.get('total') or 0)
    elif event.get('event') == 'finished':
        tally['done'] += 1
        if event.get('error'):
            tally['failed'] += 1
        elif event.get('changed'):
            tally['changed'] += 1


def _finished_title(code: int, tally: dict[str, int]) -> str:
    """What a round comes to, in the words a person needs when it finishes out of sight."""
    if tally['failed']:
        return 'Round finished with failures'
    if tally['done'] < tally['total']:
        return 'Round stopped'
    if code == 1:
        return 'Round finished with failures'
    return 'Round finished'


def _finished_body(tally: dict[str, int], minutes: int) -> str:
    parts = [f"{tally['done']} of {tally['total']} targets"]
    parts.append(f"{tally['changed']} changed")
    if tally['failed']:
        parts.append(f"{tally['failed']} failed")
    parts.append(f'{minutes} min' if minutes else 'under a minute')
    return ', '.join(parts)


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
