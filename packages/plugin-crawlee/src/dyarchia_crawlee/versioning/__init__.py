"""Tracking how a target's content changes between runs."""

from dyarchia_crawlee.versioning.diffing import ChangeKind, ChangeReport, PageChange, compare
from dyarchia_crawlee.versioning.hashing import content_hash
from dyarchia_crawlee.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest

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
