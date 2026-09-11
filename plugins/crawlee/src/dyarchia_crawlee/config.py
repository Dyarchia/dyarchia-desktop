"""Runtime settings resolved from environment variables and an optional .env file."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_USER_AGENT = 'dyarchia-crawlee/0.1 (+https://github.com/Dyarchia/dyarchia-crawlee; polite crawler)'


def find_project_root(start: Path | None = None) -> Path:
    """Walk upwards from `start` looking for the directory that holds pyproject.toml."""
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / 'pyproject.toml').is_file():
            return candidate
    return current


class Settings(BaseSettings):
    """Defaults applied to every run unless a profile or a CLI flag overrides them."""

    model_config = SettingsConfigDict(
        env_prefix='DYARCHIA_CRAWLEE_',
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    user_agent: str = DEFAULT_USER_AGENT
    min_concurrency: int = Field(default=1, ge=1)
    desired_concurrency: int = Field(default=3, ge=1)
    max_concurrency: int = Field(default=8, ge=1)
    max_requests_per_minute: float = Field(default=60.0, gt=0)
    max_request_retries: int = Field(default=3, ge=0)
    request_timeout_seconds: int = Field(default=60, gt=0)
    respect_robots: bool = True
    min_success_rate: float = Field(default=0.9, ge=0.0, le=1.0)
    min_coverage: float = Field(default=0.5, ge=0.0, le=1.0)
    headless: bool = True

    data_dir: Path = Path('data')
    output_dir: Path = Path('output')
    profiles_dir: Path = Path('profiles')
    storage_dir: Path = Path('storage')

    @classmethod
    def for_repository(cls, root: Path) -> Settings:
        """Settings pointing at one corpus repository: a directory holding data, profiles, output.

        The same convention `scripts/watch.ps1 -Repository` sets in the environment, expressed once
        on this side too. A machine watching several unrelated corpora keeps them in separate
        repositories, so anything that reads more than one has to be able to name them.
        """
        root = root.resolve()
        return cls(data_dir=root / 'data', profiles_dir=root / 'profiles', output_dir=root / 'output')

    @property
    def project_root(self) -> Path:
        return find_project_root()

    def resolve(self, path: Path) -> Path:
        """Turn a possibly relative configured path into an absolute one under the project root."""
        return path if path.is_absolute() else self.project_root / path

    def data_root(self, group: str | None = None) -> Path:
        """Where a target's snapshots live, inside its group's folder when it names one."""
        root = self.resolve(self.data_dir)
        return root / group if group else root

    def output_root(self, group: str | None = None) -> Path:
        """Where a run's output files land, grouped the way its snapshots are."""
        root = self.resolve(self.output_dir)
        return root / group if group else root

    def storage_root(self) -> Path:
        """Where Crawlee's per-run working directory goes.

        Scratch, not output: every run purges what it is given and the directory is removed when
        the process exits. It is configurable so it can be kept out of the checkout entirely, since
        a run killed mid-flight leaves its working directory behind.
        """
        return self.resolve(self.storage_dir)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
