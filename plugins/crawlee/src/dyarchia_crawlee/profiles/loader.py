"""Reading and writing profile files.

A profile describes somebody's corpus, so it lives with the corpus rather than with the tool, and
in the repositories that hold the corpora it is tracked. Editing one is therefore a change to a
versioned file, and a write that leaves no commit behind is a change nobody can find again.

`save_profile` will not make one quietly. Where the file is versioned it commits, where it cannot
be it says why, and a caller that requires a commit -- anything with a save button -- gets a refusal
before anything is written rather than a surprise afterwards.
"""

from __future__ import annotations

import shutil
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from dyarchia_crawlee.errors import DyarchiaCrawleeError, ProfileError
from dyarchia_crawlee.profiles.schema import ProfileSpec
from dyarchia_crawlee.versioning.vcs import commit_path, commit_paths, is_ignored, repository_root

PROFILE_SUFFIXES = ('.yaml', '.yml')


def load_profile_file(path: Path) -> ProfileSpec:
    """Parse one profile file, reporting the offending file when it is malformed."""
    try:
        raw: Any = yaml.safe_load(path.read_text(encoding='utf-8'))
    except yaml.YAMLError as error:
        raise ProfileError(f'{path.name} is not valid YAML: {error}') from error

    if not isinstance(raw, dict):
        raise ProfileError(f'{path.name} must contain a mapping at the top level')

    raw.setdefault('name', path.stem)

    try:
        return ProfileSpec.model_validate(raw)
    except ValidationError as error:
        raise ProfileError(f'{path.name} is not a valid profile:\n{error}') from error


def render_profile(profile: ProfileSpec) -> str:
    """A profile as YAML, keeping only the fields that differ from the defaults."""
    payload = profile.model_dump(mode='json', exclude_defaults=True, exclude_none=True)
    payload['name'] = profile.name

    ordered: dict[str, Any] = {}
    for key in ('name', 'description'):
        if key in payload:
            ordered[key] = payload[key]
    for key, value in payload.items():
        ordered.setdefault(key, value)

    return yaml.safe_dump(ordered, sort_keys=False, allow_unicode=True, width=100)


@dataclass(slots=True)
class SavedProfile:
    """Where a profile landed, and whether the history knows about it."""

    path: Path
    revision: str | None = None
    unversioned_because: str | None = None

    @property
    def versioned(self) -> bool:
        return self.unversioned_because is None

    def __str__(self) -> str:
        if not self.versioned:
            return f'saved {self.path}, not versioned: {self.unversioned_because}'
        if self.revision is None:
            return f'saved {self.path}, unchanged so nothing to commit'
        return f'saved {self.path}, committed {self.revision[:12]}'


@dataclass(slots=True)
class DeletedProfile:
    """What went, and whether the history knows that it went."""

    path: Path
    removed: list[Path] = field(default_factory=list)
    revision: str | None = None
    unversioned_because: str | None = None

    @property
    def versioned(self) -> bool:
        return self.unversioned_because is None

    def __str__(self) -> str:
        what = f'removed {self.path.name}'
        rest = len(self.removed) - 1
        if rest > 0:
            what += f' and {rest} path{"" if rest == 1 else "s"} beside it'
        if not self.versioned:
            return f'{what}, not versioned: {self.unversioned_because}'
        if self.revision is None:
            return f'{what}, nothing the history was tracking'
        return f'{what}, committed {self.revision[:12]}'


def profile_file(name: str, directory: Path) -> Path | None:
    """The document one profile is written in, in this directory, whichever suffix it uses."""
    for suffix in PROFILE_SUFFIXES:
        candidate = directory / f'{name}{suffix}'
        if candidate.is_file():
            return candidate
    return None


