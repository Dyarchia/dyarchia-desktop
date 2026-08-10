"""Turning a fetched page into structured data."""

from crawlee_lab.extraction.dom import DomAdapter, FieldSelector, ParselAdapter, SoupAdapter
from crawlee_lab.extraction.strategies import RawPage, build_item

__all__ = [
    'DomAdapter',
    'FieldSelector',
    'ParselAdapter',
    'RawPage',
    'SoupAdapter',
    'build_item',
]
