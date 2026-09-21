"""What every corpus on this machine is holding, and when it last moved.

`urls` answers that for one target, `diff` for one target's last comparison, `digest` for what a
sweep just found. None of them answers the question a panel opens with: what is here, across every
repository, and is any of it stale or broken.

This module composes that from what already exists rather than reading the corpora again. Nothing
here knows what a front end is; it produces the same answer for a terminal, a plugin or a script,
which is what keeps the front end from reimplementing `directory_for`, the group convention and the
currency rule for itself.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from dyarchia_crawlee import digest, inventory, repositories
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.models import utcnow
from dyarchia_crawlee.versioning.vcs import head, is_dirty, repository_root


@dataclass(slots=True)
class CorpusState:
    """One corpus: what it holds, and what its last sweep made of it."""

    name: str
    group: str | None = None
    description: str | None = None
    directory: Path | None = None
    pages: int = 0
    bytes: int = 0
    failed: int = 0
    generated_at: datetime | None = None
    swept_at: datetime | None = None
    stale: bool = False
    changed: bool = False
    added: int = 0
    removed: int = 0
    modified: int = 0
    reordered: int = 0
    unchanged: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'group': self.group,
            'description': self.description,
            'directory': str(self.directory) if self.directory else None,
            'pages': self.pages,
            'bytes': self.bytes,
            'failed': self.failed,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'swept_at': self.swept_at.isoformat() if self.swept_at else None,
            'stale': self.stale,
            'changed': self.changed,
            'added': self.added,
            'removed': self.removed,
            'modified': self.modified,
            'reordered': self.reordered,
            'unchanged': self.unchanged,
            'error': self.error,
        }


@dataclass(slots=True)
class RepositoryState:
    """One corpus repository and everything it holds."""

    root: Path
    data: Path
    profiles: Path
    output: Path
    head: str | None = None
    dirty: bool = False
    versioned: bool = False
    default: bool = False
    corpora: list[CorpusState] = field(default_factory=list)

    @property
    def pages(self) -> int:
        return sum(corpus.pages for corpus in self.corpora)

    @property
    def bytes(self) -> int:
        return sum(corpus.bytes for corpus in self.corpora)

    @property
    def changed(self) -> list[CorpusState]:
        return [corpus for corpus in self.corpora if corpus.changed]

    def to_dict(self) -> dict[str, Any]:
        return {
            'root': str(self.root),
            'data': str(self.data),
            'profiles': str(self.profiles),
            'output': str(self.output),
            'head': self.head,
            'dirty': self.dirty,
            'versioned': self.versioned,
            'default': self.default,
            'pages': self.pages,
            'bytes': self.bytes,
            'changed': [corpus.name for corpus in self.changed],
            'corpora': [corpus.to_dict() for corpus in self.corpora],
        }


@dataclass(slots=True)
class State:
    """Every repository asked about, at one moment.

    `folder` is the repositories directory in force, which is the one fact a reader cannot deduce
    from anything else on the screen. A stale `DYARCHIA_CRAWLEE_REPOSITORIES_DIR` in one shell is
    enough to hide every corpus but the fallback, and the panel that resulted said `9 corpora` as
    confidently as it would have said fourteen.
    """

    generated_at: datetime = field(default_factory=utcnow)
    repositories: list[RepositoryState] = field(default_factory=list)
    folder: Path | None = None

    @property
    def corpora(self) -> list[CorpusState]:
        return [corpus for repository in self.repositories for corpus in repository.corpora]

    @property
    def headline(self) -> str:
        corpora = self.corpora
        if not corpora:
            return 'no corpora'
        changed = [corpus for corpus in corpora if corpus.changed]
        broken = [corpus for corpus in corpora if corpus.error]
        parts = [f'{len(corpora)} corpora', f'{sum(c.pages for c in corpora):,} pages']
        if changed:
            parts.append(f'{len(changed)} changed')
        if broken:
            parts.append(f'{len(broken)} unreadable')
        return ', '.join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            'generated_at': self.generated_at.isoformat(),
            'headline': self.headline,
            'folder': str(self.folder) if self.folder else None,
            'repositories': [repository.to_dict() for repository in self.repositories],
        }


def _corpus(target: digest.DigestTarget, settings: Settings) -> CorpusState:
    state = CorpusState(
        name=target.name,
        group=target.group,
        description=target.description,
        directory=target.directory,
        generated_at=target.generated_at,
        swept_at=target.swept_at,
        stale=target.stale,
        changed=target.changed,
        error=target.error,
        reordered=len(target.reordered),
        unchanged=target.unchanged,
    )
    for page in target.substantive:
        if page.kind == 'added':
            state.added += 1
        elif page.kind == 'removed':
            state.removed += 1
        else:
            state.modified += 1

    held = inventory.collect(target.name, settings)
    if held is not None:
        state.pages = held.pages
        state.bytes = held.bytes
        state.failed = held.failed
    return state


def _repository(root: Path, default: bool = False) -> RepositoryState:
    settings = Settings.for_repository(root)
    owner = repository_root(settings.resolve(settings.data_dir))
    repository = RepositoryState(
        root=root.resolve(),
        data=settings.resolve(settings.data_dir),
        profiles=settings.resolve(settings.profiles_dir),
        output=settings.resolve(settings.output_dir),
        versioned=owner is not None,
        head=head(owner) if owner else None,
        dirty=is_dirty(owner) if owner else False,
        default=default,
    )
    repository.corpora = [_corpus(target, settings) for target in digest.build(settings=settings).targets]
    return repository


def build(roots: list[Path] | None = None, settings: Settings | None = None) -> State:
    """Read the state of these corpus repositories, or of every one this machine holds.

    Asking for none is not asking for one. A machine that names a repositories directory holds
    several, and a panel opening on the default answer has to see all of them or it shows a corpus
    list missing whichever repository the environment did not happen to name.
    """
    settings = settings or get_settings()
    fallback = settings.resolve(settings.data_dir).parent.resolve()
    return State(
        repositories=[
            _repository(root, default=root.resolve() == fallback)
            for root in roots or repositories.roots(settings)
        ],
        folder=repositories.parent_directory(settings),
    )


def render_json(state: State) -> str:
    return json.dumps(state.to_dict(), indent=2, ensure_ascii=False)
