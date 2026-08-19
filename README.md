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
    SDK                         packages/sdk                 TypeScript plugin contract
    Python SDK                  packages/pysdk               Python plugin contract and stdio host
    Discovery + protocol        apps/shell/src/main          manifest scanning, bundle serving
    Plugin host                 apps/shell/src/renderer      bundle loading and panel registration
    Plugins                     packages/plugin-*            the actual functionality


## 2. Repository layout

    dyarchia-desktop/
        apps/
            shell/               Electron app (main, preload, renderer)
        packages/
            sdk/                 @dyarchia/sdk - contract types
            pysdk/               dyarchia_sdk - python plugin runtime
            plugin-sample/       minimal reference plugin
            plugin-terminal/     embedded terminal (xterm.js + node-pty)
            plugin-docviewer/    file tree + markdown rendering
            plugin-player/       audio/video player (dyarchia-media://)
            plugin-pyinfo/       reference plugin with a python main module
        scripts/
            ensure-runtime.mjs   first-run check of the electron and python runtimes
            install-plugins.mjs  copies plugins to %APPDATA%/dyarchia/plugins
        docs/
            plugins.md           how to write a plugin


## 3. Commands

Development. Opens a window with hot reload; in dev the shell discovers plugins directly
under packages/, taking priority over installed ones. Run pnpm build at least once first,
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


## 4. Persistence and paths

    Data                  Path
    ------------------    -------------------------------------------
    Layout (dev)          %APPDATA%/@dyarchia/shell/layout.json
    Layout (portable)     %APPDATA%/dyarchia/layout.json
    Installed plugins     %APPDATA%/dyarchia/plugins/<id>/


## 5. Debugging

With the DYARCHIA_DEBUG=1 environment variable, and always in dev, the shell exposes the
Chrome DevTools Protocol on port 9222. The renderer publishes the dockview API on
window.__dockApi for inspection.

Known note: dockview 8 logs a console error about the ContextMenu module of
dockview-enterprise. It is harmless — the free edition is warning that tab context menus
are a paid feature. Nothing in the shell is affected.
