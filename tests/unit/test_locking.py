"""One round over a corpus at a time, and what happens when a round is killed."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import pytest

from euripontida_crawlee.config import Settings
from euripontida_crawlee.locking import RoundInProgressError, hold, holder

CHILD = """
import sys, time
sys.path.insert(0, {src!r})
from euripontida_crawlee.config import Settings
from euripontida_crawlee.locking import hold

settings = Settings(output_dir={output!r})
with hold({key!r}, 'the child', settings):
    open({flag!r}, 'w').close()
    time.sleep(60)
"""


def source_root() -> str:
    return str(Path(__file__).resolve().parents[2] / 'src')


def start_holder(tmp_path: Path, key: str) -> tuple[subprocess.Popen[bytes], Path]:
    """Run a second process that takes the lock and then waits, and wait until it has it."""
    flag = tmp_path / f'{key}.taken'
    script = CHILD.format(src=source_root(), output=str(tmp_path), key=key, flag=str(flag))
    child = subprocess.Popen([sys.executable, '-c', script])
    deadline = time.monotonic() + 30
    while not flag.exists() and time.monotonic() < deadline:
        if child.poll() is not None:
            raise AssertionError(f'the child exited early with {child.returncode}')
        time.sleep(0.05)
    assert flag.exists(), 'the child never took the lock'
    return child, flag


def test_a_round_takes_the_lock_and_gives_it_back(tmp_path: Path) -> None:
    settings = Settings(output_dir=tmp_path)

    with hold('docs-labs', 'first', settings):
        pass
    with hold('docs-labs', 'second', settings):
        pass


def test_a_second_round_is_refused_and_told_who_has_it(tmp_path: Path) -> None:
    """The scheduled task, a button and a person at a prompt can all fire at once."""
    settings = Settings(output_dir=tmp_path)
    child, _ = start_holder(tmp_path, 'docs-labs')
    try:
        with (
            pytest.raises(RoundInProgressError, match='already running'),
            hold('docs-labs', 'mine', settings),
        ):
            pass

        who = holder('docs-labs', settings)
        assert who.description == 'the child'
        assert who.pid is not None
        # Not compared against child.pid: the venv's python.exe on Windows is a redirector, so
        # Popen reports the launcher and the interpreter that holds the lock is a different process.
    finally:
        child.kill()
        child.wait(timeout=30)


def test_a_killed_round_does_not_hold_the_lock_for_ever(tmp_path: Path) -> None:
    """The reason this is an operating system lock and not a witness file.

    A run the scheduler kills leaves no chance to clean up. A witness file would survive it and
    block every round after, which is the shape of a mistake this project has already paid for.
    """
    settings = Settings(output_dir=tmp_path)
    child, _ = start_holder(tmp_path, 'docs-labs')
    child.kill()
    child.wait(timeout=30)

    # Waited for rather than asserted outright: the kernel releases the lock when it closes the
    # dead process's handles, which is prompt but not instantaneous. Measured at 56 ms here.
    deadline = time.monotonic() + 30
    while True:
        try:
            with hold('docs-labs', 'after the funeral', settings):
                return
        except RoundInProgressError:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.05)


def test_two_groups_do_not_block_each_other(tmp_path: Path) -> None:
    """Separate corpora are separate rounds; only the same one contends."""
    settings = Settings(output_dir=tmp_path)
    child, _ = start_holder(tmp_path, 'docs-labs')
    try:
        with hold('salesforce-ai', 'a different corpus', settings):
            pass
    finally:
        child.kill()
        child.wait(timeout=30)


def test_the_label_is_gone_once_the_round_ends(tmp_path: Path) -> None:
    settings = Settings(output_dir=tmp_path)

    with hold('docs-labs', 'running', settings):
        assert holder('docs-labs', settings).description == 'running'

    assert holder('docs-labs', settings).pid is None
