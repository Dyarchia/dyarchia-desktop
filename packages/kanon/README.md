# dyarchia-kanon

The shared visual system: CSS tokens, `dya-*` classes and three OFL families, with no build and no
JavaScript. This file is the authority over the CSS; the before and after of a change is its commit body.
Tokens precede what consumes them; everything is prefixed `dya-`; `prefers-color-scheme` is never read.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the @font-face declarations
css/tokens.css       the one theme, black metal, on :root
css/reset.css        normalisation, [hidden], the ground, focus ring, scrollbars, reduced motion
css/motion.css       the keyframes
css/components.css   the dya-* classes
fonts/               Inter 300-500 variable, Plex Mono 400/500, Spectral 300/500
tools/               contrast.py measures, palette.py lifts the six colours to lights and inks
```

## Materials

```text
glass   the panel only: dark metal a shade under the ground, the light passing through, a chrome rim
key     every control: a near-black face under a light rim, a hard 3px edge that drops 2px pressed
pill    every piece of information: round, words in the sans; never pressable
light   status only: a green, yellow or red dot, or a hollow top-ink ring for what is under way
```

Black and white, and one light. One black in three roles: `ground` #0c0c0e, `panel` #131316 (a key's face,
a tile, an entry, a menu, a sheet), `field` #0e0e11 (input, code, a log); `hover`, `selected`, `disabled`
and `scrim` are the only other steps. A cold clear light (`--dya-light-in`) comes in at two corners and dies
within a quarter of the diagonal. The accent is silver: the primary's rim, the open tab's line, the focus
ring. A plugin's mark keeps its brand's original colours. Nothing glows. Two inks, `text` and `text-muted`; every
glyph is `text`. Spectral is the brand, Inter the interface with tabular figures, Plex Mono paths and code.

## Colour and contrast

- **Six colours and no others**: blue, purple, orange, green, yellow, red; a light `--dya-<name>`, an `-ink` for text.
- **Green is success, yellow warning, red error, always.** Blue, purple and orange are the only categorical
  hues (`hue--<name>`, from `ctx.hues`): a dot beside a name or a glyph, never a pill's word, a fill or a
  dot inside a pill. A pill that informs is neutral. **Plugins have no hue.** A ticked `checkbox` is the top ink.
- **An ink under 4.50 is not text**, above 3.00 it may be a graphic; `text-muted` is 4.61 at the least,
  `text-off` is exempt. Measure with `tools/contrast.py <suffix>`, peaks included, into the commit body.

## Rules

- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Round is information, square is action; colour is status or which-one, never emphasis.** **Pressable is
  raised, information is flat.** Every control is a key. Content that opens when pressed (a lifted card, an
  entry, a row, a file, a menu row, a tab) stays flat and answers with its ground.
- **Hover changes the background and the border, never the shadow**; a transition names only `transform`,
  `opacity` and `background-color`; the focus ring is an outline.
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
- **One primary per view**: `--primary`, the black key under the accent rim (13.34 on the face, 10.49 at
  glass-peak), top-ink word. `key--success` is lit green; `--danger` turns red only under the pointer or
  focus. **A state a person answers is one key**: `button--resolve`, red state, green answer.
- **A tip exists only on an icon-only key**, one or two words, never a word already on screen beside it. A
  label, a pill and a key that spells anything have none; the SDK's `tips()` refuses them.
- **Pills never touch the next line**: a pill row and what follows stand in a `stack`, 8px apart. A
  `sheet__head` is the title, a status pill (never a key) and the `__end` strip, one line at control height.
- **A list of files is `files`**: `file` rows of glyph and mono `__name`, one line, ellipsis, flat hover,
  `aria-current` on `selected`, never a column of keys. **A list inside a form is flat rows**, never a box.
- **A panel measures itself** as a `pane` (`@container pane`), never a media query: width changes how many
  regions it shows, never how far things stretch. `grid` is a gallery of fixed-width things, `tile--new`
  first; table columns are content width; `form` values up to 560px. Actions live in `handle.toolbar`.
- **One scroller per region**: nothing inside a region that scrolls scrolls again, and text in a code
  block wraps (`code--wrap`) rather than scrolling sideways. A live log is the exception, sized by a handle.
- **`title`** is the carved Spectral at 25px (11.36, 4.61 at card-peak); only a `stat` is larger.
  **`palette`** (Ctrl+K, the launcher key) is the one way in: app tiles, open lit green, pinned first
  (Ctrl+P pins), over rows: commands, then what plugins find for the words, `__meta` muted after the name.
- **A lane answers a drag**: `--accept` the accent's soft ground, `--refuse` red's (text-muted 4.52 at peak).

## Components

```text
Structure    pane bar (--flush --inset __group) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead carved splitter stack
             sheet (--side --modal __head __end) well lanes lane (--accept --refuse) drop-line drop-box grid toolbar
Keys         button (--primary --danger --resolve __state __answer) key (--active --success --danger)
             chip join tile (--dense --new __icon __head __name __note) winkey (--close)
Input        field (--auto --prose __label) select checkbox form (__value __stack __split __actions)
Pills        tag pills badge light (both --success --warning --danger --busy) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (__num __fit __name __subject __end __prose __section) row (--selected) files file (__name)
             stat (__figure __value __unit __text) title text (--success --warning --danger)
             label eyebrow value name meta (--sm --lift --wrap) mono key-label (--leave) problem (--box)
             entry (--row __head __text __body; aria-current) notice (__body __title __text)
             steps step (--said --error --warning --quiet __time __verb __subject (--code) __said __detail)
Documents    prose (__figure) prose__scroll code (--wrap __line --at __<highlight.js scope>) editor terminal log math (--block)
Layers       menu (__search __list __group __text __note __arrow __empty) menu__item (--selected --active --tall) tip scrim
             palette (__body __apps __app __pin __list __row __icon __name __meta __empty)
Navigation   tabs tab (--dock __action --close)   Absence  empty (__actions) loading
```
