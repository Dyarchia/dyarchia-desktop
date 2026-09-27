# Dyarchia desktop

**ALPHA — 0.4.2-alpha. Not a release. Expect breakage, and do not keep anything here that
you cannot afford to lose.**

## 1. What it is

- An Electron shell (Vite, React, TypeScript, dockview) that starts empty: every feature is a
  plugin discovered at runtime, with its own draggable, resizable, persistent panels.
- Four plugins always load: Setup, the terminal, the reader and the player. kanban, crawlee
  and the browser reach outside for something and are a choice made in Setup, which says
  what each will download and where it will write.
- kanban drives real agent CLIs that spend real money; read `plugins/kanban/README.md` first.
- The look is kanon, the design system in `packages/kanon`.
- Writing a plugin: [docs/plugins.md](docs/plugins.md).

## 2. Install

- Download the installer from the newest GitHub prerelease.
- It is unsigned, so Windows SmartScreen warns about an unknown publisher.
- It installs for one user into `~/.dyarchia/app`, without elevation, and later updates
  install over it. Only the newest prerelease exists, and nothing promises the on-disk
  formats survive the next one.

## 3. Build from source

```bash
pnpm install
pnpm build
pnpm dev
```

- Run `pnpm build` before the first `pnpm dev`: plugin `dist/` is not versioned.
- `pnpm dev` loads every plugin from `plugins/`; `DYARCHIA_SETUP=1` reproduces a first run.
- Typecheck by hand per package: `npx tsc -p apps/shell`.

Windows installer, into `apps/shell/release/`:

```bash
pnpm --filter @dyarchia/shell package
```

## 4. Contributing

**Every change arrives as a pull request against `develop`.**

- `master` is the released state, `develop` integrates, work happens on `feature/*` cut
  from `develop` before the first edit and deleted after it merges.
- Merges are `--no-ff`. Commit messages are in English and explain why.

## 5. Releases

```bash
node scripts/release.mjs --publish
```

- Run from a clean `master`; without `--publish` it only prints what it would do.
- It tags, opens the prerelease first, builds and uploads into it, and prunes older
  releases only after verifying the new one. Tags are never deleted.

## 6. Data

- `~/.dyarchia` is the one root this application writes to; `DYARCHIA_HOME` moves it.
- `~/.dyarchia/data/` holds the user's own material, such as crawlee corpus repositories.
- Everything else under the root is machine state (layout, enabled plugins, Python
  environments) and can be deleted without losing anything that cannot be rebuilt.

## 7. Keyboard

    Keys                          Effect
    ---------------------------   ----------------------------------------------
    Ctrl + = / Ctrl + -           zoom in / out
    Ctrl + 0                      reset zoom
    Ctrl + Tab / Ctrl + Shift+Tab next or previous panel in the group
    Ctrl + W                      close the panel, unless a terminal has focus
    Ctrl + ,                      open Setup
    F12                           DevTools, in dev or under DYARCHIA_DEBUG=1

## 8. Licence

MIT, see [LICENSE](LICENSE). Crawlee for Python (Apify, Apache-2.0) and FFmpeg
(GPL-3.0-or-later) are fetched by Setup, not redistributed. [NOTICE.md](NOTICE.md) lists
every third-party component.
