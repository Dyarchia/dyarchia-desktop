# dyarchia-kanon

The shared visual system: plain CSS custom properties, a layer of `dya-*` component
classes and two IBM Plex families. No build step, no dependency, no JavaScript, no test
suite. This file is the authority over the CSS — it states what the system is, not how it
got there. The before and after of a change belongs in its commit body.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the six IBM Plex @font-face declarations
css/tokens.css       both themes
css/reset.css        normalisation, [hidden], focus ring, scrollbars, reduced motion
css/motion.css       four keyframes, all prefixed dya-
css/components.css   the dya-* classes
fonts/               six static woff2, 336 KB
tools/contrast.py    the measurement Verification requires
```

The shell links `css/dyarchia.css` once, before React mounts, and every plugin renders
into that document. Import order matters: `reset.css` and `components.css` consume tokens,
so `tokens.css` precedes both. Every custom property is prefixed `--dya-`, every keyframe
and every class `dya-`.

`[hidden]` is declared `!important`, which is the only form that works: the UA stylesheet
loses to any class that sets `display`, so a hidden flex container stays on screen. A
consumer toggling `element.hidden` is guaranteed an effect. Hidden but laid out is
`visibility`.


## Two themes over one contract

`Gi` is the default and lives on `:root`. `Oneiro` is a single `[data-theme="oneiro"]`
block that redefines **colour tokens only** — not a radius, not a spacing step, not a
duration, not a font size. A product switches by setting the attribute on the root element
and nothing else.

```text
theme    selector                  ground        the accent that carries the weight
------   -----------------------   -----------   ----------------------------------
Gi       :root                     achromatic    an orange ink, used sparingly
Oneiro   [data-theme="oneiro"]     blue-black    a blue field, flooded
```

Components never learn that themes exist. `components.css` names no colour, so a theme is
a change of values and can never be a change of rules. **A theme that needs a new rule is
not a theme; it is a second system, and it is refused.**

Both themes are dark. There is no light theme and the CSS never consults
`prefers-color-scheme`.


## Gi

Achromatic ground. Ten surfaces, six sampled from a shipping product and four interpolated
between them.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #000000              0.00000
--dya-sunken           #0d0d0d              0.00402
--dya-chassis          #111111              0.00561
--dya-surface-1        #151515              0.00750
--dya-surface-2        #1a1a19              0.01029
--dya-flat-hover       #1f1f1e              0.01365
--dya-raised           #232322              0.01675
--dya-overlay          #262625              0.01932
--dya-raised-hover     #2d2d2c              0.02617
--dya-selected         #343433              0.03425
```

`--dya-surface-2`, `--dya-flat-hover`, `--dya-overlay` and `--dya-selected` carry one unit
less blue than red and green. Below them the ramp is neutral. The canvas is the only pure
black and it carries nothing.

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-text      #d9d8d5  14.73    12.81    11.04     10.63           9.67       8.74
--dya-text-2    #cbcbc8  12.92    11.23     9.67      9.32           8.48       7.67
--dya-text-3    #b7b6b4  10.36     9.01     7.76      7.48           6.80       6.15
--dya-text-4    #9b9a98   7.47     6.50     5.60      5.39           4.90       4.43
--dya-accent    #d97757   6.73     5.85     5.04      4.85           4.42       3.99
--dya-accent-2  #6a9bcc   7.17     6.24     5.37      5.17           4.71       4.26
--dya-accent-3  #788c5d   5.71     4.96     4.28      4.12           3.75       3.39
```

Every text level clears AA everywhere except `--dya-text-4` on `--dya-selected` at 4.43;
on that surface the label level is `--dya-text-3`.

`--dya-accent` is the primary: text up to and including `--dya-overlay`, a graphical
object above it. It is also `--dya-field`, where `--dya-on-field` `#151515` measures 5.85
against it. `--dya-accent-2` is the cool secondary, measures better everywhere, and is the
right choice for a link, a selected state or an informational mark. `--dya-accent-3` is
the weakest ink in the system: text on the canvas, the sunken step, the chassis and
`--dya-surface-1`, and nowhere else.


