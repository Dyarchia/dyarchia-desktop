"""Tracking how a target's content changes between runs."""

from crawlee_lab.versioning.diffing import ChangeKind, ChangeReport, PageChange, compare
from crawlee_lab.versioning.hashing import content_hash
from crawlee_lab.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest

__all__ = [
    'ChangeKind',
    'ChangeReport',
    'PageChange',
    'PageRecord',
    'RunManifest',
    'compare',
    'content_hash',
    'load_manifest',
    'save_manifest',
]
