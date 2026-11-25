"""Discovery of the profiles available to a run: the YAML files under each profiles directory.

`discover` and `load` answer for one repository, which is what a run against a known root needs.
`everywhere` and `locate` answer across every repository this machine holds, and hand back the
settings the profile was found under along with the profile itself: a target is crawled into the
repository that defines it, never into whichever one the environment happened to name. Two
repositories claiming one name is refused rather than resolved, because whichever answer the tool
picked would be somebody's corpus quietly written into somebody else's.

The package used to carry a `claude-docs` profile as Python, present on every machine. A fresh
installation therefore showed a target nobody had added, seeded from a whole sitemap, and the
Library counted the catalogue's own `claude-docs.yaml` as installed and never copied it. Every
shipped profile now lives in `catalog/`, as a file somebody chose to install.
"""

from __future__ import annotations

from pathlib import Path

from dyarchia_crawlee import repositories
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import ProfileError
from dyarchia_crawlee.profiles.loader import PROFILE_SUFFIXES, load_profile_file
from dyarchia_crawlee.profiles.schema import ProfileSpec


def _yaml_profiles(directory: Path) -> dict[str, ProfileSpec]:
    if not directory.is_dir():
        return {}
    found: dict[str, ProfileSpec] = {}
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() in PROFILE_SUFFIXES and path.is_file():
            profile = load_profile_file(path)
            found[profile.name] = profile
    return found


def discover(settings: Settings | None = None) -> dict[str, ProfileSpec]:
    """Return every known profile, keyed by name."""
    settings = settings or get_settings()
    return dict(sorted(_yaml_profiles(settings.resolve(settings.profiles_dir)).items()))


def load(name: str, settings: Settings | None = None) -> ProfileSpec:
    """Look up one profile by name."""
    profiles = discover(settings)
    if name not in profiles:
        known = ', '.join(profiles) or 'none'
        raise ProfileError(f'unknown profile {name!r}. Available profiles: {known}')
    return profiles[name]


def everywhere(settings: Settings | None = None) -> dict[str, tuple[ProfileSpec, Settings]]:
    """Every profile on this machine, each with the settings of the repository that defines it."""
    settings = settings or get_settings()
    roots = repositories.known(settings)
    found: dict[str, tuple[ProfileSpec, Settings]] = {}
    claimed: dict[str, Path] = {}

    for repository in roots:
        directory = repository.resolve(repository.profiles_dir)
        for name, profile in _yaml_profiles(directory).items():
            if name in claimed:
                raise ProfileError(
                    f'two repositories define a profile named {name!r}: '
                    f'{claimed[name]} and {directory}. Rename one of them.'
                )
            claimed[name] = directory
            found[name] = (profile, repository)

    return dict(sorted(found.items()))


def locate(name: str, settings: Settings | None = None) -> tuple[ProfileSpec, Settings]:
    """One profile by name, wherever it lives, with the settings of its own repository."""
    profiles = everywhere(settings)
    if name not in profiles:
        known = ', '.join(profiles) or 'none'
        raise ProfileError(f'unknown profile {name!r}. Available profiles: {known}')
    return profiles[name]