## Oneiro

Blue-black ground. Four surfaces sampled, six interpolated.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #04040e              0.00144
--dya-sunken           #070714              0.00248
--dya-chassis          #0a0a20              0.00386
--dya-surface-1        #101026              0.00621
--dya-surface-2        #17172c              0.00977
--dya-flat-hover       #1d1d33              0.01379
--dya-raised           #24243a              0.01942
--dya-overlay          #2a2a42              0.02542
--dya-raised-hover     #32324c              0.03481
--dya-selected         #08084a              0.00720
```

`--dya-selected` breaks the monotonic ramp on purpose: selection here is a saturated
field, darker than `--dya-flat-hover` and bluer than everything, and reads as a filled
region rather than as relief.

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   -----   ------   ------   -------   ------------   --------
--dya-text      #ffffff   20.41    18.68    15.12     13.92          12.38      18.36
--dya-text-2    #e8e8f4   16.80    15.37    12.45     11.46          10.19      15.11
--dya-text-3    #cdcdf5   13.26    12.14     9.83      9.05           8.05      11.93
--dya-text-4    #9797a0    7.05     6.45     5.22      4.81           4.27       6.34
--dya-accent    #e0cbf8   13.67    12.51    10.13      9.33           8.29      12.30
--dya-accent-2  #cdcdf5   13.26    12.14     9.83      9.05           8.05      11.93
--dya-accent-3  #9797a0    7.05     6.45     5.22      4.81           4.27       6.34
```

`--dya-text-4` at 4.27 on `--dya-raised-hover` is the theme's only ink below AA on any
surface; there the label level is `--dya-text-3`.

**`--dya-field` is a surface, not an ink.** It is `#0000f2` and it is the point of the
theme: as text on the chassis it measures 2.12 and fails, which is correct. It carries
`--dya-on-field` `#ffffff` at 9.20 and whole panels are flooded with it. The lavender
`--dya-accent` sits 28 degrees from it in hue, so hue does not separate them — luminance
does, by a factor of ten, at a ratio of 6.16. The field carries weight by area, the
lavender by contrast. The field floods, the lavender speaks.


## Colour rules

- **A theme redefines values, never rules.** Everything in this section holds in both.
- **Colour is never the only signal.** It states an outcome; a word or an icon says what
  the outcome is.
- **An ink under 4.50 against what it sits on is not text.** Above 3.00 it may still be a
  graphical object: a dot, a rule, a selection bar, a focus ring, a fill.
- **The status and syntax hues are functional**, declared once on `:root`, and identical in
  both themes because their job is legibility, not identity.

```text
token           value     fill in Gi   fill in Oneiro   role
-------------   -------   ----------   --------------   ------------------------
--dya-success   #63cf95         9.47            10.58   a positive outcome
--dya-warning   #d6a95c         8.43             9.42   caution, not failure
--dya-danger    #f59790         8.45             9.44   error, destruction
--dya-idle      per theme          —                —   no outcome yet
```

Each hue has a `-soft` companion at 10% for the ground of a row or a quiet badge, and
`--dya-on-status` is the ink on any status fill. As text rather than fill, the three
measure 6.46 / 5.75 / 5.76 at worst in Gi and 6.42 / 5.71 / 5.73 at worst in Oneiro, so
`.dya-text--success`, `--warning` and `--danger` carry no reservation on any surface.

```text
token                 value     Gi s-2   Gi s-1   Oneiro s-2   Oneiro s-1
-------------------   -------   ------   ------   ----------   ----------
--dya-code-keyword    #cf8fb4     6.84     7.17         6.89         7.33
--dya-code-string     #8fb87a     7.72     8.09         7.78         8.28
--dya-code-number     #d6a95c     8.04     8.43         8.11         8.62
--dya-code-function   #7fb0dd     7.59     7.96         7.66         8.15
--dya-code-punct      #b7b6b4     8.60     9.01         8.67         9.22
--dya-code-comment    #85857f     4.69     4.92         4.73         5.03
```

