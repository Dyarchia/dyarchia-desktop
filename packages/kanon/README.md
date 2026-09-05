# @dyarchia/kanon

Vendored copy of the shared dyarchia design system: one dark theme, two IBM Plex
families, one grammar of relief, and a layer of `dya-*` component classes. No build
step, no dependencies.

    Path                What it is
    -----------------   ---------------------------------------------------
    css/dyarchia.css    single entry point, imports the five below
    css/fonts.css       the six IBM Plex @font-face declarations
    css/tokens.css      the theme, all 105 custom properties
    css/reset.css       normalisation, focus, scrollbars, reduced motion
    css/motion.css      four keyframes
    css/components.css  the dya-* classes
    fonts/              IBM Plex Sans Condensed and Mono, six static woff2
    src/index.ts        token(), for code that needs a resolved value

The shell links the stylesheet once, in `apps/shell/src/renderer/src/main.tsx`. Every
plugin renders into that same document, so both layers are ambient: a plugin never
imports CSS from here, it writes `class="dya-button"` and reads `var(--dya-*)`.

There is nothing to switch on. One theme, the root carries no attribute, and the CSS
never consults `prefers-color-scheme`.

`src/index.ts` exists for the rare case that needs a resolved colour rather than a
`var()` — a canvas, WebGL, or xterm's theme object:

```typescript
import { token } from '@dyarchia/kanon'

const background = token('surface-1')
```

Plugins get the same operation through `ctx.token` and do not need to depend on this
package.

## Components

Reference the classes; do not redefine them. A product that restyles `.dya-button` has
forked the system.

    Structure    dya-panel  dya-bar (--flush)  dya-dock  dya-card
                 dya-card__header  dya-card__body  dya-rule  dya-brand
    Pressable    dya-button (--quiet --sm --danger)  dya-key  dya-chip  dya-item
                 dya-entry (--strong --active)
    Input        dya-field  dya-toggle  dya-checkbox  dya-radio  dya-slider
    Content      dya-tag  dya-badge  dya-table  dya-row  dya-metric  dya-display
                 dya-heading  dya-text  dya-label  dya-eyebrow  dya-value  dya-mono
                 dya-key-label
    Layers       dya-menu  dya-menu__item  dya-tooltip
    Navigation   dya-tabs  dya-tab  dya-pagination
    Absence      dya-empty  dya-loading  dya-skeleton

`components.css` contains no literal colour, radius or duration. Every rule resolves to
a token, so a change to `tokens.css` reaches every component.

## Provenance and sync

Upstream is the `dyarchia-kanon` repository. `css/` and `fonts/` are copied verbatim and
must never be edited here — fix them upstream and re-sync:

```bash
node scripts/sync-kanon.mjs
```

`predev`, `prebuild` and `prepackage` already run it, so this is only needed to refresh
an app that is already running. The upstream checkout is found by walking up from the
repository looking for a `dyarchia-kanon` folder; `DYARCHIA_KANON` overrides.

`src/index.ts` is the one file here that is not upstream's. It is the desktop's own
binding and the sync never touches it.
