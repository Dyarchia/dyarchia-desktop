"""Declarative descriptions of recurring targets."""

from crawlee_lab.profiles.loader import (
    SavedProfile,
    load_profile_file,
    save_profile,
    save_profile_file,
    save_profile_text,
)
from crawlee_lab.profiles.schema import ProfileSpec

__all__ = [
    'ProfileSpec',
    'SavedProfile',
    'load_profile_file',
    'save_profile',
    'save_profile_file',
    'save_profile_text',
]