`--dya-code-comment` is the lowest ink in the system that is still text, deliberately the
most recessive of the six and just above the 4.50 floor on every ground. Keyword and
string converge under deuteranopia; a code block accepts that, because the reader still
has indentation, quotes and delimiters.

`--dya-faint`, the elevation shadows and the glass tokens are theme-neutral black and
white alphas. `--dya-elev-focus` is the exception and each theme overrides it.


## Relief

- **Relief means pressable.** Buttons, keys and chips are raised. Rows, cells and
  containers are flat and express state through background.
- **`button--bare` is the one pressable without relief**, and it is allowed only where
  relief would lie: an icon that is the whole content of an empty region, where a raised
  button reads as an unfilled form. It carries no background and no shadow, so it is also
  the one control whose hover changes the ink rather than the ground — there is no ground
  to change. It presses by scale rather than by translation, because nothing that never
  stood up can sink.
- **A container that groups controls carries no relief**, or the controls inside read as
  sunk into a well. The panel is the single exception, carrying `--dya-elev-chassis`, a
  1px light at 4%, which is a seam and not relief.
- **Only what receives input is recessed**: fields, sliders, and any control being pressed.
- **Hover changes the background, never the shadow.** There is no raised-hover elevation;
  `--dya-raised` moves to `--dya-raised-hover`.
- **The contour ring is black, not white.** A white ring over a near-black ground reads as
  a grey outline instead of as depth. No shadow uses positive spread.


## Type

IBM Plex Sans Condensed for content, IBM Plex Mono for interface. Neither ships a variable
font, so the system carries six static faces at weights 300, 400 and 500.

- **Hierarchy comes from size and tracking, never from weight.**
- **Interface text is mono and uppercase; data is not.** A file name, a path, a model name
  or a log line keeps its case, in mono at `--dya-tracking-mono`. `.dya-entry` is the one
  list row that does not uppercase.

```text
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    data labels in a table or a record
--dya-tracking-label    0.2em     section labels, buttons, chips, tabs
--dya-tracking-brand    0.26em    the brand badge, and nothing else
```

One scale, no breakpoint, no `clamp()`.

**The prose sizes are a second, shorter scale for documents the system did not write**, and
they are tokens rather than a component now: `--dya-size-h2` through `--dya-size-h4` are
declared and nothing in this system applies them, because the block that did had no
consumer left. A product rendering markdown cannot put a class on every element, so
whatever renders it next styles by element under its own prefix, from these sizes. Prose is
content: sans, and it keeps its case.

`.dya-math` is the exception inside the exception: notation is data, so it is mono at
`0.94em` of its surroundings carrying `--dya-text-2` — 11.23 and 10.71 on Gi's two
surfaces, 15.37 and 14.46 on Oneiro's. The em-relative size is deliberate: an expression
inside a heading has to scale with it, and no fixed step can. `.dya-math--block` is the
display form.


## Shape, spacing and motion

```text
--dya-radius-sm         3px    control under 16px: checkbox, radio, toggle knob, thumb
--dya-radius            6px    buttons, chips, fields, cards, surfaces
--dya-radius-media      6px    image, video, media blocks
--dya-radius-chassis    9px    the panel, and nothing else
--dya-radius-tag       14px    the tag, and nothing else
--dya-radius-full     999px    accent dot, radio, avatar
```

Five radii and a pill. Something asking for 8px gets 6px. Spacing is the `--dya-space-1`
to `--dya-space-24` ladder and nothing outside it.

- **`transform`, `opacity` and `background-color` are the only properties a transition may
  name.** `color` and `border-color` change instantly, which is why hover on a tab snaps
  rather than eases. The list is closed. **Never name `box-shadow` in a transition.**
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a status dot.
- **Pressing never changes colour alone.** It scales on `--dya-press-scale` and translates
  on `--dya-press-y`.
