"""Reading and writing profile files."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from crawlee_lab.errors import ProfileError
from crawlee_lab.profiles.schema import ProfileSpec

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


def save_profile_file(profile: ProfileSpec, directory: Path) -> Path:
    """Write a profile out, keeping only the fields that differ from the defaults."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f'{profile.name}.yaml'

    payload = profile.model_dump(mode='json', exclude_defaults=True, exclude_none=True)
    payload['name'] = profile.name

    ordered: dict[str, Any] = {}
    for key in ('name', 'description'):
        if key in payload:
            ordered[key] = payload[key]
    for key, value in payload.items():
        ordered.setdefault(key, value)

    target.write_text(
        yaml.safe_dump(ordered, sort_keys=False, allow_unicode=True, width=100),
        encoding='utf-8',
    )
    return target
