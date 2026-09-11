"""Turning a fetched page into structured data."""

from dyarchia_crawlee.extraction.dom import DomAdapter, FieldSelector, ParselAdapter, SoupAdapter
from dyarchia_crawlee.extraction.strategies import RawPage, build_item

__all__ = [
    'DomAdapter',
    'FieldSelector',
    'ParselAdapter',
    'RawPage',
    'SoupAdapter',
    'build_item',
]
