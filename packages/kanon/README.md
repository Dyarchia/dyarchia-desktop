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
glass   the panel, and only the panel: dark metal, a smoked black a shade under the ground that
        the light passes through, no blur; a chrome rim lit from above, a black line and a shadow
key     every control: a near-black face under a light rim, 3px corners, a hard 3px edge underneath;
        pressed, it drops 2px
pill    every piece of information: round, words in the sans; never pressable
light   status, and only status: a green, yellow or red dot inside a pill or around a key
```

Black and white, and one light. One black in three roles, none of them absolute: `ground` #0c0c0e,
`panel` #131316 (a key's face, a tile, an entry, a menu, a sheet), `field` #0e0e11 (input, code, a
log); `hover`, `selected`, `disabled` and `scrim` are the only other steps. A cold clear light
(`--dya-light-in`) comes in at two corners and is dead within a quarter of the diagonal; the grain
adds none. The primary is steel, the open tab's line and the focus ring silver, plugin marks black,
garnet and white. Nothing glows. Two inks, `text` and `text-muted`; every icon and glyph is `text`.
Spectral is the brand, Inter the interface with tabular figures, Plex Mono paths and code.

## Colour and contrast

- **Six colours and no others**: blue, purple, orange, green, yellow, red; a light `--dya-<name>`, an `-ink` for text.
- **Green is success, yellow warning, red error, always.** Blue, purple and orange are the only
  categorical hues (`hue--<name>`, from `ctx.hues`): a dot beside a name or a glyph, never a pill's
  word, a fill or a dot inside a pill. A pill that informs is neutral. **Plugins have no hue.**
- **An ink under 4.50 is not text**, above 3.00 it may be a graphic; `text-muted` is 4.61 at the least,
  `text-off` is exempt. Measure with `tools/contrast.py <suffix>`, peaks included, into the commit body.

## Rules

- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Round is information, square is action; colour is status or which-one, never emphasis.**
  **Pressable is raised, information is flat.** Every control is a key: button, key, chip, tile,
  select, a dock tab's actions, a panel's toolbar, the window's keys. Content that opens when
  pressed (a lifted card, an entry, a row, a step's subject, a menu row, a tab) stays flat and
  answers with its ground; `tile--new` is a key's dashed outline.
- **Hover changes the background and the border, never the shadow**; a transition names only
  `transform`, `opacity` and `background-color`; the focus ring is an outline.
- **Interface text is sentence case; data keeps its own case.** Capitals are the eyebrow's, the
  table head's and the section row's alone, in the top ink; a date in a section row is a `meta`.
- **Scale**: body 15px; cells, names and rows 14px; controls, labels, meta 13px; prose 72ch wide.
- **Five radii**: 3px key, field, menu row; 6px menu; 8px card; 12px panel, sheet; 999px pill, dot. **Weights 300, 400, 500.**
- **Performance outranks aesthetics.** No WebGL, shaders or `backdrop-filter`; nothing animates forever.
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **One primary per view**: `--primary`, steel with black words, the action the view is about.
  `--success` is lit green for approve; `--danger` turns red only under the pointer or focus.
- **A state a person answers is one key**: `button--resolve`, the state in red, its answer in green
  under the pointer, in one cell. **A known glyph is an icon key** with a tip, never a spelled verb.
- **A panel measures itself** as a `pane` (`@container pane`), never a media query; width changes
  how many regions it shows, never how far things stretch. `grid` is a gallery of fixed-width
  things from the top left, `tile--new` first. Table columns are their content's width; `form`
  labels are as wide as the longest, values up to 560px. Actions live in `handle.toolbar`.
- **`title`** is the brand's carved Spectral at 25px, top ink to muted (11.36, 4.61 at card-peak);
  only a `stat` is larger. A picker's word sits in `field__label` and ends in an ellipsis.
- **`palette`** (Ctrl+K) is the one way in: a field, rows of icon, name and key hint, the keyboard's
  row on `selected` (13.30, hint 5.40), `No match` when empty; modal, scrim and `inert` under it.

## Components

```text
Structure    pane bar (--flush --inset __group __sep) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead brand (--sm) carved splitter sheet (--side --modal)
             well lanes lane (--accept --refuse) drop-line drop-box grid toolbar
Keys         button (--primary --success --danger --resolve --quiet --sm __state __answer) key (--primary --active --success --danger)
             chip join tile (--dense --new __icon __head __name __note) winkey (--close)
Input        field (--sm --auto --prose __label) select checkbox form (__value __stack __split __actions __push)
Pills        tag badge (--success --warning --danger) pills
Lights       light (--success --warning --danger) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (__num __fit __key __name __subject __end __prose __section) row (--selected)
             stat (__figure __value __unit __text) title text (--success --warning --danger)
             label eyebrow value name meta (--sm --lift --wrap) mono key-label (--leave) problem (--box)
             entry (--row __head __text __body) notice (__body __title __text)
             steps step (--said --error --warning --quiet __time __verb __subject (--code) __said __detail)
Documents    prose (__figure) prose__scroll code (__line --at __<highlight.js scope>) editor terminal log math (--block)
Layers       menu (__search __list __group __text __note __arrow __empty) menu__item (--selected --active --tall) tip scrim
             palette (__list __row __icon __name __hint __empty)
Navigation   tabs tab (--dock __action --close)
Absence      empty (__actions) loading        Assistive    sr-only
```
