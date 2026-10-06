# dyarchia-kanon

The shared visual system: CSS tokens, `dya-*` classes and two OFL families, no build, no JavaScript. This
file is the authority over the CSS; a change's before and after is its commit body. `css/dyarchia.css`
imports, in order, `fonts`, `tokens` (the default theme, Dyarchia, on `:root`), the themes, `reset`,
`motion` and `components`; all prefixed `dya-`, `prefers-color-scheme` never read. **A theme** is
`css/themes/<id>.css`: its tokens on `:root[data-theme="<id>"]`, and component rules under the same
selector where its shape differs; listed in `THEMES` and shipped only measured: `contrast.py --theme <id>`.

## Dyarchia

Black and copper. One warm black in three roles: `ground` #141413, `panel` #1a1a18, `field` #121110;
`hover`, `selected` and `scrim` are the only other steps, and a white wash (`hover-wash`, `press-wash`) is
how a thing answers the pointer. Three inks: `text` #faf9f5; `text-muted` #b0aea5, a control's word;
`text-faint` #94938d, what is about a thing rather than the thing (meta, a time, an eyebrow, a table head, an
idle tab, a pill's word, a placeholder, a comment), 4.54 on `selected`. **Copper** (`accent`
#d18743) is the one colour that is not status: the primary's fill, the open tab's line, a link, the focus,
the caret and the wordmark, 6.37 on the ground and 4.84 on `selected`. **Anthropic** is the same theme with
claude.dev's clay for the accent, #da7858 (#d97757 lifted to 4.54 on `selected`). Nothing is raised, nothing glows,
nothing moves at rest. Inter is the interface with tabular figures; Geist Mono is every label, head, meta,
button word, tab, title, path and line of code. A Dyarchia mark is drawn in `text`, `text-muted` and
`on-accent`; a brand's mark keeps its own colours.

## Rules

- **Six colours and no others**, blue, purple, cyan, green, yellow and red, each a light `--dya-<name>`
  and an `-ink` for text, lifted by `tools/palette.py`. **Green is success, yellow warning, red error,
  always**; yellow is a muted lemon, far greener than the accent, so a warning is never read as the accent. Blue,
  purple and cyan are the only categorical hues (`hue--<name>`, from `ctx.hues`): a dot beside a name or a
  glyph, never a pill's word, a fill or a dot inside a pill. **Plugins have no hue.**
- **An ink under 4.50 is not text**, above 3.00 it may be a graphic; `danger-ink` is 4.50 at the least,
  `text-off` is exempt. Measure with `tools/contrast.py <suffix>`, the wash peaks included, into the commit body.
- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Controls are type, information is filled.** A key, a tile, a tab's action and a window key are their glyph
  or word in the muted ink, brightening under the pointer; a worded button is a mono capital word in a
  hairline. A pill is the one filled thing that cannot be pressed: a square code chip, a breath of white.
- **Colour is status or which-one, never emphasis**, with the one exception of the accent, spent once per view.
- **Hover changes the background and the ink**; a transition names only `transform`, `opacity` and
  `background-color`; the focus ring is an outline in the accent.
- **Interface text is sentence case; data keeps its own case.** Capitals are the eyebrow's, the table head's
  and a button's alone, in the mono.
- **Scale** body 15, rows 14, controls and meta 13px, prose 72ch. **Corners are square** except a light, a dot
  and a ring (999px). **Weights 300, 400, 500.** No WebGL, shaders or `backdrop-filter`.
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **One height**: every single-line control (button, key, chip, select, field, a tab's actions, the window's
  keys) is `--dya-size-control`, 28px. Only a textarea grows. There is no small size.
- **A field is an underline**, brightening under the pointer and turning the accent with the keyboard. A field and
  its keys are a `join`, the field filling the row. Adjacent icon keys in a `toolbar` join on their own.
- **One primary per view**: `--primary`, a block of the accent with the ground's black for its word (6.37; 7.77 on
  the hover step). `key--success` is lit green; `--danger` turns red only under pointer or focus. **A state a
  person answers is one key**: `button--resolve`, red, green answer.
- **A row's own key shows when the row is looked at**: `reveal` in a `reveals` row, unpressable until hover or
  focus; `reveal--held` keeps the key a row cannot be left without. A chip may lead with a 15px glyph.
- **A tip exists only on an icon-only key**, one or two words, never a word already on screen beside it. A
  label, a pill and a key that spells anything have none; the SDK's `tips()` refuses them.
- **Pills never touch the next line**: a pill row and what follows stand in a `stack`, 8px apart. A
  `sheet__head` is the title, a status pill (never a key) and the `__end` strip, one line at control height.
- **A list is lines**: every table row ends on a hairline rule. **A list of files is `files`**: `file` rows of
  glyph and mono `__name`, one line, ellipsis, flat hover, `aria-current` on `selected`.
- **A panel is a hairline on the ground** and measures itself as a `pane` (`@container pane`), never a media
  query: width changes how many regions it shows, never how far things stretch. `grid` is a gallery of
  fixed-width things, `tile--new` first; table columns are content width; `form` values up to 560px.
- **What opens in place is a `fold`**: `details.fold`, a `__head` summary led by `__mark`, the SDK chevron
  turned down while open. **One scroller per region**: nothing in a region that scrolls scrolls again; a code
  block wraps (`code--wrap`); a live log is sized by a handle.
- **`title`** is the mono at 25px in the top ink; only a `stat` is larger. **`palette`** (Ctrl+K, the launcher
  key) is the one way in: app tiles, open lit green, pinned first (Ctrl+P pins), over rows: commands, then
  what plugins find, `__meta` muted. **A lane or a chip answers a drag**: `--accept` the accent's soft ground,
  `--refuse` red's.

## Components

```text
Structure    pane bar (--flush --inset __group) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead carved splitter stack
             sheet (--side --modal __head __end) well lanes lane (--accept --refuse) drop-line drop-box grid toolbar
Keys         button (--primary --danger --resolve __state __answer) key (--active --success --danger)
             chip (--accept) join tile (--dense --new __icon __head __name __note) winkey (--close) reveal (--held) reveals
Input        field (--auto --prose __label) select checkbox (:indeterminate) form (__value __stack __split __actions)
Pills        tag pills badge light (both --success --warning --danger --busy) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple cyan)
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
