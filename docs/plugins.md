# Writing a dyarchia-desktop plugin

Guide to building a new feature and registering it with the shell. A plugin is a folder
holding a manifest and one or two JavaScript bundles; the shell discovers it at startup.


## 1. Anatomy of a plugin

    File                       Required    What it is
    -----------------------    --------    ------------------------------------------
    dyarchia-plugin.json       yes         manifest: identity and entry points
    dist/renderer.js           yes         ESM bundle that runs in the renderer
    dist/main.js               no          Node module that runs in the main process
    main.py                    no          Python module that runs as its own process
    node_modules/              no          native dependencies of the main module

The manifest:

```json
{
    "id": "myplugin",
    "name": "My Plugin",
    "version": "0.1.0",
    "renderer": "dist/renderer.js",
    "main": "dist/main.js"
}
```

Manifest rules:

- id is lowercase, pattern ^[a-z][a-z0-9-]*$. It is the namespace of the IPC channels.
- renderer is required; main only if the plugin needs Node (fs, processes, native modules).
- python is an alternative to main. A plugin declares main or python, never both. The
  renderer cannot tell the difference: it uses invoke and on the same way for either.
- If two plugins declare the same id, the first one discovered wins and the rest are ignored.
- schemes (optional): list of custom protocol schemes the plugin wants to serve, for media
  streaming for instance. The shell declares them as privileged at boot (standard, secure,
  fetch, cors, stream) and the plugin's main module registers the handler with
  protocol.handle inside its activate. Lowercase names; reserved ones (http, file,
  dyarchia-plugin, and so on) are rejected.


## 2. The renderer bundle

An ESM module exporting activate(ctx). The context offers:

    Method                        Use
    --------------------------    ------------------------------------------------
    registerPanel(desc, mount)    registers a panel with the shell
    invoke(channel, ...args)      calls a handler in the plugin's main module
    on(channel, listener)         subscribes to broadcasts from the main module
    token(name)                   resolves a --dya-* custom property to its value

The SDK also exports one function, outside the context:

    injectStyles(pluginId, css)   adds the plugin's style tag once, id
                                  dyarchia-<pluginId>-styles, ignored on later calls

Call it at the top of the mount rather than at module scope, so a plugin that is never
opened never touches the document.

The mount receives the panel's DOM container and optionally returns a cleanup function:

```typescript
import type { PluginContext } from '@dyarchia/sdk'

export function activate(ctx: PluginContext): void {
    ctx.registerPanel({ id: 'myplugin', title: 'My Plugin', icon: 'M' }, (container) => {
        const el = document.createElement('div')
        el.textContent = 'hello'
        container.appendChild(el)
        return () => el.remove()
    })
}
```

Notes:

- The renderer is plain DOM. This is a rule, not an observation; see below.
- icon is the content of the toggle button in the top bar: inline SVG markup, recommended,
  such as a Lucide icon with stroke="currentColor"; or, as a fallback, a short
  one-character string.
- duplicable: true allows several instances of the panel, through a + button in the group
  header. Each instance gets its own mount/dispose; the internal instance id is <id>#<n>,
  but the plugin never needs to handle it.
- Markup reaches for the system's classes first. The shell links the shared design system
  once, so every dya-* component class is already in the document: a panel writes
  class="dya-button" rather than declaring a button. A plugin style tag is for what the
  system has no class for, and what goes inside it is not free either — every --dya-*
  token is resolvable and a plugin must never write a literal colour, font or radius, nor
  restyle a dya-* selector. See docs/ui.md for the order, the class list and the rules.
- ctx.token covers the case that var() cannot: a canvas, a WebGL context or xterm needs a
  resolved string. token('accent') and token('--dya-accent') both return the value. A
  theme redefines colour tokens and never rules, so there is nothing to branch on and
  nothing to subscribe to.


### The framework rule

**A renderer is written in plain DOM. The shell's own framework is not available to it and
must not be assumed.**

