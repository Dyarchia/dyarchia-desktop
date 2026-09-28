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
glass   the panel, and only the panel: translucent white over the grain, no blur; brighter at the
        top, under a chrome rim lit from above, cut from the ground by a black line and a shadow
key     every control: flat face, 3px corners, a hard 3px edge underneath; pressed, it drops 2px
pill    every piece of information: round, words in the sans; never pressable
light   status, and only status: a green, yellow or red dot inside a pill or around a key
```

Black and white, and one light. The ground is black (`#0a0a0b`) with a dark crimson light
(`--dya-light-in`, `#7f1d1d`) coming in at two corners; the glass lets it through, which is what
makes a panel read as glass over metal. Crimson is that light and nothing else: never a key, a word
or a line. The primary key is light steel; the open tab's line and the focus ring are silver.
Nothing glows. Text has two inks, near white and muted.

Spectral is the brand, full size only on the empty window and small beside the version otherwise.
Inter is the interface, with tabular figures everywhere; Plex Mono is paths and code, nothing else.
Nothing inside a panel is divided by a horizontal line.

## Colour and contrast

- **Six colours and no others**: blue, purple, orange, green, yellow, red, each a light
  `--dya-<name>` for what is not text and an `-ink` that is text on every ground.
- **Green is success, yellow warning, red error, always.** Blue, purple and orange are the only
  categorical hues (`hue--<name>`, assigned by `ctx.hues`): a dot beside a name or a glyph; never
  a pill's word, a fill or a dot inside a pill. A pill that informs is neutral. **Plugins have no
  hue**; a brand mark keeps its own.
- **An ink under 4.50 against what it sits on is not text**; above 3.00 it may be a graphical
  object. `--dya-text-4` is the quietest ink, 4.61 at the least. Lights are never text;
  `--dya-text-off`, the word on a disabled key, is exempt.
- **Measure before committing.** A text, border, surface or light token change is re-measured with
  `py packages/kanon/tools/contrast.py <token-suffix>`, composite grounds `glass-peak` and
  `card-peak` included, and the numbers go in the commit body.

## Rules

- **Components reference tokens, never literals**: no literal colour, radius or duration in `components.css`.
- **Round is information, square is action.** **Colour is status or which-one, never emphasis**;
  the accent is silver.
- **Hover changes the background and the border, never the shadow.** A transition names only
  `transform`, `opacity` and `background-color`; the focus ring is an outline.
- **Interface text is sentence case in the sans; data is mono in its own case.** Capitals are the
  eyebrow's and the table head's alone.
- **Five radii**: 3px a key, field or menu row; 6px a menu; 8px a card; 12px the panel and the
  sheet; 999px a pill, a light, a dot. **Weights are 300, 400, 500**; hierarchy comes from size,
  tracking and rank first.
- **Performance outranks aesthetics.** No WebGL, no shaders, no `backdrop-filter`; nothing animates forever.
  A word that reports something done (`key-label--leave`) fades over `--dya-dur-leave`, five seconds.
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **One primary per view**: `button--primary` and `key--primary`, light steel with black words,
  the action the view is about: run, make, install, finish. `button--success` and `key--success`
  are lit green for approve; `button--danger` and `key--danger` lit red for stop and unmake. No key
  glows, and no key is crimson.
- **A state a person answers is one key**: `button--resolve` names the state in red and, under the
  pointer or focus, its answer in green (`__state`, `__answer` share one cell, so it never moves).
- **An action with a known glyph is an icon key** with a tip, never a `button` spelling the verb.
- **Twelve columns, owned by the container.** `grid`, `col-<n>`, and `col-sm-`, `col-md-`,
  `col-lg-` from 400, 700 and 1200px of the nearest `pane`, a query container consumers address as
  `@container pane (...)`, never a media query.
- **`form` is one grid per view.** The label takes 3 of 12 below 700px, 2 from 700px, 1 from
  1200px, and stands over its value below 400px.

## Components

```text
Structure    pane bar (--flush --inset __group __sep) card (--lift --selected --danger --warning --marked
             --pending --ghosted --carried) card__header masthead brand (--sm) carved splitter sheet (--side --modal)
             well lanes lane (--accept --refuse) drop-line drop-box
Keys         button (--primary --success --danger --resolve --quiet --sm --xs __state __answer) key (--primary --active --success --danger --sm)
             chip join tile (--dense --new __icon __head __name __note) winkey (--close)
Layout       grid (--gallery) subgrid col-<n> col-sm-<n> col-md-<n> col-lg-<n>
Input        field (--sm --auto --prose) select checkbox form (__value __stack __split __actions __push)
Pills        tag badge (--success --warning --danger) pills
Lights       light (--success --warning --danger) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (--stack __num __fit __key __name __subject __end __prose __section) row (--selected)
             stat (__figure __value __unit __text) title text (--success --warning --danger)
             label eyebrow value name meta (--sm --lift --wrap) mono key-label (--leave) problem (--box)
             entry (--row __head __text __body) notice (__body __title __text)
             steps step (--said --error --warning --quiet __time __verb __subject __said __detail)
Documents    prose (__figure) prose__scroll code (__line --at __<highlight.js scope>) editor terminal log math (--block)
Layers       menu (__search __list __group __text __note __arrow __empty) menu__item (--selected --active --tall) tip scrim
Navigation   tabs tab (--dock __action --close)
Absence      empty (__actions) loading
Assistive    sr-only
```
