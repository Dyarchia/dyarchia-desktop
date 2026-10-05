# dyarchia-kanon

The shared visual system: CSS tokens, `dya-*` classes and three OFL families, no build, no JavaScript. This
file is the authority over the CSS; a change's before and after is its commit body. `css/dyarchia.css`
imports, in order, `fonts`, `tokens` (black metal, the default, on `:root`), the themes, `reset`, `motion`
and `components`; all prefixed `dya-`, `prefers-color-scheme` never read. **A theme** is
`css/themes/<id>.css`, `:root[data-theme="<id>"]` redefining only what it changes, listed in `THEMES`
(`src/index.ts`) and shipped only measured: `tools/contrast.py --theme <id>`, its own peaks included.

## Materials

```text
glass   the panel only: dark metal a shade under the ground, the light passing through, a chrome rim
key     every control: a near-black face under a light rim, a hard 3px edge that drops 2px pressed;
        a key that is on stays up and is lit, an orange-purple-blue arc travelling its rim;
        a tab's own keys carry no rim, the tab being their frame
pill    every piece of information: round, words in the sans; never pressable
light   status only: a green, yellow or red dot, or a hollow top-ink ring for what is under way
```

Black metal is black and white, and one light. One black in three roles: `ground` #0c0c0e, `panel` #131316
(every face), `field` #0e0e11 (input, code, a log); `hover`, `selected`, `disabled` and `scrim` are the other
steps. A cold clear light (`--dya-light-in`) comes in at two corners, dead within a quarter of the diagonal. The
accent is silver: the primary's passing light, the open tab's line, the focus ring. Nothing glows. Two inks,
`text` and `text-muted`; a glyph is `text`, a Dyarchia mark `text`, `text-muted` and `on-accent`, a brand's mark
its own. Spectral the brand, Inter the interface (tabular figures), Plex Mono paths and code.

## Rules

- **Six colours and no others**, blue, purple, orange, green, yellow and red, each a light `--dya-<name>`
  and an `-ink` for text, lifted by `tools/palette.py`. **Green is success, yellow warning, red error,
  always.** Blue, purple and orange are the only categorical hues (`hue--<name>`, from `ctx.hues`): a dot
  beside a name, a glyph or the lit rim of a key that is on, never a pill's word, a fill or a dot inside a
  pill. A pill that informs is neutral. **Plugins have no hue.** A ticked `checkbox` is the top ink.
- **An ink under 4.50 is not text**, above 3.00 it may be a graphic; `text-muted` is 4.61 at the least,
  `text-off` is exempt. Measure with `tools/contrast.py <suffix>`, peaks included, into the commit body.
- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Round is information, square is action; colour is status or which-one, never emphasis.** **Pressable is
  raised, information is flat.** Every control is a key. Content that opens when pressed (a lifted card, an
  entry, a row, a file, a menu row, a tab) stays flat and answers with its ground.
- **Hover changes the background and the border, never the shadow**; a transition names only `transform`,
  `opacity` and `background-color`; the focus ring is an outline.
- **Two things move for as long as they last**: the lit rim of a key that is on (`--dya-dur-orbit`, arc 5.50
  at the least), and the primary's sheen, crossing in the first 35% of `--dya-dur-sheen` by transform alone.
- **Interface text is sentence case; data keeps its own case.** Capitals are the eyebrow's, the table head's
  and the section row's alone, in the top ink; a date in a section row is a `meta`.
- **Scale** body 15, rows 14, controls and meta 13px, prose 72ch. **Radii** 3px key, field, menu row; 6px menu;
  8px card; 12px panel, sheet; 999px pill, dot. **Weights 300, 400, 500.** No WebGL, shaders or `backdrop-filter`.
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **One height**: every single-line control (button, key, chip, select, field, a tab's actions, the window's
  keys) is `--dya-size-control`, 28px. Only a textarea grows. There is no small size.
- **Keys side by side are one strip**: `join` sets controls edge to edge, inner corners square, the shared
  rim as the divider, one edge under the whole. A field and its keys are a join, the field on the key's rim
  and filling the row. Adjacent icon keys in a `toolbar` join on their own.
- **One primary per view**: `--primary`, a black key under an ordinary rim, its face crossed by `--dya-sheen`
  (top ink 15.96 on the face, 12.81 at the band's peak). `key--success` is lit green; `--danger` turns red
  only under pointer or focus. **A state a person answers is one key**: `button--resolve`, red, green answer.
- **A row's own key shows when the row is looked at**: `reveal` in a `reveals` row, unpressable until hover or
  focus; `reveal--held` keeps the key a row cannot be left without. A chip may lead with a 15px glyph.
- **A tip exists only on an icon-only key**, one or two words, never a word already on screen beside it. A
  label, a pill and a key that spells anything have none; the SDK's `tips()` refuses them.
- **Pills never touch the next line**: a pill row and what follows stand in a `stack`, 8px apart. A
  `sheet__head` is the title, a status pill (never a key) and the `__end` strip, one line at control height.
- **A list of files is `files`**: `file` rows of glyph and mono `__name`, one line, ellipsis, flat hover,
  `aria-current` on `selected`, never a column of keys. **A list inside a form is flat rows**, never a box.
- **A panel measures itself** as a `pane` (`@container pane`), never a media query: width changes how many
  regions it shows, never how far things stretch. `grid` is a gallery of fixed-width things, `tile--new`
  first; table columns are content width; `form` values up to 560px. Actions live in `handle.toolbar`.
- **What opens in place is a `fold`**: `details.fold`, a `__head` summary led by `__mark`, the SDK chevron
  turned down while open, only where nothing else says it opens. **One scroller per region**: nothing in a
  region that scrolls scrolls again; a code block wraps (`code--wrap`); a live log is sized by a handle.
- **`title`** is the carved Spectral at 25px (11.36, 4.61 at card-peak); only a `stat` is larger. **`palette`**
  (Ctrl+K, the launcher key) is the one way in: app tiles, open lit green, pinned first (Ctrl+P pins), over
  rows: commands, then what plugins find, `__meta` muted. **A lane or a chip answers a drag**: `--accept` the accent's
  soft ground, `--refuse` red's (text-muted 4.52 at peak).

## Components

```text
Structure    pane bar (--flush --inset __group) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead carved (--bar) splitter stack
             sheet (--side --modal __head __end) well lanes lane (--accept --refuse) drop-line drop-box grid toolbar
Keys         button (--primary --danger --resolve __state __answer) key (--active --success --danger)
             chip (--accept) join tile (--dense --new __icon __head __name __note) winkey (--close) reveal (--held) reveals
Input        field (--auto --prose __label) select checkbox (:indeterminate) form (__value __stack __split __actions)
Pills        tag pills badge light (both --success --warning --danger --busy) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (__num __fit __name __subject __end __prose __section) row (--selected) files file (__name)
             stat (__figure __value __unit __text) title text (--success --warning --danger)
             label eyebrow value name meta (--sm --lift --wrap) mono key-label (--leave) problem (--box)
             entry (--row __head __text __body; aria-current) notice (__body __title __text)
             steps step (--said --error --warning --quiet __time __verb __subject (--code) __said __detail)
Documents    prose (__figure) prose__scroll code (--wrap __line --at __<highlight.js scope>) editor terminal log math (--block)
Layers       menu (__search __list __group __text __note __arrow __empty) menu__item (--selected --active --tall) tip scrim
             palette (__body __apps __app __pin __list __row __icon __name __meta)
Navigation   tabs tab (--dock __action --close)   Absence  empty (__actions) loading
```