The shell is React and dockview. That is an implementation detail of the shell, it is not
exported, and no version of it is part of the contract. What a plugin gets is
`mount(container, handle)`: a DOM node, and a function to call when the panel goes away.

The contract is that small deliberately, and it buys three things:

- **A main module can be written in any language.** The renderer cannot tell whether the
  other side is Node or Python, because the boundary is `invoke`/`on` and not a framework's
  data flow. Widen the contract to include a component model and that stops being true.
- **The shell can change without breaking plugins.** React, dockview and the panel host can
  be replaced wholesale as long as a DOM node still arrives. Export React and every plugin
  is married to the shell's React version for as long as the product lives.
- **Nothing owns a plugin's lifecycle but the plugin.** `mount` returns its own teardown.
  There is no reconciler above it deciding when its subtree exists.

A plugin may still bundle a framework — nothing prevents it, and for a genuinely stateful
panel it can be the right call. It is not free, and the cost is the plugin's to carry:

- A second copy of that framework in the bundle, on top of the shell's. Two React instances
  in one document is a supported but real cost, in bytes and in memory.
- The plugin owns unmounting it inside the `dispose` it returns. The shell calls `dispose`
  and nothing else.
- The plugin owns its own build complexity. The shared build script targets plain DOM.

Before reaching for one, note what the plain path already gives. The design system is
linked once into the document, so every `dya-*` class is available with no import: the work
a component library would do for a button, a field, a table or a menu is already done, and
`docs/ui.md` lists what exists. Four of the five plugins in this workspace render real UI
with `document.createElement` and no framework, and the largest of them is a terminal.

## 3. The main module (optional)

An ESM module for Node exporting activate(ctx) with:

    Method                         Use
    ---------------------------    --------------------------------------------------
    handle(channel, handler)       answers invoke calls from the renderer
    broadcast(channel, ...args)    emits an event to every window

Channels namespace themselves: a handle('spawn') in the terminal plugin becomes
plugin:terminal:spawn at the IPC level. The renderer and the main module of the same plugin
use the same short channel name.

```typescript
import type { PluginMainContext } from '@dyarchia/sdk'

export function activate(ctx: PluginMainContext): void {
    ctx.handle('greet', (...args) => `hello ${args[0]}`)
}
```


## 4. The main module in Python (optional)

An alternative to main, for logic better written in Python. The contract is the same as the
Node one, with snake_case names:

    Method                        Use
    --------------------------    --------------------------------------------------
    handle(channel, handler)      answers invoke calls from the renderer
    broadcast(channel, *args)     emits an event to every window

```python
def activate(ctx):
    ctx.handle("greet", lambda name: f"hello {name}")
```

How it works underneath:

- The shell spawns one Python process per plugin and talks to it over stdin/stdout in JSON,
  one message per line. The process dies when the app closes.
- Invokes run in a thread pool and are correlated by id, so a slow handler blocks nothing
  and replies may arrive out of order.
- stdout is reserved for the protocol: inside the plugin, print goes to stderr and shows up
  in the shell console prefixed with [python:<id>].
- The interpreter is looked up as py -3 on Windows and python3 elsewhere. The
  DYARCHIA_PYTHON environment variable forces a specific path.

The runtime lives in packages/pysdk (dyarchia_sdk) and is stdlib only: nothing to install
with pip. The layer is deliberately thin — context.py is the contract, host.py is the stdio
transport, and only the transport changes the day an API tier owns this logic. No plugin
activate and no renderer code is affected.


## 5. Build and installation

Bundles are built with esbuild, ESM format. The renderer is served over the
dyarchia-plugin:// protocol and the main module is imported as a Node module from the
plugin folder.

```json
"scripts": {
    "build": "pnpm build:renderer && pnpm build:main",
    "build:renderer": "node ../../scripts/build-plugin.mjs renderer",
    "build:main": "node ../../scripts/build-plugin.mjs main"
}
```

