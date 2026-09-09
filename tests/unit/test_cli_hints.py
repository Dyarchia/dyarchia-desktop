"""The advice the CLI prints, which has to work from where the user is standing."""

from __future__ import annotations

import subprocess
from pathlib import Path

from euripontida_crawlee.cli import history_hint


def repository(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'init', '-q'], cwd=path, check=True, capture_output=True)
    return path


def test_the_history_hint_enters_the_repository_that_owns_the_corpus(tmp_path: Path) -> None:
    """`git log -- <absolute path>` is refused for naming a path outside the current repository.

    The corpora live in their own repository, so the advice printed from the tool's checkout has to
    enter theirs and address the corpus from inside it.
    """
    root = repository(tmp_path.resolve() / 'corpus-repo')
    corpus = root / 'data' / 'group' / 'lab'
    corpus.mkdir(parents=True)

    hint = history_hint(corpus)

    assert hint == f'full history: git -C {root} log -- data/group/lab'


def test_the_history_hint_says_so_when_there_is_no_history(tmp_path: Path) -> None:
    loose = tmp_path.resolve() / 'loose'
    loose.mkdir()

    hint = history_hint(loose)

    assert hint == 'no git history: this corpus is not inside a repository' or hint.startswith(
        'full history: git -C '
    )
