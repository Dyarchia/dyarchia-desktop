# dyarchia-kanon

The shared visual system: CSS tokens, `dya-*` classes and three OFL families, with no build and no
JavaScript. This file is the authority over the CSS; the before and after of a change is its commit body.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the @font-face declarations
css/tokens.css       the one theme, graphite, on :root
css/reset.css        normalisation, [hidden], the ground, focus ring, scrollbars, reduced motion
css/motion.css       the keyframes
css/components.css   the dya-* classes
fonts/               IBM Plex Sans 300/400/500, Plex Mono 400/500, Spectral 300/500
tools/               contrast.py measures, palette.py lifts the six colours to lights and inks
```

`tokens.css` precedes `reset.css` and `components.css`, which consume it. Every custom property
is prefixed `--dya-`, every keyframe and class `dya-`. The CSS never consults `prefers-color-scheme`.

## Materials

```text
glass   the panel, and only the panel: translucent white over the grain, no blur
key     every control: flat face, 3px corners, a hard 3px edge underneath; pressed, it drops 2px
pill    every piece of information: round, words in the mono; never pressable
light   status, and only status: a green, yellow or red dot inside a pill or around a key
```

Spectral is the brand and the one big figure, Plex Sans the interface, Plex Mono the data. Nothing
inside a panel is divided by a horizontal line. `--dya-halo` means here: the open tab, the focused field.

## Colour and contrast

- **Six colours and no others**: blue, purple, orange, green, yellow, red, each a light
  `--dya-<name>` for what is not text and an `-ink` that is text on every ground.
- **Green is success, yellow warning, red error, always.** Blue, purple and orange are the only
  categorical hues (`hue--<name>`, assigned by `ctx.hues`): a pill's word, a dot beside a name, a
  glyph; never a fill, never a dot inside a pill. **Plugins have no hue**; a brand mark keeps its own.
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
- **A plugin's own CSS is layout only.** A new look is declared here first and measured; an unused class goes.

## Keys and layout

- **Lit keys**: `button--primary` silver, at most one per view; `button--success` green, go and
  make; `button--danger` red, stop and unmake; `key--success` and `key--danger` their icon forms.
  **Green makes and red unmakes a board, a card, a target**, and nothing else.
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
             --pending --ghosted --carried) card__header masthead brand carved splitter sheet (--side)
             well lanes lane (--accept --refuse) drop-line drop-box
Keys         button (--primary --success --danger --resolve --quiet --sm __state __answer) key (--active --success --danger)
             chip join tile (--dense --new __icon __head __name __note) winkey (--close)
Layout       grid (--gallery) subgrid col-<n> col-sm-<n> col-md-<n> col-lg-<n>
Input        field (--sm --auto --prose) select checkbox form (__value __stack __split __actions __push)
Pills        tag badge (--success --warning --danger) pills
Lights       light (--success --warning --danger) ring (--current --busy)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (--stack __num __fit __key __name __subject __end __prose) row
             stat (__figure __value __unit __text) title text (--success --warning --danger)
             label eyebrow value name meta (--sm --lift --wrap) mono key-label problem (--box)
             entry (--row __head __text __body) notice (__body __title __text)
             steps step (--said --error --warning --quiet __time __verb __subject __said __detail)
Documents    prose (__figure) prose__scroll code (__line --at __<highlight.js scope>) editor terminal log math (--block)
Layers       menu (__search __list __group __text __note __arrow __empty) menu__item (--selected --active --tall) tip scrim
Navigation   tabs tab (--dock __action --close)
Absence      empty (__actions) loading
Assistive    sr-only
```
