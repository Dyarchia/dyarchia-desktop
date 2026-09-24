"""The panel's renderer is imported, not only parsed.

`renderer.js` has no build step and no typecheck, and its CSS is one template literal. A backtick
inside a CSS comment there closes the literal and turns the rest of the stylesheet into code:
still valid syntax, so `node --check` passes, and a `ReferenceError` the moment the module is
evaluated. 0.2.6-alpha shipped exactly that, and the panel vanished from the packaged build while
Setup still reported the plugin as loaded.

Importing the module evaluates everything at its top level -- the stylesheet, the icons, every
function declaration -- without needing a DOM, because nothing touches one until `activate`.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

RENDERER = Path(__file__).resolve().parents[2] / 'renderer.js'


@pytest.mark.skipif(shutil.which('node') is None, reason='node is not on PATH')
def test_the_renderer_module_evaluates() -> None:
    probe = (
        'const m = await import(process.argv[1]);'
        "if (typeof m.activate !== 'function') throw new Error('no activate export');"
    )
    done = subprocess.run(
        ['node', '--input-type=module', '-e', probe, RENDERER.as_uri()],
        capture_output=True,
        text=True,
        check=False,
    )
    assert done.returncode == 0, done.stderr
