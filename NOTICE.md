# Third-party notices

Dyarchia desktop is MIT licensed; see [LICENSE](LICENSE). It is built on, and ships with, work that
belongs to other people. This file says whose.

## Crawlee

The crawlee plugin is a panel and a toolkit over **Crawlee for Python**, by **Apify**, licensed
under Apache-2.0. The crawling itself — the request queue, the session pool, the retry and
concurrency policy, the browser and HTTP crawlers — is theirs. What this repository adds is the
corpus, the profiles, the search index and the panel that drives them.

- Crawlee for Python: https://github.com/apify/crawlee-python
- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0

Crawlee is not redistributed by this project. The Setup panel creates a Python environment on
the machine that runs it and installs Crawlee from PyPI, so the copy you use is the one Apify
publishes, unmodified.

## What ships inside the installer

```
component                          licence        what it does here
--------------------------------   ------------   ----------------------------------------
Electron                           MIT            the application shell
Chromium and its own dependencies  BSD-3-Clause   the renderer, see LICENSES.chromium.html
                                   and others
React, React DOM                   MIT            the shell's own interface
dockview, dockview-react           MIT            the panel layout
xterm.js and its addons            MIT            the terminal panel's screen
node-pty                           MIT            the pseudo-terminal behind it
winpty, ConPTY / OpenConsole       MIT            what node-pty drives on Windows
mermaid                            MIT            diagrams in the reader
KaTeX                              MIT            formulas in those diagrams
marked                             MIT            markdown in the reader
IBM Plex Sans, IBM Plex Mono       OFL 1.1        the interface and data faces
Spectral                           OFL 1.1        the brand face
Lobe Icons, by LobeHub             MIT            the marks of the agent CLIs
```

`LICENSE.electron.txt` and `LICENSES.chromium.html` are installed beside the executable, as
Electron and Chromium require. `licenses/OFL.txt` carries the font licence, with both copyright
notices, as the Open Font License requires of anything that bundles them. `licenses/lobe-icons.txt`
carries the MIT notice of Lobe Icons (https://github.com/lobehub/lobe-icons), from which the
monochrome marks in `packages/sdk/src/brands.ts` are taken unmodified.

Those marks are trademarks of the companies that own them. They are shown only to identify the
program a terminal tab is running or the agent a card goes to, and Dyarchia desktop is not
affiliated with or endorsed by any of their owners.

## What is installed on demand

The crawlee plugin's environment is built by the Setup panel and is not part of the download.
It brings, beyond Crawlee itself:

```
package        licence        
------------   ------------   
trafilatura    Apache-2.0     
httpx          BSD-3-Clause   
pydantic       MIT            
pydantic-settings MIT         
typer          MIT            
rich           MIT            
PyYAML         MIT            
```

## What the kanban drives, and does not ship

The kanban dispatches work to coding agents installed on the machine: the Claude, Codex, Grok
and opencode command line tools. None of them is bundled, vendored or modified, and none is a
dependency of this project — the board runs whichever of them is on the PATH, and tells you when
one is not.
