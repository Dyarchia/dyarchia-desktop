"""Install the Dyarchia Desktop panel, or remove it.

The shell discovers plugins in two places: the dyarchia-desktop workspace, and a folder per plugin
under the user's application data. This toolkit is not in that workspace and should not be, so it
installs into the second one.

The copy carries a `home` file naming this checkout, because the panel shells out to the CLI and an
installed copy has no way to find it otherwise. Nothing else is written, and nothing is registered:
the plugin is three files in a folder, and removing the folder removes it.

    py scripts/install_plugin.py
    py scripts/install_plugin.py --uninstall
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent / 'dyarchia-plugin'
MANIFEST = 'dyarchia-plugin.json'
HOME_FILE = 'home'


def application_data() -> Path:
    """Where Electron's `appData` points on this platform."""
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA')
        if not appdata:
            raise SystemExit('APPDATA is not set, so there is nowhere to install to')
        return Path(appdata)
    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support'
    return Path(os.environ.get('XDG_CONFIG_HOME') or Path.home() / '.config')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uninstall', action='store_true', help='Remove the installed plugin.')
    arguments = parser.parse_args()

    manifest = json.loads((PLUGIN_DIR / MANIFEST).read_text(encoding='utf-8'))
    target = application_data() / 'dyarchia' / 'plugins' / manifest['id']

    if arguments.uninstall:
        if not target.exists():
            print(f'nothing installed at {target}')
            return
        shutil.rmtree(target)
        print(f'removed {target}')
        return

    target.mkdir(parents=True, exist_ok=True)
    for name in (MANIFEST, manifest['renderer'], manifest['python']):
        shutil.copy2(PLUGIN_DIR / name, target / name)
    (target / HOME_FILE).write_text(str(PLUGIN_DIR.parent), encoding='utf-8', newline='\n')

    print(f'installed {manifest["id"]} {manifest["version"]} -> {target}')
    print(f'  toolkit  {PLUGIN_DIR.parent}')
    print('  restart Dyarchia Desktop: main modules are imported once, at startup')


if __name__ == '__main__':
    main()
