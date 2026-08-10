"""Discovery of the profiles available to a run.

Two sources, one namespace: YAML files under the profiles directory, and Python modules under
`crawlee_lab.sites` that expose a module-level `PROFILE`. A YAML file wins over a Python module of
the same name, so a checked-in site definition can be overridden locally without editing the package.
"""

from __future__ import annotations

import importlib
import pkgutil
from pathlib import Path

from crawlee_lab import sites
from crawlee_lab.config import Settings, get_settings
from crawlee_lab.errors import ProfileError
from crawlee_lab.profiles.loader import PROFILE_SUFFIXES, load_profile_file
from crawlee_lab.profiles.schema import ProfileSpec

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
