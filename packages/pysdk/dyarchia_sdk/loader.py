import importlib.util
import json
import re
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .context import PluginContext

MANIFEST_FILE = "dyarchia-plugin.json"
ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]*$")


def load_plugin(
    plugin_dir: Path, publish: Callable[[str, list[Any]], None]
) -> tuple[str, PluginContext]:
    manifest = json.loads((plugin_dir / MANIFEST_FILE).read_text(encoding="utf-8"))
    plugin_id = manifest.get("id", "")
    if not ID_PATTERN.match(plugin_id):
        raise ValueError(f"invalid plugin id in {plugin_dir}")
    entry = manifest.get("python")
    if not entry:
        raise ValueError(f"{plugin_dir} declares no python entry")
    module_path = plugin_dir / entry
    if not module_path.is_file():
        raise FileNotFoundError(module_path)

    context = PluginContext(plugin_id, publish)
    module_name = f"dyarchia_plugin_{plugin_id.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    sys.path.insert(0, str(module_path.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(module_path.parent))

    activate = getattr(module, "activate", None)
    if not callable(activate):
        raise AttributeError(f"{module_path} has no activate()")
    activate(context)
    return plugin_id, context
