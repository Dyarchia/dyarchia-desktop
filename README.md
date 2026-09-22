# dyarchia-desktop

**ALPHA — 0.2.5-alpha. Not a release. Expect breakage, and do not keep anything here that
you cannot afford to lose.**

This is an early build published so it can be installed and exercised on a second machine.
It has never been run on a computer other than the one that built it, it is unsigned, and
several of its parts are documented as working but unproven. What that means in practice:

- Windows SmartScreen will warn about an unknown publisher, because the executable carries
  no code-signing certificate. That warning is accurate; the binary is not certified by
  anyone.
- No release carries a promise about the next one. Layout, plugin data and the on-disk
  formats under `~/.dyarchia` may change without a migration.
- The shell ships every plugin and loads four of them: Setup, the terminal, the reader and
  the player. The two that need a toolchain of their own are a choice made in Setup, which
  also says what each one will download and where it will write.
- The kanban plugin drives real agent CLIs, and those spend real money on your account when
  you point them at a real model. Read `plugins/kanban/README.md` before running a card.
- The crawlee plugin needs a corpus repository. An installed copy is given one under
  `~/Dyarchia/crawlee`; a checkout uses the `.env` beside its `pyproject.toml`, and
  its own README is the authority.

Desktop shell for the dyarchia ecosystem. A panel container in the style of the Claude
Desktop Code tab: it starts empty, and every feature registers itself as a plugin with its
own panels — draggable, resizable, and persistent across sessions.


## 1. Architecture

- Shell built on Electron + Vite + React + TypeScript, with dockview as the layout manager.
- Each plugin is an independent project discovered at runtime: the shell never needs
  recompiling to add or remove functionality.
- The installer carries every plugin. Four are the application and always load; the rest
  are a choice made in the Setup panel, and what each one needs beyond being copied is
  declared in its manifest and acquired there.
- The panel contract is framework-agnostic: a plugin mounts whatever it wants — vanilla,
  React, another framework — inside the DOM container the shell hands it.
- The look is not the shell's: it is kanon, the shared design system in packages/kanon,
  linked once. Plugins inherit its dya-* component classes and its tokens, and are expected
  to reference them rather than reimplement them.
- The system carries two themes, Gi (warm near-black) and Rei (deep blue), switched from
  the title bar. Both are dark. A theme redefines colour tokens and never rules, so no
  plugin reads it or branches on it.

```mermaid
flowchart LR
    subgraph main [Main process]
        D[Plugin discovery] --> P[dyarchia-plugin:// protocol]
        D --> M[Plugin main modules<br/>node-pty, fs, python]
    end
    subgraph renderer [Renderer]
        H[Plugin host] --> R[Panel registry]
        R --> V[dockview]
    end
    P --> H
    M <--> H
```