def delete_profile(
    name: str,
    directory: Path,
    *,
    also: Sequence[Path] = (),
    require_commit: bool = False,
) -> DeletedProfile:
    """Remove a profile and whatever else is named with it, and commit the removal.

    `also` is what the profile described rather than what it is -- the snapshot directory, the
    files a run exported -- and every one of them has to be inside the repository that holds the
    profile. A target is named by a panel and a path is derived from that name, so the check is
    against the one mistake that matters here: a name that resolves outside the corpus and takes
    something else with it.

    The profile goes last of all, because it is the only record of where the rest was. A run
    interrupted between the two leaves a profile describing a corpus that is gone, which the
    next round rebuilds; the reverse leaves a corpus nothing on this machine can name.
    """
    target = profile_file(name, directory)
    if target is None:
        raise ProfileError(f'no profile named {name!r} in {directory}')

    obstacle = _why_unversioned(directory, target)
    if obstacle is not None and require_commit:
        raise ProfileError(f'refusing to delete {target.name}: {obstacle}')

    root = repository_root(directory)
    for path in also:
        if root is not None and root not in path.resolve().parents:
            raise ProfileError(f'refusing to delete {path}: it is outside {root}')

    removed: list[Path] = []
    for path in also:
        if path.is_dir():
            shutil.rmtree(path)
            removed.append(path)
        elif path.is_file():
            path.unlink()
            removed.append(path)

    target.unlink()
    removed.append(target)

    if obstacle is not None:
        return DeletedProfile(path=target, removed=removed, unversioned_because=obstacle)

    return DeletedProfile(
        path=target,
        removed=removed,
        revision=commit_paths(removed, f'profile({name}): removed'),
    )


def _why_unversioned(directory: Path, target: Path) -> str | None:
    """What stands between this profile and a commit, or None when nothing does."""
    root = repository_root(directory)
    if root is None:
        return 'it is not inside a git repository'
    if is_ignored(target, root):
        return f'{target.name} is ignored by .gitignore'
    return None


def _persist(target: Path, body: str, name: str, require_commit: bool) -> SavedProfile:
    """Write this text and commit it, or put back what was there and refuse."""
    obstacle = _why_unversioned(target.parent, target)
    if obstacle is not None and require_commit:
        raise ProfileError(f'refusing to save {target.name}: {obstacle}')

    existed = target.is_file()
    previous = target.read_bytes() if existed else None
    # newline='\n' rather than the platform's: without it every save on Windows rewrites every
    # line, and the corpus repositories declare `* -text`, so git records that as a real change.
    # Saving a profile back unchanged committed 24 insertions and 24 deletions before this.
    target.write_text(body, encoding='utf-8', newline='\n')

    if obstacle is not None:
        return SavedProfile(path=target, unversioned_because=obstacle)

    verb = 'updated' if existed else 'added'
    try:
        revision = commit_path(target, f'profile({name}): {verb}')
    except DyarchiaCrawleeError as error:
        # Half a saved profile is a profile that no longer describes the corpus beside it.
        if previous is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(previous)
        raise ProfileError(f'{target.name} was not saved: {error}') from error

    return SavedProfile(path=target, revision=revision)


def save_profile(profile: ProfileSpec, directory: Path, *, require_commit: bool = False) -> SavedProfile:
    """Write a profile built from a run, and commit it, or say why it could not be committed.

    Rendered from the model, so this is for a profile a run produced. Editing one that already
    exists goes through `save_profile_text`, which keeps what was written by hand.
    """
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f'{profile.name}.yaml'
    return _persist(target, render_profile(profile), profile.name, require_commit)


def save_profile_text(name: str, text: str, directory: Path, *, require_commit: bool = False) -> SavedProfile:
    """Save an edited profile exactly as written, after checking it still parses.

    Verbatim on purpose. A profile carries the measurements that justify its own rules -- which
    sitemap set it narrows, what markdown coverage was found and when -- and all of that lives in
    comments the model does not hold. Round-tripping an edit through `ProfileSpec` drops every one
    of them: the Agentforce Vibes profile goes from 24 lines and 8 comments to 17 and none.

    So the text is the document. It is parsed only to refuse a broken one before it lands.
    """
    try:
        raw: Any = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise ProfileError(f'{name}.yaml is not valid YAML:\n{error}') from error

    try:
        parsed = ProfileSpec.model_validate(raw)
    except ValidationError as error:
        raise ProfileError(f'{name}.yaml is not a valid profile:\n{error}') from error

    if parsed.name != name:
        raise ProfileError(f'{name}.yaml declares the name {parsed.name!r}, which would not be found')

    directory.mkdir(parents=True, exist_ok=True)
    return _persist(directory / f'{name}.yaml', text, name, require_commit)
