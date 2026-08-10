"""Declarative descriptions of recurring targets."""

from crawlee_lab.profiles.loader import load_profile_file, save_profile_file
from crawlee_lab.profiles.schema import ProfileSpec

__all__ = ['ProfileSpec', 'load_profile_file', 'save_profile_file']
