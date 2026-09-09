"""Tracking how a target's content changes between runs."""

from euripontida_crawlee.versioning.diffing import ChangeKind, ChangeReport, PageChange, compare
from euripontida_crawlee.versioning.hashing import content_hash
from euripontida_crawlee.versioning.manifest import PageRecord, RunManifest, load_manifest, save_manifest

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
