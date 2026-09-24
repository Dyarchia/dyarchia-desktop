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

import re
import shutil
import subprocess
from pathlib import Path

import pytest

RENDERER = Path(__file__).resolve().parents[2] / 'renderer.js'


def test_no_name_is_declared_again_inside_a_function() -> None:
    """A local that reuses an outer name hides it for the whole function, not from its own line on.

    Twice on 2026-09-24 the panel mounted and then showed "Cannot access 'X' before initialization"
    where the corpus headline should be: once a new shared `groups` set was used above a local
    `const groups` further down the same function, and once a new `swept()` formatter was called
    above a local `const swept`. Importing the module does not reach either, because both live in
    code that only runs when the panel renders. What is declared at the top of the file, and at the
    top of `mount`, is not declared again anywhere below it.
    """
    source = RENDERER.read_text(encoding='utf-8')
    start = source.index('\nfunction mount(')
    end = source.index('\n}\n', start)
    mount = source[start:end]

    top = set(re.findall(r'^function (\w+)\(', source, re.MULTILINE))
    top |= set(re.findall(r'^(?:const|let) (\w+)\b', source, re.MULTILINE))
    shared = set(re.findall(r'^    (?:const|let) (\w+)\b', mount, re.MULTILINE))

    again = sorted(
        {name for name in top if re.search(rf'^ {{4,}}(?:const|let|var) {name}\b', source, re.MULTILINE)}
        | {name for name in shared if re.search(rf'^ {{8,}}(?:const|let|var) {name}\b', mount, re.MULTILINE)}
    )
    assert again == [], f'declared again inside a function, shadowing the outer one: {again}'


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
