# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev
```

Runs `electron-vite dev --watch` on the shell. **Run `pnpm install` then `pnpm build` at least once first**:
plugin `dist/` is gitignored and the shell loads `dist/renderer.js` even in dev, so a fresh
clone otherwise opens an empty window with no toggles.

```bash
pnpm build
```

`pnpm -r build` across the workspace. `@dyarchia/sdk` has no build script (types-only
package, `types: ./src/index.ts`) and is skipped.

```bash
pnpm --filter @dyarchia/plugin-terminal build
```

Rebuild a single plugin. The shell's `--watch` does not cover plugin sources — after
editing a plugin you must rebuild it and reload the window.

```bash
pnpm --filter @dyarchia/shell package
```

Portable Windows exe into `apps/shell/release/dyarchia-<version>.exe`.

```bash
node scripts/install-plugins.mjs
```

Copies each plugin's manifest + `dist/` (+ native deps listed in `NATIVE_DEPS`) into
`%APPDATA%/dyarchia/plugins/<id>/`, which is where the packaged app looks.

```bash
npx tsc -p apps/shell
```

Typecheck. Every `tsconfig.json` sets `noEmit: true` and no package wires a script for it,
so this is invoked by hand (`-p packages/plugin-terminal`, etc. for the others).

There is no test runner, linter or formatter in this workspace. Typecheck plus a manual
`pnpm dev` smoke test is the whole verification story.

## Architecture

The shell is an empty container; all functionality arrives as plugins discovered at runtime.
Adding or removing a feature never requires recompiling the shell.

**Discovery.** `apps/shell/src/main/plugins.ts` scans two roots: `packages/*` (dev builds
only) and `%APPDATA%/dyarchia/plugins/*`. Workspace wins, so an installed copy never shadows
the one under development. A folder is a plugin if it holds a valid `dyarchia-plugin.json`;
the first manifest to claim an `id` wins and later duplicates are skipped with a warning.

**Three layers, one file each:**

    Layer       File                                            Responsibility
    ---------   ---------------------------------------------   ------------------------------------
    main        apps/shell/src/main/plugins.ts                   discovery, dyarchia-plugin:// protocol,
                                                                 activate() of plugin main modules
    preload     apps/shell/src/preload/index.ts                  window.dyarchia = { invoke, on }
    renderer    apps/shell/src/renderer/src/plugins/host.ts      dynamic import() of each renderer
                                                                 bundle, calls activate(ctx)

Renderer bundles are served over the custom `dyarchia-plugin://<id>/<path>` protocol, which
is path-traversal guarded and registered as privileged before `app.whenReady()`.

**IPC namespacing** is applied on both sides and is invisible from either one alone. A plugin
writes short channel names; the shell prefixes them with `plugin:<id>:`. `ctx.handle('spawn')`
in a plugin main module registers `plugin:terminal:spawn`
([plugins.ts:156](apps/shell/src/main/plugins.ts:156)), and `ctx.invoke('spawn')` in that
plugin's renderer resolves to the same string
([host.ts:33](apps/shell/src/renderer/src/plugins/host.ts:33)). Never write the full channel
name inside a plugin.

**Panel registry.** `apps/shell/src/renderer/src/panels/registry.ts` is a module-level `Map`
plus a listener set — deliberately not React state, because plugins call `registerPanel()`
from outside the React tree. `App.tsx` subscribes via `onRegistryChange` and re-renders the
top bar. dockview owns the layout; `PluginPanel.tsx` is the only bridge into plugin code: it
calls `mount(container, handle)` on mount and the returned dispose on unmount.

Panel instance ids are `<baseId>#<n>` for duplicable panels. Always resolve through
`basePanelId()` before looking a panel up. On startup `App.tsx` prunes panels from the
restored layout whose plugin is no longer present, so a removed plugin cannot break the
saved layout.

**Terminal: MessagePort fast path.** The terminal does *not* stream through `ctx.invoke`.
`invoke('attach')` only negotiates a channel: the main module
([plugin-terminal/src/main.ts:21](packages/plugin-terminal/src/main.ts:21)) creates a
`MessageChannelMain`, gives one port to the pty host and sends the other to the renderer over
the shell-level `dyarchia:port` channel, which preload re-emits as a `window.postMessage`
([preload/index.ts:16](apps/shell/src/preload/index.ts:16)); the renderer matches it by
`attachId` and takes ownership of the port. This is the one place the SDK contract is
bypassed, and it is intentional — per-keystroke and per-frame traffic must not go through
`ipcRenderer.invoke`.

The pty itself lives in a separate `utilityProcess` (`dist/ptyhost.cjs`), VS Code style, so a
crash or a blocking native call cannot take down the main process. It owns flow control
(pause the pty above 100k unacked chars, resume below 5k), output coalescing (5 ms / 128k
flush), and a 1 MB scrollback buffer that is replayed on reattach. Sessions therefore survive
a panel being closed and reopened; the renderer must send `{t:'detach'}` rather than killing
the session on dispose.

**Custom protocol schemes.** A plugin that serves its own scheme (the player serves
`dyarchia-media://`) declares it in `schemes` in the manifest. Electron requires
`registerSchemesAsPrivileged` before `app.whenReady()`, so manifests are read twice: once
synchronously at boot to collect scheme names, once asynchronously during real discovery
([plugins.ts:38](apps/shell/src/main/plugins.ts:38) and
[:91](apps/shell/src/main/plugins.ts:91)). Reserved names (`http`, `file`,
`dyarchia-plugin`, …) are rejected. The plugin's main module registers the actual handler
with `protocol.handle` in its `activate`.

See [docs/plugins.md](docs/plugins.md) for the plugin-authoring walkthrough (manifest fields,
`activate` contract, esbuild flags, lifecycle) — do not duplicate it here.

## Conventions

- 4-space indent, no semicolons, single quotes, no comments in source. Code and identifiers
  in English.
- ESM throughout (`"type": "module"` everywhere). The pty host is the sole CJS bundle,
  because `utilityProcess.fork` requires it.
- Prose docs (`README.md`, `docs/`) are written in Spanish following ioclaudius-md
  conventions: headings, bullets, mermaid, and **ASCII tables — never markdown pipe tables**.
- Native dependencies stay `--external` in esbuild and must be added to `NATIVE_DEPS` in
  [scripts/install-plugins.mjs](scripts/install-plugins.mjs), otherwise the packaged app will
  fail to load that plugin's main module. Library CSS is bundled as text
  (`--loader:.css=text`) and injected by the plugin into a `<style>` tag.
- `DYARCHIA_DEBUG=1` (implicit in dev) opens the Chrome DevTools Protocol on port 9222 and
  enables F12. The renderer publishes the dockview API on `window.__dockApi`.
- dockview 8 logs a console error about the enterprise `ContextMenu` module. It is harmless
  and expected.
