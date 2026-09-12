"""Which corpus repositories this machine holds.

A corpus repository is a directory with `profiles/`, `data/` and `output/` in it, versioned on its
own so the corpus it tracks has a history the toolkit's checkout does not carry. One machine can
hold several: the AI providers' documentation as a lab, the Salesforce platform as the thing work
is actually done on. They share a tool and nothing else.

`DYARCHIA_CRAWLEE_REPOSITORIES_DIR` names the folder they sit in, and every subdirectory of it
holding a `profiles/` is one. Adding a corpus repository is therefore a clone into that folder
rather than an edit to a configuration file, and the tool finds it on the next command.

The folder is created when it is named and not there. Naming it is the declaration that this
machine crawls, so materialising it is answering the question rather than refusing on a technicality
somebody then has to look up. Nothing is created when the variable is unset, and a machine that
leaves it unset behaves exactly as every command did before this module existed: one root, the one
`data_dir`, `profiles_dir` and `output_dir` name.

What the folder never gets is content. An empty repository is not a repository, and a `profiles/`
full of examples enrols somebody in crawling a set of sites they did not choose.
"""

from __future__ import annotations

from pathlib import Path

from dyarchia_crawlee.config import Settings, get_settings
from dyarchia_crawlee.errors import ConfigurationError

MARKER = 'profiles'


def _is_repository(candidate: Path) -> bool:
    return (candidate / MARKER).is_dir()


def parent_directory(settings: Settings | None = None) -> Path | None:
    """The folder the corpus repositories sit in, created if it was named and is not there."""
    settings = settings or get_settings()
    if settings.repositories_dir is None:
        return None

    directory = settings.resolve(settings.repositories_dir)
    if directory.exists() and not directory.is_dir():
        raise ConfigurationError(
            f'DYARCHIA_CRAWLEE_REPOSITORIES_DIR names {directory}, which is not a directory'
        )
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def roots(settings: Settings | None = None) -> list[Path]:
    """Every corpus repository this machine holds, the configured default one included.

    Sorted, and deduplicated by resolved path: on a machine whose `data_dir` already points inside
    one of the discovered repositories, that repository is one entry rather than two.
    """
    settings = settings or get_settings()
    found = [settings.resolve(settings.data_dir).parent.resolve()]

    parent = parent_directory(settings)
    if parent is not None:
        found += sorted(child.resolve() for child in parent.iterdir() if _is_repository(child))

    return list(dict.fromkeys(found))


def known(settings: Settings | None = None) -> list[Settings]:
    """One `Settings` per repository, each pointing at its own data, profiles and output."""
    settings = settings or get_settings()
    return [Settings.for_repository(root) for root in roots(settings)]
