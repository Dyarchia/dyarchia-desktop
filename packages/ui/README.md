# @dyarchia/ui

Vendored copy of the shared dyarchia design system: two themes, one typeface,
one grammar of relief. No build step, no dependencies.

    Path              What it is
    ---------------   -----------------------------------------------
    css/dyarchia.css  single entry point, imports the four below
    css/fonts.css     the two Geist @font-face declarations
    css/tokens.css    both themes, every --dya-* custom property
    css/reset.css     normalisation, focus, scrollbars, reduced motion
    css/motion.css    four keyframes
    fonts/            Geist Sans and Geist Mono variable, 140 KB
    src/index.ts      theme helpers for code that needs literal values

The shell links the stylesheet once, in `apps/shell/src/renderer/src/main.tsx`.
Every plugin renders into that same document, so the tokens are ambient: a
plugin never imports CSS from here, it just reads `var(--dya-*)`.

`src/index.ts` exists for the rare case that needs a resolved colour rather than
a `var()` — a canvas, WebGL, or xterm's theme object:

```typescript
import { getTheme, onThemeChange, setTheme, token } from '@dyarchia/ui'

const background = token('bg')
const dispose = onThemeChange(() => repaint())
```

Plugins get the same three operations through `ctx.theme` and do not need to
depend on this package.

## Provenance and sync

Upstream is the `dyarchia-ui` repository. `css/` and `fonts/` are copied
verbatim and must never be edited here — fix them upstream and re-sync:

```bash
node scripts/sync-ui.mjs
```

The script reads `DYARCHIA_UI` for the upstream checkout, falling back to
`../dyarchia-ui` next to this repository.
