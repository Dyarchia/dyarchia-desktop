# dyarchia-desktop

Desktop shell for the dyarchia ecosystem. A panel container in the style of the Claude
Desktop Code tab: it starts empty, and every feature registers itself as a plugin with its
own panels — draggable, resizable, and persistent across sessions.


## 1. Architecture

- Shell built on Electron + Vite + React + TypeScript, with dockview as the layout manager.
- Each plugin is an independent project discovered at runtime: the shell never needs
  recompiling to add or remove functionality.
- The installer carries every plugin and loads none of them. Which ones this installation
  runs is a choice made in the Setup panel, and what each one needs beyond being copied is
  declared in its manifest and acquired there.
- The panel contract is framework-agnostic: a plugin mounts whatever it wants — vanilla,
  React, another framework — inside the DOM container the shell hands it.
- The look is not the shell's: it is kanon, the shared design system in packages/kanon,
  linked once. Plugins inherit its dya-* component classes and its tokens, and are expected
  to reference them rather than reimplement them.
- The system carries two themes, Gi (dark) and Paper (light), switched from the title bar.
  A theme redefines colour tokens and never rules, so no plugin reads it or branches on it.

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
            terminal/            embedded terminal (xterm.js + node-pty)
            docviewer/           native file picker + markdown, mermaid, source toggle
            player/              audio/video player (dyarchia-media://)
            kanban/              a task board that dispatches work to Claude Code
            crawlee/             a crawling toolkit and the panel that drives it (python)
            costs/               what every prompt to Claude Code cost, live from its transcripts
        examples/
            plugin-sample/       the smallest plugin that registers a panel
            plugin-pyinfo/       reference plugin with a python main module
        scripts/
            ensure-runtime.mjs   first-run check of the electron and python runtimes
            stage-plugins.mjs    collects plugins from their manifests, for the installer
            install-plugins.mjs  the same, into %APPDATA%/dyarchia/plugins
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

Portable Windows package, producing apps/shell/release/dyarchia-x.y.z.exe:

```bash
pnpm --filter @dyarchia/shell package
```

Install plugins into %APPDATA%, to test an installed copy without building an installer.
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
- **Landing on `develop` does not wait to be asked for; landing on `master` does.** The two
  hops were one rule until 2026-09-11 and are now two, because they carry different risk.
  A branch that is finished, committed and verified merges into `develop` on its own
  judgement. `master` is the released state and someone has to say so. Nothing is committed
  directly to either: both hops are `--no-ff` merges.
- **A feature branch holds a piece of work, not necessarily a single change.** It can live
  until that work is done. Two branches cut the same day that both append to the end of one
  document will conflict on the second merge, which is cheap to fix and is a reason not to
  split work that belongs together.
- **Pushing is asked for every time, and `develop` and `master` go together** once a release
  merge is made, so the remote is never a partial view of what happened. This repository is
  the shared home of several dyarchia products, so the remote is not one piece of work's to
  publish.
- **Delete the feature branch after it merges.** The merge commit holds the name.
- **Commit bodies are long and evidentiary.** State the measurement or the failure that
  forced the change, what the alternative was, and what was deliberately left alone. A
  one-line body on anything but a typo is below the bar this history sets. A change under
  `packages/kanon/css/` additionally carries its contrast ratios, in both themes — see
  `packages/kanon/README.md`.
- **Everything written to a file is in English**, commit messages included.


## 5. Plugins are shipped, not installed

**The application carries every plugin and starts with none of them loaded.** A first launch
shows one panel, Setup, and nothing else. Ticking a plugin there records the choice; the
plugin loads on the next launch.

    root                              holds                             wins
    -------------------------------   -------------------------------   ------
    resources/plugins/ (packaged)     everything the installer carried  first
    plugins/ (development)            the same set, from the workspace  first
    %APPDATA%/dyarchia/plugins/       anything dropped in by hand       second

The bundled root wins, which is the rule this project has always had for development: an
installed copy must never shadow the one being worked on. It holds once packaged for the
same reason — a copy left behind by an older version is stale, and letting it win reads a
plugin from a manifest it no longer ships. A plugin nobody ships still loads from
`%APPDATA%`, which is what that root is for.

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
there, then builds the environment in `%APPDATA%/dyarchia/environments/<id>/.venv` and tells
the plugin about it through `DYARCHIA_PLUGIN_ENV`. The plugin directory is read-only in a
packaged build, and a portable one unpacks it somewhere new on every launch, so the
environment lives elsewhere and holds no path back to it. Nothing is downloaded until
somebody presses the button, and every step skips what the machine already has.


## 6. Persistence and paths

    Data                  Path
    ------------------    -------------------------------------------
    Layout                <userData>/layout.json
    Enabled plugins       <userData>/plugins.json
    Acquired tools        <userData>/tools/
    Plugin environments   <userData>/environments/<id>/.venv
    Installed plugins     %APPDATA%/dyarchia/plugins/<id>/
    Theme choice          renderer localStorage, key dyarchia:theme
    Zoom level            <userData>/zoom.json
    Hosted kanban runs    <userData>/kanban/hosted/<runId>.jsonl, .final.md, .stderr.txt

`<userData>` is `%APPDATA%/dyarchia` in dev and in the portable build alike, because the
product name is the same in both.

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
Chrome DevTools Protocol on port 9222. The renderer publishes the dockview API on
window.__dockApi for inspection.

That port is also how a change is photographed without touching the window:

```bash
node scripts/screenshot.mjs out.png "document.documentElement.dataset.theme = 'paper'" 800
```

The first argument is the PNG to write, the optional second is an expression evaluated in
the page before the capture, and the optional third is the delay in milliseconds between
the two. A visual change ships with one capture per theme, and the commit body says what
the pair shows.

Known note: dockview 8 logs a console error about the ContextMenu module of
dockview-enterprise. It is harmless — the free edition is warning that tab context menus
are a paid feature. Nothing in the shell is affected.