The pieces:

    Piece                       Location                     Responsibility
    -----------------------     -------------------------    ----------------------------------------
    Shell (Electron app)        apps/shell                   window, layout, toggles, persistence
    Design system               packages/kanon               tokens, components, fonts, reset
    SDK                         packages/sdk                 TypeScript plugin contract
    Python SDK                  packages/pysdk               Python plugin contract and stdio host
    Discovery + protocol        apps/shell/src/main          manifest scanning, bundle serving
    Plugin host                 apps/shell/src/renderer      bundle loading and panel registration
    Plugins                     plugins/*                    the actual functionality


## 2. Repository layout

    dyarchia-desktop/
        apps/
            shell/               Electron app (main, preload, renderer)
        packages/            required: deleting one of these breaks the rest
            kanon/               @dyarchia/kanon - the design system, its spec, and token lookup
            sdk/                 @dyarchia/sdk - contract types and injectStyles
            pysdk/               dyarchia_sdk - python plugin runtime
        plugins/                 optional: delete a folder here and nothing else notices
            settings/            the Setup panel: which plugins load, and installing what they need
            terminal/            embedded terminal (xterm.js + node-pty)        [always loaded]
            docviewer/           native file picker + markdown, mermaid, source [always loaded]
            player/              audio/video player (dyarchia-media://)         [always loaded]
            kanban/              a task board that dispatches work to Claude Code
            crawlee/             a crawling toolkit and the panel that drives it (python)
        examples/
            plugin-sample/       the smallest plugin that registers a panel
            plugin-pyinfo/       reference plugin with a python main module
        scripts/
            ensure-runtime.mjs   first-run check of the electron and python runtimes
            stage-plugins.mjs    collects plugins from their manifests, for the installer
            install-plugins.mjs  the same, into ~/.dyarchia/plugins
            build-plugin.mjs     the shared esbuild invocation every plugin builds with
        docs/
            plugins.md           the whole plugin contract: code and UI


## 3. Commands

Development. Opens a window with hot reload; in dev the shell discovers plugins directly
under plugins/, taking priority over installed ones. Run pnpm build at least once first,
since plugin dist/ is not versioned:

```bash
pnpm dev
```

Build every workspace:

```bash
pnpm build
```

Windows installer, producing apps/shell/release/dyarchia-x.y.z-setup.exe. It installs for one
user into ~/.dyarchia/app, beside the data home and inside the same root, never asks who it is
for and never asks for elevation, offers to change that directory, and writes a start menu and
desktop shortcut:

```bash
pnpm --filter @dyarchia/shell package
```

Install plugins into ~/.dyarchia, to test an installed copy without building an installer.
A packaged build carries them already, so this is only for the copy that overrides it:

```bash
node scripts/install-plugins.mjs
```

There is no test runner, linter or formatter. Type checking is manual, as every tsconfig
sets noEmit:

```bash
npx tsc -p apps/shell
```


## 4. Branches and releases

One repository, three kinds of branch. `master` is the trunk, `develop` is where work
lands, and everything is built on a `feature/*` cut from `develop`.

```text
Branch       Holds                              Merged with
----------   --------------------------------   ----------------------------
master       the released state                 --no-ff, from develop only
develop      integrated, unreleased work        --no-ff, from feature/* only
feature/*    one piece of work                  deleted after merging
```

The rules, in order:

- **Cut the branch before the first edit, not after.** A change that has already started
  on `develop` has lost the review surface the branch exists to give it.
- **Merge with `--no-ff`, always.** A fast-forward erases the fact that a set of commits
  belonged together, which is the only thing that makes the history readable later.
- **A branch that is finished, committed and verified lands on its own judgement**, and it
  lands on both: `develop` and then `master`, both `--no-ff`, both pushed. The two hops were
  one rule until 2026-09-11, then two until 2026-09-22, and are one again — nobody follows
  this repository, and a `master` held back from a `develop` that works was a ceremony
  protecting an audience that does not exist. Nothing is committed directly to either.
- **A feature branch holds a piece of work, not necessarily a single change.** It can live
  until that work is done. Two branches cut the same day that both append to the end of one
  document will conflict on the second merge, which is cheap to fix and is a reason not to
  split work that belongs together.
- **The remote is never a partial view of what happened.** `develop` and `master` are pushed
  together, so what the repository says publicly is what the working tree says here.
- **Delete the feature branch after it merges.** The merge commit holds the name.
- **Commit bodies are long and evidentiary.** State the measurement or the failure that
  forced the change, what the alternative was, and what was deliberately left alone. A
  one-line body on anything but a typo is below the bar this history sets. A change under
  `packages/kanon/css/` additionally carries its contrast ratios, in both themes — see
  `packages/kanon/README.md`.
- **Everything written to a file is in English**, commit messages included.

### Cutting one

An installed copy looks for a newer one and reads `latest.yml` out of the newest release's
assets. That file is produced by `electron-builder --publish` and by nothing else, so a
release uploaded by hand is a release no installed copy can see. One command does every
part of it:

```bash
node scripts/release.mjs --publish
```

Without `--publish` it prints what it would do and stops, which is also how to check the
branch, the tree and the version before spending a build on them. It refuses to run
anywhere but `master`, refuses a dirty tree, and refuses a version some tag already claims.
Then it tags, pushes the tag, builds the workspace, packages with `--publish always`, and
deletes every older release and older local installer -- **the tags stay**, because they
are the history and deleting one rewrites what a commit meant. `--keep-old` leaves the
older releases alone.

Only the newest release exists at any time. An alpha that publishes five installers offers
five wrong answers to somebody arriving at the releases page, and the updater reads the
newest release and nothing else.

### What an installed copy does with it

The version in the top bar states which build is running. Eight seconds after start, and
only in a packaged build, the shell asks GitHub whether there is a newer one; every release
is a prerelease, so `allowPrerelease` is what makes one findable at all.

Nothing is downloaded without being asked. An update offers itself as one control beside
the version -- `Update to 0.2.6-alpha`, then the percentage, then `Restart to finish` --
and there is no idle button when there is nothing to offer. A check that failed says so in
the tip on the version rather than taking the bar: it is a background request to a service
that may simply be unreachable.

The installer writes its location into `HKCU` only when there is nothing there already, so
an update installs over the copy it is replacing rather than beside it. The directory page
asks once, at the first install, and the answer is kept.


## 5. Plugins are shipped, not installed

**The application carries every plugin, and four of them are the application.** Setup, the
terminal, the reader and the player load on every launch and are not offered as a choice:
they need no toolchain, they cost nothing to carry, and there is no version of this product
that is better without a terminal in it.

**What stays a choice is the plugin that reaches outside for something.** kanban wants the
Claude Code CLI and spends money on a real account; crawlee wants an interpreter, a package
set and a browser. Ticking one records the choice; it loads on the next launch.

    root                              holds                             wins
    -------------------------------   -------------------------------   ------
    resources/plugins/ (packaged)     everything the installer carried  first
    plugins/ (development)            the same set, from the workspace  first
    ~/.dyarchia/plugins/              anything dropped in by hand       second

The bundled root wins, which is the rule this project has always had for development: an
installed copy must never shadow the one being worked on. It holds once packaged for the
same reason — a copy left behind by an older version is stale, and letting it win reads a
plugin from a manifest it no longer ships. A plugin nobody ships still loads from
`~/.dyarchia`, which is what that root is for.

The restart is Electron's, not a decision. A plugin serving its own scheme needs
`registerSchemesAsPrivileged` before `app.whenReady()`, and every main module is imported
once during startup, so a plugin enabled while the window is open cannot be activated into
it. Setup says so and offers to relaunch.

The file records what is **on**, so a plugin added by a later version arrives off: an update
never grows the application behind the user's back.

**None of this applies to `pnpm dev`.** A plugin in the workspace is there because somebody is
working on it, and asking them to tick a panel before their own tree loads is a question with
one answer. Development loads everything; `DYARCHIA_SETUP=1` reproduces a user's first run on
purpose, which is how the panel itself gets worked on.

**A manifest declares what a plugin is made of, and nothing is inferred.** `renderer`, `main`
and `python` are the entry points; `files` is whatever else it needs at runtime; `nativeDeps`
are packages that must travel with their prebuilt binaries; `requires` is what has to be true
before it can run. `scripts/stage-plugins.mjs` reads exactly those, which is why crawlee ships
like everything else — the script it replaced decided by looking for a `dist/` and left crawlee
out of every build for a reason nobody had chosen.

    requirement kind   means                            Setup can acquire it
    ----------------   ------------------------------   --------------------
    command            an executable on PATH            no: it says what to install
    python             an interpreter and its packages  yes, with uv

Acquiring a Python environment downloads uv from its own release when it is not already
there, then builds the environment in `~/.dyarchia/environments/<id>/.venv` and tells
the plugin about it through `DYARCHIA_PLUGIN_ENV`. The plugin directory is read-only in a
packaged build, and a portable one unpacks it somewhere new on every launch, so the
environment lives elsewhere and holds no path back to it. Nothing is downloaded until
somebody presses the button, and every step skips what the machine already has.


## 6. Persistence and paths

    Data                  Path
    ------------------    -------------------------------------------
    Layout                <root>/layout.json
    Enabled plugins       <root>/plugins.json
    Acquired tools        <root>/tools/
    Plugin environments   <root>/environments/<id>/.venv
    Installed plugins     <root>/plugins/<id>/
    Theme choice          renderer localStorage, key dyarchia:theme
    Zoom level            <root>/zoom.json
    Hosted kanban runs    <root>/kanban/hosted/<runId>.jsonl, .final.md, .stderr.txt
    Corpus repositories   <root>/data/crawlee/<repository>/{profiles,data,output}
    Derived crawl state   <root>/crawlee/{index,storage}

**`<root>` is `~/.dyarchia`**, in dev and in an installed copy alike, and it is everything
this application keeps: one place to look, one to back up, one to delete. `DYARCHIA_HOME`
moves it, and an explicit Chromium `--user-data-dir` still wins, which is how a second
instance runs against a throwaway profile.

It was two roots until 0.2.0-alpha, and both were places nobody chose. Electron's default
`userData` is `%APPDATA%/dyarchia`, where nobody navigates; and `app.getPath('documents')` is
the one path a machine redirects — on any Windows with OneDrive signed in it answers
`…/OneDrive/Documentos`, which points a sync client at a git checkout that every crawl
rewrites. **The shell moves an older installation's `%APPDATA%/dyarchia` into the new root on
first launch**, once, as a rename: the layout, the enabled list, the Python environments and
the kanban boards travel with it, and nothing is copied or left behind to go stale.

`<root>/data/` is the half a user is expected to open: a corpus repository is their own
material, cloned and committed on its own, and a plugin that writes it somewhere unnamed has
hidden their work from them. A plugin declares the folder it wants there with `data` in its
manifest, and Setup prints the path before anything is installed. Everything above `data/` is
machine state and can be deleted without losing anything that was not rebuildable.

**Nothing resolves a path against the plugin's own directory any more.** It did until
0.1.0-alpha.1, and the build was portable, which unpacks itself into `%TEMP%\<guid>` on
every launch: the crawlee corpus was written into a folder Windows deletes, at a different
address each time. That is why this ships as an installer.

The theme is the one preference that does not go through the layout store. It is read
synchronously before the first paint, and an IPC round trip would put a frame of the wrong
theme on screen at every launch.


## 7. Keyboard

The application menu is null, so nothing here comes from Chromium's own accelerators.
Zoom is caught in the main process before the page sees the key; the panel shortcuts
are the renderer's and go through the dockview API.

    Keys                          Effect
    ---------------------------   --------------------------------------------------
    Ctrl + = / Ctrl + +           zoom in, half a level (about 10%) per press
    Ctrl + -                      zoom out
    Ctrl + 0                      reset zoom
    Ctrl + wheel                  zoom in or out
    Ctrl + Tab / Ctrl + Shift+Tab next or previous panel in the active group
    Ctrl + W                      close the active panel, unless a terminal has focus
    Ctrl + ,                      open the Setup panel, or bring it to the front
    F12                           DevTools, in dev or under DYARCHIA_DEBUG=1

Zoom is clamped between three levels out and three in, and the level persists across
restarts. Ctrl + W leaves a focused terminal alone because there it is the shell's own
word erase.


## 8. Debugging

With the DYARCHIA_DEBUG=1 environment variable, and always in dev, the shell exposes the
Chrome DevTools Protocol on port 9222, or on DYARCHIA_DEBUG_PORT when a second instance
needs one of its own. The renderer publishes the dockview API on window.__dockApi for
inspection. scripts/screenshot.mjs reads the same variable, so it reaches the instance
that was started with it rather than whichever one took 9222 first.

That port is also how a change is photographed without touching the window:

```bash
node scripts/screenshot.mjs out.png "document.documentElement.dataset.theme = 'rei'" 800
```

The first argument is the PNG to write, the optional second is an expression evaluated in
the page before the capture, and the optional third is the delay in milliseconds between
the two. A visual change ships with one capture per theme, and the commit body says what
the pair shows.

Known note: dockview 8 logs a console error about the ContextMenu module of
dockview-enterprise. It is harmless — the free edition is warning that tab context menus
are a paid feature. Nothing in the shell is affected.

## 9. Licence and attribution

dyarchia is MIT licensed. See [LICENSE](LICENSE).

The crawling in the crawlee plugin is not this project's work: it is
[Crawlee for Python](https://github.com/apify/crawlee-python), by Apify, under Apache-2.0.
What this repository adds around it is the corpus, the profiles, the search index and the
panel. Crawlee is not redistributed here — Setup builds a Python environment on your machine
and installs it from PyPI, so the copy you run is the one Apify publishes.

[NOTICE.md](NOTICE.md) lists everything else: what ships inside the installer, what the Setup
panel fetches on demand, and the agent CLIs the kanban drives without bundling any of them.
An installed copy carries `LICENSE.txt`, `NOTICE.md` and `licenses/OFL.txt` beside the
executable, next to the Electron and Chromium notices that were already there.
