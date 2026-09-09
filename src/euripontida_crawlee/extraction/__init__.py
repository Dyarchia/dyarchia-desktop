"""Turning a fetched page into structured data."""

from euripontida_crawlee.extraction.dom import DomAdapter, FieldSelector, ParselAdapter, SoupAdapter
from euripontida_crawlee.extraction.strategies import RawPage, build_item

__all__ = [
    'DomAdapter',
    'FieldSelector',
    'ParselAdapter',
    'RawPage',
    'SoupAdapter',
    'build_item',
]