- **Performance outranks aesthetics.** No WebGL, no shaders. `backdrop-filter` is off by
  default: `--dya-glass` resolves to `none`.


## Components

`components.css` is the single declaration site for the `dya-*` classes. A product that
restyles `.dya-button` has forked the system. **It contains no literal colour, radius or
duration** — every rule resolves to a token. That is what makes a second theme possible,
and it is the first thing to check when something looks right in one theme and wrong in
the other.

**The system carries only what something consumes.** A class nobody uses is dead code and
goes, however well it follows the rules. A plugin that needs what the system does not
declare builds it ad-hoc under its own prefix and proposes it upstream — which is how
`[hidden]`, `log`, the status modifiers, `bar--inset`, `field--auto`, `button--bare` and
`sr-only` all arrived. A class kept for nobody is unexercised, undocumented by use, and
wrong in ways the first consumer discovers rather than the author.

```text
Structure    bar (--flush --inset) card card__header brand
Pressable    button (--quiet --sm --danger --bare) key (--active) chip entry (--active)
Input        field (--sm --auto) checkbox
Content      tag badge (--success --warning --danger --soft) table row
             text (--success --danger) label eyebrow value mono key-label
Documents    prose__scroll code (__kw __str __num __com __fn __pun) log math (--block)
Layers       menu menu__item (--selected) menu__shortcut
Navigation   tabs tab
Absence      empty loading
Assistive    sr-only
```

`sr-only` is the one class that is not a component: it takes an element out of the visual
layout while leaving it in the accessibility tree, which is what a live region needs and
what `[hidden]` would destroy. Measured 1x1 and still rendered.

Four distinctions in that list are easy to collapse and are not the same thing:

- **`code` is authored, `log` is streamed.** Code is highlighted and scrolls sideways
  because its indentation carries meaning. A log wraps, because a panel that scrolls to
  read a filename is unusable at panel width. `log` sets no height and no flex.
- **`badge` is a chip, `text--*` is a sentence.** Same three tokens; a reported outcome in
  prose must not be dressed as a label.
- **`bar` is window chrome, `bar--inset` is a row of controls.** The chrome is the 46px,
  the gradient and the hairline; the rhythm is what the modifier keeps.
- **`field` is full-width by default.** `--auto` opts out; a minimum width is the
  consumer's layout.


## Verification

There is nothing to build, lint or test. What replaces those commands:

- **Arithmetic.** Any change to a text, border, surface or accent token is re-measured
  against every surface it can sit on, **in both themes**, and the numbers go in the commit
  body. `py tools/contrast.py <token-suffix>` reads `tokens.css` and prints that grid; a
  literal `#rrggbb` measures a value that is not a token yet.
- **Visual.** The system carries no render of its own. A page linking `css/dyarchia.css`
  with the fonts beside it, holding the markup in question in both themes, is the whole
  method. `scratch/` at the workspace root is gitignored and exists for those pages; serve
  the workspace over HTTP, or the fonts are blocked as cross-origin and the measurement is
  made against the wrong faces.
- **The invariant.** `components.css` must resolve to zero literal colours. Verify against
  the CSSOM, not by reading the file.


## Open questions

- Six of Oneiro's ten surfaces are interpolated and have not been seen against real
  content. The theme is also tiring to read over a long session, which is the same
  observation from the other side.
- The prose block went with its last consumer, and the SDK's markdown renderer still emits
  `code`, `math` and `prose__scroll`. Whatever renders markdown next needs typography for
  the elements between them, and the heading scale has one step, which is thin for
  arbitrary documents. docviewer answers both today with its own prefixed rules, dropping
  `h2` and `h3` into the mono label idiom.
- `text--warning` went and its two siblings stayed, because nothing reports a warning in
  prose yet. The triad returns whole the day something does.
- The IBM Plex stylistic sets are undetermined.