[scripts/build-plugin.mjs](scripts/build-plugin.mjs) holds the esbuild invocation for every
plugin, so format, externals and output paths are decided once. It takes the entry to
build and two optional flags:

    Flag           Effect
    -----------    ----------------------------------------------------------
    --splitting    emits the entry plus chunks into dist/, for dynamic import()
    --css-text     loads .css imports as text, for a library stylesheet

A plugin with a need outside those two writes its own esbuild line rather than growing a
third flag. The terminal does exactly that for its pty host, which is CJS and has a native
external, and it is the only such case.

Build rules:

- Native dependencies such as node-pty are marked external and copied into node_modules/
  inside the installed plugin folder; everything else is bundled.
- Library CSS is imported as text (--css-text) and handed to injectStyles.
- The Python module is not bundled: main.py is copied as-is next to the manifest.
- A heavy dependency that only some documents need goes behind a dynamic import(), and
  the renderer is then built with --splitting --outdir=dist instead of --outfile.
  esbuild emits the entry plus its chunks, the dyarchia-plugin:// protocol serves them
  relative to the entry, and install-plugins.mjs already copies dist/ recursively.
  docviewer does this for mermaid: the entry is 8 kB and the diagram engine is only
  fetched when a document actually carries a diagram.

Where a plugin lives, by mode:

    Mode         Location                                   How it gets there
    ---------    ---------------------------------------    ---------------------------------
    dev          packages/<folder>/                         the shell scans the workspace
    example      examples/<folder>/                         scanned only with DYARCHIA_EXAMPLES
    portable     %APPDATA%/dyarchia/plugins/<id>/           node scripts/install-plugins.mjs

examples/ holds the reference plugins: sample, the smallest activate that registers a
panel, and pyinfo, the only exercise of the Python main module and of broadcast. They are
not discovered by default, because a reference does not need to run to be read, and a
shell that ships an empty demo panel is worse than one that does not. To run them:

```bash
DYARCHIA_EXAMPLES=1 pnpm dev
```

install-plugins.mjs never copies them, so they cannot reach the packaged app. If one was
installed before it moved, the installed copy is still discovered and now wins, since
nothing in packages/ shadows it any more; delete it from %APPDATA%/dyarchia/plugins/.

In dev the workspace takes priority over installed plugins, so an installed copy never
shadows the version under development.


## 6. Lifecycle

```mermaid
flowchart TD
    A[Shell startup] --> B[Discovery: read manifests]
    B --> C[activate of main modules]
    C --> D[Renderer: import the bundle<br/>over dyarchia-plugin://]
    D --> E[activate of the renderer:<br/>registerPanel]
    E --> F[Toggle in the top bar]
    F -- "click" --> G[mount into the DOM container]
    G -- "panel closed" --> H[dispose]
```

- The layout persists itself; if a saved panel no longer has a plugin at startup, the shell
  prunes it from the layout without failing.
- dispose must release everything: observers, on() subscriptions, sessions opened via invoke.


## 7. Checklist for a new plugin

1. A folder under packages/ with a valid dyarchia-plugin.json.
2. renderer.ts with an activate that registers at least one panel, in plain DOM. If it
   bundles a framework instead, the dispose it returns unmounts that framework, and the
   reason it was needed is written in the plugin's README.
3. Build scripts that call scripts/build-plugin.mjs, producing dist/.
4. pnpm dev, then check that the toggle appears and the panel mounts and unmounts with no
   console errors. Rebuild the plugin after every edit: a renderer change needs a window
   reload, a main module change needs the app restarted, because main modules are
   imported once at startup and their ipcMain handlers are registered there.
5. Walk every state of the panel: idle, hover, pressed, selected, empty, error. Nothing
   declares what a dya-* class already declares. The rest of the gate is in docs/ui.md.
6. If there is a main module, whether Node or Python: test invoke and broadcast from the
   panel.
7. node scripts/install-plugins.mjs, then test in the packaged app too.
