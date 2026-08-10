"""Runtime settings resolved from environment variables and an optional .env file."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_USER_AGENT = 'crawlee-lab/0.1 (+https://github.com/crawlee-lab; polite crawler)'


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
        env_prefix='CRAWLEE_LAB_',
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
    headless: bool = True

    data_dir: Path = Path('data')
    output_dir: Path = Path('output')
    profiles_dir: Path = Path('profiles')

    @property
    def project_root(self) -> Path:
        return find_project_root()

    def resolve(self, path: Path) -> Path:
        """Turn a possibly relative configured path into an absolute one under the project root."""
        return path if path.is_absolute() else self.project_root / path


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
