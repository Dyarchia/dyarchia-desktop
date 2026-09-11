"""The on-disk shape of a profile.

A profile is a `RunSpec` with a human-facing description attached. Keeping it a subclass means the
YAML file and the command line can never drift apart: every flag the CLI accepts is a key the file
accepts, because both are the same set of fields.
"""

from __future__ import annotations

from dyarchia_crawlee.models import RunSpec


class ProfileSpec(RunSpec):
    """A named, reusable target definition."""

    description: str | None = None

    def to_run_spec(self, **overrides: object) -> RunSpec:
        """Produce the run this profile describes, with any explicit overrides applied on top."""
        data = self.model_dump(exclude={'description'})
        data.update(overrides)
        return RunSpec.model_validate(data)
