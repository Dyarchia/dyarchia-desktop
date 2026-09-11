# dyarchia-desktop

Desktop shell for the dyarchia ecosystem. A panel container in the style of the Claude
Desktop Code tab: it starts empty, and every feature registers itself as a plugin with its
own panels — draggable, resizable, and persistent across sessions.


## 1. Architecture

- Shell built on Electron + Vite + React + TypeScript, with dockview as the layout manager.
- Each plugin is an independent project discovered at runtime: the shell never needs
  recompiling to add or remove functionality.
- The panel contract is framework-agnostic: a plugin mounts whatever it wants — vanilla,
  React, another framework — inside the DOM container the shell hands it.
- The look is not the shell's: it is kanon, the shared design system in packages/kanon,
  linked once. Plugins inherit its dya-* component classes and its tokens, and are expected
  to reference them rather than reimplement them.
- The system carries two dark themes, Gi and Oneiro, switched from the title bar. A theme
  redefines colour tokens and never rules, so no plugin reads it or branches on it.

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
            terminal/            embedded terminal (xterm.js + node-pty)
            docviewer/           native file picker + markdown, mermaid, source toggle
            player/              audio/video player (dyarchia-media://)
            eforoi/              a panel of models with one of them comparing the answers
            kanban/              a task board that dispatches work to Claude Code
            crawlee/             a crawling toolkit and the panel that drives it (python)
        examples/
            plugin-sample/       the smallest plugin that registers a panel
            plugin-pyinfo/       reference plugin with a python main module
        scripts/
            ensure-runtime.mjs   first-run check of the electron and python runtimes
            install-plugins.mjs  copies plugins to %APPDATA%/dyarchia/plugins
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

Install plugins for the packaged app:

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


## 5. Persistence and paths

    Data                  Path
    ------------------    -------------------------------------------
    Layout (dev)          %APPDATA%/@dyarchia/shell/layout.json
    Layout (portable)     %APPDATA%/dyarchia/layout.json
    Installed plugins     %APPDATA%/dyarchia/plugins/<id>/
    Theme choice          renderer localStorage, key dyarchia:theme

The theme is the one preference that does not go through the layout store. It is read
synchronously before the first paint, and an IPC round trip would put a frame of the wrong
theme on screen at every launch.


## 6. Debugging

With the DYARCHIA_DEBUG=1 environment variable, and always in dev, the shell exposes the
Chrome DevTools Protocol on port 9222. The renderer publishes the dockview API on
window.__dockApi for inspection.

Known note: dockview 8 logs a console error about the ContextMenu module of
dockview-enterprise. It is harmless — the free edition is warning that tab context menus
are a paid feature. Nothing in the shell is affected.
