"""Discovery of the profiles available to a run.

Two sources, one namespace: YAML files under the profiles directory, and Python modules under
`dyarchia_crawlee.sites` that expose a module-level `PROFILE`. A YAML file wins over a Python module of
the same name, so a checked-in site definition can be overridden locally without editing the package.

`discover` and `load` answer for one repository, which is what a run against a known root needs.
`everywhere` and `locate` answer across every repository this machine holds, and hand back the
settings the profile was found under along with the profile itself: a target is crawled into the
repository that defines it, never into whichever one the environment happened to name. A YAML
profile beats the packaged examples wherever it is found, and two repositories claiming one name is
refused rather than resolved, because whichever answer the tool picked would be somebody's corpus
quietly written into somebody else's.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

from dyarchia_crawlee import repositories, sites
from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import ProfileError
from dyarchia_crawlee.profiles.loader import PROFILE_SUFFIXES, load_profile_file
from dyarchia_crawlee.profiles.schema import ProfileSpec

PROFILE_ATTRIBUTE = 'PROFILE'


def _python_profiles() -> dict[str, ProfileSpec]:
    found: dict[str, ProfileSpec] = {}
    for module_info in pkgutil.iter_modules(sites.__path__):
        module = importlib.import_module(f'{sites.__name__}.{module_info.name}')
        profile = getattr(module, PROFILE_ATTRIBUTE, None)
        if profile is None:
            continue
        if not isinstance(profile, ProfileSpec):
            raise ProfileError(
                f'{module.__name__}.{PROFILE_ATTRIBUTE} must be a ProfileSpec, got {type(profile).__name__}'
            )
        found[profile.name] = profile
    return found


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
    profiles = _python_profiles()
    profiles.update(_yaml_profiles(settings.resolve(settings.profiles_dir)))
    return dict(sorted(profiles.items()))


def load(name: str, settings: Settings | None = None) -> ProfileSpec:
    """Look up one profile by name."""
    profiles = discover(settings)
    if name not in profiles:
        known = ', '.join(profiles) or 'none'
        raise ProfileError(f'unknown profile {name!r}. Available profiles: {known}')
    return profiles[name]


def everywhere(settings: Settings | None = None) -> dict[str, tuple[ProfileSpec, Settings]]:
    """Every profile on this machine, each with the settings of the repository that defines it.

    The packaged examples belong to no repository and are reported under the default one, so naming
    one still works on a machine with no corpus repository at all.
    """
    settings = settings or get_settings()
    roots = repositories.known(settings)
    found: dict[str, tuple[ProfileSpec, Settings]] = {
        name: (profile, roots[0]) for name, profile in _python_profiles().items()
    }
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
