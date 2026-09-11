"""Profiles that are easier to express in Python than in YAML.

A site module declares a module-level `PROFILE` of type `ProfileSpec`. It stays a declaration rather
than a hook into Crawlee: anything a target needs that the spec cannot express belongs in the engine
as a reusable feature, not in a per-site escape hatch.
"""
