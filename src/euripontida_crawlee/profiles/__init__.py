"""Declarative descriptions of recurring targets."""

from euripontida_crawlee.profiles.loader import (
    SavedProfile,
    load_profile_file,
    save_profile,
    save_profile_file,
    save_profile_text,
)
from euripontida_crawlee.profiles.schema import ProfileSpec

__all__ = [
    'ProfileSpec',
    'SavedProfile',
    'load_profile_file',
    'save_profile',
    'save_profile_file',
    'save_profile_text',
]
