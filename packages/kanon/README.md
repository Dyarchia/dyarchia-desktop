# dyarchia-kanon

The shared visual system: CSS tokens, `dya-*` classes and three OFL families, with no build and no
JavaScript. This file is the authority over the CSS; the before and after of a change is its commit body.

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

`tokens.css` precedes `reset.css` and `components.css`, which consume it. Every custom property
is prefixed `--dya-`, every keyframe and class `dya-`. The CSS never consults `prefers-color-scheme`.

## Materials

```text
glass   the panel, and only the panel: dark metal, a smoked black a shade under the ground that
        the light passes through, no blur; a chrome rim lit from above, a black line and a shadow
key     every control: a near-black face under a light rim, 3px corners, a hard 3px edge underneath;
        pressed, it drops 2px
pill    every piece of information: round, words in the sans; never pressable
light   status, and only status: a green, yellow or red dot inside a pill or around a key
```

Black and white, and one light. One black carries every surface in three roles: `--dya-ground`
(`#0c0c0e`) under everything, `--dya-panel` (`#131316`) for a key's face, a tile, an entry, a menu
and a sheet, and `--dya-field` (`#0e0e11`) for what receives input or holds a program's text; hover,
selected, disabled and scrim are the only other steps, and none of them is absolute black. A cold,
clear light (`--dya-light-in`) comes in at two corners and is dead within a quarter of the diagonal;
the grain is an overlay and adds no light. The glass lets the light through, and its rim is the only
light thing a panel carries. The primary key is steel; the open tab's line and the focus ring are
silver; plugin marks are black, garnet and white. Nothing glows. Text has two inks, `--dya-text` and
`--dya-text-muted`, and every icon and key glyph is in `--dya-text`. Spectral is the brand; Inter is
the interface, with tabular figures everywhere; Plex Mono is paths and code.

## Colour and contrast

- **Six colours and no others**: blue, purple, orange, green, yellow, red; a light `--dya-<name>`, an `-ink` for text.
- **Green is success, yellow warning, red error, always.** Blue, purple and orange are the only
  categorical hues (`hue--<name>`, from `ctx.hues`): a dot beside a name or a glyph, never a pill's
  word, a fill or a dot inside a pill. A pill that informs is neutral. **Plugins have no hue.**
- **An ink under 4.50 against what it sits on is not text**; above 3.00 it may be a graphical
  object. `--dya-text-muted` is 4.61 at the least. Lights are never text; `--dya-text-off` is exempt.
- **Measure before committing** with `py packages/kanon/tools/contrast.py <token-suffix>`,
  `glass-peak` and `card-peak` included; the numbers go in the commit body.

## Rules

- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Round is information, square is action.** **Colour is status or which-one, never emphasis.**
- **Hover changes the background and the border, never the shadow.** A transition names only
  `transform`, `opacity` and `background-color`; the focus ring is an outline.
- **Interface text is sentence case; data keeps its own case.** Capitals are the eyebrow's, the
  table head's and the section row's alone.
- **Five radii**: 3px a key, field or menu row; 6px a menu; 8px a card; 12px the panel and the
  sheet; 999px a pill, a light, a dot. **Weights are 300, 400, 500.**
- **Performance outranks aesthetics.** No WebGL, no shaders, no `backdrop-filter`; nothing animates
  forever. A word reporting something done (`key-label--leave`) fades over five seconds.
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **One primary per view**: `--primary`, steel with black words, the action the view is about.
  `--success` is lit green for approve; `--danger` turns red only under the pointer or focus.
- **A state a person answers is one key**: `button--resolve` names the state in red and, under the
  pointer or focus, its answer in green (`__state`, `__answer` share one cell, so it never moves).
- **An action with a known glyph is an icon key** with a tip, never a `button` spelling the verb.
- **A panel measures itself**: it is a `pane`, addressed as `@container pane (...)`, never a media
  query. Density is fixed on the 4 and 8px scale; width changes how many regions a panel shows,
  never how far things stretch. No column system: `grid` is a gallery of fixed-width things, from
  the top left, `tile--new` first; an empty panel is its gallery, never one tile in the middle.
- **Content is as wide as it needs.** Table columns are their content's width; spare room holds
  another region or is left empty on purpose, content at the top left. `form`: labels as wide as
  the longest, values up to 560px, the label over its value below 400px.
- **A panel's actions are in the dock's tab row** (`handle.toolbar`), never floating at its foot.

## Components

```text
Structure    pane bar (--flush --inset __group __sep) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead brand (--sm) carved splitter sheet (--side --modal)
             well lanes lane (--accept --refuse) drop-line drop-box grid toolbar
Keys         button (--primary --success --danger --resolve --quiet --sm __state __answer) key (--primary --active --success --danger)
             chip join tile (--dense --new __icon __head __name __note) winkey (--close)
Input        field (--sm --auto --prose) select checkbox form (__value __stack __split __actions __push)
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
Navigation   tabs tab (--dock __action --close)
Absence      empty (__actions) loading        Assistive    sr-only
```
