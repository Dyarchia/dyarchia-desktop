# Writing a Dyarchia plugin

A plugin is a folder holding `dyarchia-plugin.json` and its bundles. The shell discovers it at
startup; the workspace copy wins over `~/.dyarchia/plugins/<id>/`. The visual mandate is
[packages/kanon/README.md](../packages/kanon/README.md).

## Manifest

    Field         Holds
    -----------   ---------------------------------------------------------------------
    id            lowercase slug, the IPC namespace; the first manifest to claim it wins
    name          the display name; version is semver
    renderer      required: the ESM bundle, usually dist/renderer.js
    main/python   a Node module in the main process, or a main.py process; never both
    channels      a Python plugin's channels; declared, its interpreter starts lazily
    boot          start the Python interpreter at launch instead of on first invoke
    schemes       custom protocol schemes the plugin serves; reserved names are rejected
    description   one line shown in the Setup panel
    toolbar       its key's place in the title bar, from 1; omitted, it goes last
    data          one folder name under the data home, shown by Setup before install
    requires      command, binary or python requirements Setup checks or installs
    files         anything else needed at runtime, copied by stage-plugins.mjs
    nativeDeps    packages copied with their prebuilt binaries into node_modules/

## Renderer

An ESM module exporting `activate(ctx)`, in plain DOM: the shell's framework is not part of the
contract. `mount` returns a dispose that releases observers, `on()` subscriptions and sessions.

```typescript
import { glyph, injectStyles, type PluginContext } from '@dyarchia/sdk'

export function activate(ctx: PluginContext): void {
    ctx.registerPanel({ id: 'myplugin', title: 'My plugin', icon: ICON }, (container, handle) => {
        injectStyles(ctx.pluginId, STYLES)
        const key = document.createElement('button')
        key.className = 'dya-key'
        key.innerHTML = glyph('folder')
        const off = ctx.on('changed', (value) => handle.setTitle(String(value)))
        key.onclick = async () => {
            const file = (await ctx.invoke('pick')) as string
            if (ctx.shell.canOpen(file)) await ctx.shell.open({ path: file })
            else await ctx.shell.reveal(file)
        }
        container.append(key)
        return () => { off(); key.remove() }
    })
    ctx.registerOpener({ panelId: 'myplugin', extensions: ['.log'] }, (req) => show(req.path))
}
```

- `icon` is a black and white mark, solid shapes, `aria-hidden`; a brand keeps its own. An icon key
  is `glyph()` plus a tip from `tips(holder)`, never a local SVG, a spelled verb or a `title`.
- `duplicable` allows `<id>#<n>` instances, `keepAlive` keeps a covered panel mounted, `width` and
  `maxWidth` size its column and content, `modal` opens it over the window instead of the dock.
- Actions go in `handle.toolbar`. `registerOpener` goes in `activate`; the first opener per
  extension wins. A finder never names the reader: it asks `ctx.shell.canOpen`, else `reveal`.
- `ctx.registerCommand({ id, title, icon?, run })` joins the Ctrl+K palette and returns its removal.
  `ctx.token(name)` resolves a `--dya-*` value; `ctx` also has `highlight`, `hues` and `when`.

## Main module

Node, ESM, exporting `activate(ctx)` with `handle`, `broadcast` and `notify({ title, body })`;
`ctx.dataHome` is where what a plugin makes for the user goes, `~/.dyarchia/data`.
Channels are short names the shell prefixes: `ctx.handle('spawn')` registers `plugin:<id>:spawn`,
which `ctx.invoke('spawn')` reaches. Never write the full name. Edits need an app restart.

## Python plugins

`"python": "main.py"` runs one interpreter per plugin with `packages/pysdk` (stdlib only). The
shell speaks JSON lines over stdio; invokes run in a thread pool and are correlated by id.
stdout is the protocol, so `print` goes to stderr. The process gets `DYARCHIA_USER_DATA`,
`DYARCHIA_DATA_HOME` and `DYARCHIA_PLUGIN_ENV`. `activate(ctx)` has the same three methods.

## Build

`node ../../scripts/build-plugin.mjs renderer|main` holds the esbuild call. `--css-text` bundles
library CSS as text for `injectStyles`; `--splitting` emits chunks for a dynamic `import()`.
Native dependencies stay `--external` and must be listed in `nativeDeps`, or the packaged app
cannot load the main module. `main.py` is copied as is.

## Storage

Never beside the plugin's code, which is read-only once packaged. `ctx.shell.paths()` gives
`userData` (`~/.dyarchia`) for what can be rebuilt and `dataHome` (`~/.dyarchia/data`, in the
folder named by `data`) for what the user would miss.

## Kanon

Every `dya-*` class and `--dya-*` token is already in the document. Use them. A plugin's own
prefixed CSS is layout inside its panel and nothing else: no colour, component, elevation or
type step. Anything new is declared in `packages/kanon` first, measured on every ground and
written in its README, and only then used. Panel interiors are transparent.

## Offering a tool to agents

Plugins never import each other. A plugin that can serve an MCP tool writes
`<userData>/mcp/<id>.json` (`plugin`, `server`, `command`, `args`, `env`, `tools` with `name`
and `note`) while it can serve it and deletes it when it cannot. A plugin that launches agents
reads the folder and skips an offer whose `command` is gone. A Python offerer sets `"boot": true`.
