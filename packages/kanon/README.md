# dyarchia-kanon

The shared visual system: plain CSS custom properties, a layer of `dya-*` component
classes and three families under the SIL Open Font License. No build step, no dependency,
no JavaScript, no test suite. This file is the authority over the CSS — it states what the
system is, not how it got there. The before and after of a change belongs in its commit
body.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the eight @font-face declarations
css/tokens.css       both themes
css/reset.css        normalisation, [hidden], colour scheme, focus ring, scrollbars, reduced motion
css/motion.css       four keyframes, all prefixed dya-
css/components.css   the dya-* classes
fonts/               eight static woff2, 536 KB
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

`Gi` is the default and lives on `:root`. `Rei` is a single `[data-theme="rei"]` block that
redefines **colour tokens only** — not a radius, not a spacing step, not a duration, not a
font size. A product switches by setting the attribute on the root element and nothing else.

```text
theme    selector               ground             the accent that carries the weight
------   --------------------   ----------------   ----------------------------------
Gi       :root                  warm near-black    an orange ink, used sparingly
Rei      [data-theme="rei"]     deep blue          an azure ink, with amber and mint
```

Components never learn that themes exist. `components.css` names no colour, so a theme is
a change of values and can never be a change of rules. **A theme that needs a new rule is
not a theme; it is a second system, and it is refused.**

Both are dark, and the CSS never consults `prefers-color-scheme`. The browser learns which
is mounted through `--dya-scheme`, which `reset.css` hands to `color-scheme` on the root: a
native scrollbar, a form control the system has not replaced and the `canvas` colour keyword
all follow the theme instead of the operating system.

Gi is warm, every grey carrying a unit or two more red than blue; Rei is cold, every step a
blue whose red channel is about two thirds of its blue one, so the two never read as one ramp
tinted. They differ in hue, not in luminance: no surface in either theme reaches 0.06, and
**no ink is ever darker than the surface under it.** The status and syntax hues are declared
per theme anyway, because a hue that separates cleanly from a warm ground is not the same hue
that separates from a cold one.


## Gi

Warm near-black ground. Ten surfaces on a monotonic ramp.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #000000              0.00000
--dya-sunken           #0c0b0a              0.00339
--dya-chassis          #121110              0.00567
--dya-surface-1        #1c1a17              0.01048
--dya-surface-2        #232019              0.01461
--dya-flat-hover       #282420              0.01817
--dya-raised           #2e2a24              0.02364
--dya-overlay          #343029              0.03004
--dya-raised-hover     #383430              0.03510
--dya-selected         #3f3931              0.04205
```

The canvas is the only pure black and it carries nothing. Everything above it leans red
over green over blue by one unit at each step, which is the whole of the warmth.

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-text      #e6e3db  16.38    13.54    11.12     10.23           9.62       8.89
--dya-text-2    #d3d0c8  13.63    11.27     9.25      8.51           8.01       7.40
--dya-text-3    #bdbab2  10.83     8.95     7.35      6.77           6.36       5.88
--dya-text-4    #a19e96   7.85     6.49     5.33      4.90           4.61       4.26
--dya-accent    #fe7802   7.90     6.53     5.36      4.94           4.64       4.29
--dya-accent-2  #6a9bcc   7.17     5.93     4.87      4.48           4.21       3.90
--dya-accent-3  #788c5d   5.71     4.72     3.88      3.57           3.35       3.10
```

Every text level clears AA everywhere except `--dya-text-4` on `--dya-selected` at 4.26;
on that surface the label level is `--dya-text-3`.

`--dya-accent` is the primary, a straight orange at OKLCH 0.72 / 0.190 / 50: text up to and
including `--dya-raised` at 5.36, a graphical object above it — which is where an icon, a dot
or a focus ring may still wear it. Its hue sits 23 degrees from `--dya-danger`, and that
distance is the reason it is 50 and not the 39 of a warmer coral: at this chroma an accent
twelve degrees from red reads as stop. It is also `--dya-field`, where `--dya-on-field`
`#181714` measures 6.74 against it. `--dya-accent-2` is the cool secondary, measures better everywhere, and is the
right choice for a link, a selected state or an informational mark. `--dya-accent-3` is
the weakest ink in the system: text on the canvas, the sunken step, the chassis,
`--dya-surface-1` at 4.72, and nowhere else: on `--dya-surface-2` it measures 4.42 and stops
being text.

```text
token                  value     on chassis   on surface-1
--------------------   -------   ----------   ------------
--dya-border           #46413a         1.87           1.72
--dya-border-strong    #5c564c         2.60           2.39
--dya-hairline         #2a2620         1.25           1.15
```

A border is a graphical object and the 3.00 bar does not apply to it, but a border that
measures under 1.40 against the ground it separates is not there. `--dya-border` marks a
panel edge on the chassis and **the outline of a row**; `--dya-hairline` separates regions
inside one surface and is never the outline of a container.

**A row is a card, and no table draws a rule between rows.** The horizontal line under every
row is the shape of a ledger, and a panel of them reads as ruled paper however well the line
measures — the object the reader is after, one target or one plugin or one event, never
becomes an object at all. A row carries `--dya-surface-1`, `--dya-border` on four sides at
1.42 in Gi and 1.53 in Rei, the 6px radius, and a gap of ground to the row below. The column
heads above it lose their rule with it.


## Rei

A deep blue ground, tinted rather than neutral, for eyes that a pale surface hurts. No white
anywhere in the ramp and no pure black either: `--dya-bg` is `#05080f`, which is a blue and
reads as one. The ten steps climb the same distances Gi's do, so a component lands on the
same relative depth in both themes, and the ink ranks stay four deep and evenly spaced.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #05080f              0.00240
--dya-sunken           #080d18              0.00405
--dya-chassis          #0c1220              0.00615
--dya-surface-1        #151d33              0.01277
--dya-surface-2        #1c2745              0.02128
--dya-flat-hover       #1f2a4c              0.02469
--dya-raised           #26335c              0.03552
--dya-overlay          #2b3966              0.04399
--dya-raised-hover     #2f3d69              0.04962
--dya-selected         #354473              0.06129
```

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   -----   ------   ------   -------   ------------   --------
--dya-text      #dde5f5   15.84    13.22     9.71      8.83           8.33       7.46
--dya-text-2    #c8d3ea   13.32    11.12     8.16      7.43           7.01       6.27
--dya-text-3    #aebcd9   10.49     8.76     6.43      5.85           5.52       4.94
--dya-text-4    #a1afce    9.10     7.60     5.58      5.07           4.79       4.29
--dya-accent    #74a9ff    8.46     7.06     5.18      4.71           4.45       3.98
--dya-accent-2  #f0a45c    9.70     8.10     5.95      5.41           5.10       4.57
--dya-accent-3  #7fd3b8   11.37     9.49     6.96      6.34           5.98       5.35
```

**Every ink rank is text on every surface in this theme**, `--dya-text-4` included at 4.29 on
`--dya-selected`, where Gi reads 4.26 and reserves that surface for `--dya-text-3`. The two
readings under the floor are `--dya-accent` on `--dya-raised-hover` at 4.45 and on
`--dya-selected` at 3.98, and the accent is never text on either: it is the ink of an active
key, where it measures 5.18 on `--dya-raised`. `--dya-code-comment`
`#8290ad` is the most recessive ink, 5.22 and 5.51 on the two surfaces a code block sits on.

`--dya-on-accent`, `--dya-on-field` and `--dya-on-status` are `#05080f`, the ground itself,
and measure 8.46 on the accent, 11.50 on success, 10.31 on warning and 6.70 on danger.
`--dya-on-idle` measures 6.81 on `--dya-idle`. Success and danger are the two hues Rei does
not redefine: they are read as a convention rather than against this ground.

```text
token                  value     on chassis   on surface-1
--------------------   -------   ----------   ------------
--dya-border           #38466d         2.02           1.80
--dya-border-strong    #52659b         3.29           2.94
--dya-hairline         #1f2a4c         1.33           1.19
```

The elevation tokens are redefined because the contour ring is the theme's own darkest blue
rather than black: `#02040a` for the ring, white at 9% for the inset light on relief. Same
shape, same offsets, same blur.


## Colour rules

- **A theme redefines values, never rules.** Everything in this section holds in both.
- **Colour is never the only signal.** It states an outcome; a word or an icon says what
  the outcome is.
- **An ink under 4.50 against what it sits on is not text.** Above 3.00 it may still be a
  graphical object: a dot, a rule, a selection bar, a focus ring, a fill.
- **The status and syntax hues are functional.** Each theme declares its own values so that
  the job, legibility, is done on that theme's ground — except green and red, which mean what
  they mean outside this system and are one value in both.
- **A badge may wear an accent as well as a status.** A status says how something turned out;
  an accent says what kind of thing it is, and a system with six hues that let a label reach
  three has three it declared and never spends. `--dya-on-accent` over each fill measures
  6.74 / 6.12 / 4.87 in Gi and 8.46 / 9.70 / 11.37 in Rei; as soft inks on `--dya-surface-1`,
  6.53 / 6.12 / 4.87 in Gi and 7.47 / 8.57 / 10.04 in Rei.

- **Hue says which one; the accent says what matters; status says how it went.** Three axes,
  never mixed. Six categorical hues — amber, mint, cyan, blue, violet, pink — mark which of
  several things of one kind something is: which plugin, which group of corpora, which agent.
  They are solved rather than picked: one OKLCH lightness per theme, 0.74 in Gi and 0.76 in
  Rei, and the most chroma each hue holds there inside sRGB, so they read as one family and
  none is louder than another. At a lower lightness the dark hues stop being text on
  `--dya-raised`; at a higher one blue, violet and pink bleach towards pastel. Every hue is text
  from `--dya-bg` to `--dya-raised` in both themes and a mark above it:

  ```text
  hue      Gi        sf-1   raised  selected    Rei       sf-1   raised  selected
  ------   -------   ----   ------  --------    -------   ----   ------  --------
  amber    #df9c02   7.35    6.04     4.83      #e7a203   7.62    5.59     4.30
  mint     #0dc992   8.09    6.64     5.32      #0fd098   8.36    6.14     4.72
  cyan     #07bfde   7.87    6.46     5.17      #03c6e6   8.14    5.98     4.59
  blue     #7caafe   7.47    6.14     4.91      #86b1ff   7.76    5.70     4.38
  violet   #c08eff   7.07    5.81     4.65      #c598ff   7.42    5.44     4.18
  pink     #ff71bb   6.89    5.66     4.53      #fe7fc0   7.18    5.27     4.05
  ```

  **A hue is a mark, never a fill, and it is shown while it says something.** A dot beside a
  name (`legend`), the underline of a selected tab, the icon of a key whose panel is open —
  and nothing else. A key at rest is the quiet ink of every key, so the top bar's colour says
  which panels are open rather than repeating a legend; a row carries its category as a dot and
  its name in ordinary ink, and leaves the loud colour on the line to its state. A screen that
  filled every category with its hue showed ten hues at once, and a fill is how a category
  starts competing with a status for the same glance.

  A hue is assigned, never chosen per screen: a plugin declares one in its manifest, and a set
  of categories inside a plugin gets its hues from `ctx.hues`, which keeps a key's hue as long
  as the set does not force it to move. `tools/palette.py` is what solved them and what
  re-solves them when a surface moves.

- **The terminal's sixteen colours are tokens.** `--dya-ansi-*` holds the six chromatic
  colours and their bright twins, solved the same way against `--dya-surface-1`, which is the
  terminal's ground: normal at OKLCH 0.72 in Gi and 0.74 in Rei, bright at 0.84 and 0.86. The
  normal set measures between 6.08 and 7.85 on it. Black and white are the system's own ink
  ranks, not colours of their own.

- **Green means go and red means stop, in the colours everybody already reads.** A control
  that starts something is `--dya-success`, one that stops or destroys is `--dya-danger`, and
  an application that spends one accent on both makes two opposite controls identical. A
  panel here had a RUN and a STOP forty pixels apart in the same salmon, and neither said
  which was which.

```text
token             Gi        fill    Rei       fill    role
---------------   -------   -----   -------   -----   ------------------------
--dya-success     #4ade80   10.29   both      11.50   go, and a positive outcome
--dya-warning     #d6a95c    8.27   #e2b268   10.31   caution, not failure
--dya-danger      #ff5f56    6.00   both       6.70   stop, destroy, fail
--dya-danger-ink  #f59790    8.29   #ff9b95    9.90   the same meaning, as text
--dya-idle        per theme  7.73   per theme  6.81   no outcome yet
```

`fill` is `--dya-on-status` over the hue, or `--dya-on-idle` over `--dya-idle`. Each hue has
a `-soft` companion at 10% for the ground of a row or a quiet badge, and success and danger
carry a `-hover` step for the two filled buttons: `#6ae997` at 11.71 and 13.09, `#ff7d75` at
7.21 and 8.05.

**Red is the one hue whose fill cannot also be its ink.** A red saturated enough to read as
red beside a warm orange accent is too dark to be read as text on a dark surface: `#ff5f56`
as an ink measures 4.42 on `--dya-raised-hover` in Gi and 3.93 in Rei, under the floor on the
one step a quiet danger button spends its life on. So `--dya-danger-ink` is a token of its
own — 7.09 on `--dya-raised` in both themes, 6.11 and 5.80 on the hover step, 6.96 and 7.37
on its own soft ground — and `.dya-text--danger`, `.dya-badge--danger.dya-badge--soft` and
`.dya-button--danger.dya-button--quiet` all take it. Green needs no such split: `--dya-success`
measures 10.29 in Gi and 10.16 in Rei on `--dya-surface-1` and 8.50 and 8.35 on its own soft.

**Green and red are the two colour tokens Rei does not redefine.** Every other hue in this
system is tuned to its theme's ground; these two are quotations of a convention the reader
brings with them, and a stop button that is a different red in each theme is two conventions.

```text
token                 Gi        s-2    s-1    Rei       s-2    s-1
-------------------   -------   ----   ----   -------   ----   ----
--dya-code-keyword    #cf8fb4   6.69   7.03   #d79cc8   7.56   7.99
--dya-code-string     #8fb87a   7.56   7.94   #93cf8e   9.22   9.74
--dya-code-number     #d6a95c   7.87   8.27   #e2b268   8.62   9.10
--dya-code-function   #7fb0dd   7.44   7.82   #74a9ff   7.07   7.47
--dya-code-punct      #bdbab2   8.79   9.24   #aebcd9   8.77   9.27
--dya-code-comment    #85857f   4.59   4.83   #8290ad   5.22   5.51
```

`--dya-code-comment` is the lowest ink in the system that is still text, deliberately the
most recessive of the six: in Gi it clears the 4.50 floor by 0.09 on the two surfaces a code
block sits on, in Rei by 0.72. Keyword and string converge under deuteranopia; a code block
accepts that, because the reader still has indentation, quotes and delimiters.

`--dya-faint`, the glass tokens and the carve tokens are alphas of the theme's own ink and
ground. `--dya-elev-focus` follows the accent in each theme.


## Relief

- **Relief means pressable.** Buttons, keys, chips and tiles are raised, and a card that is
  itself pressed or picked up — `card--lift`, the kanban card — stands off its board. Rows,
  cells, tabs and containers are flat and express state through background: a row is chosen,
  not pressed, and a table of raised rows reads as a keyboard.
- **Relief is one recipe, and everything that presses wears all of it.** A face lit from
  above (`--dya-face`, a white sheen over whatever ground the control has, so a primary, a
  danger and a plain button catch one light), a lit top edge, a shaded bottom edge, the
  contour ring, a contact shadow and a short cast. Pressing removes all of it at once and
  sinks the control into `--dya-elev-pressed`, a well whose lower lip catches light. A key
  whose panel is open stays sunk, tinted with its hue: open is held down.
- **Relief is free because it is static.** Every layer is painted with the control and never
  per frame. Scrolling the targets grid of fifteen raised tiles for 359 frames holds 16.70 ms
  at the median and 17.00 at p95 in both themes, the figures the same grid measures flat.
- **The face costs its inks a little and no text any of its floor.** At the vertical centre of
  a control, where a label sits, a button's `--dya-text` measures 9.06 on the hover step in
  Gi and 7.84 in Rei, and a chip's `--dya-text-3` 5.99 and 5.19. `--dya-text-4` and the hues
  fall to 4.34 and 4.25 on the lit hover face, and there they are only ever a key's icon,
  a mark with a 3.00 floor.
- **`button--bare` is the one pressable without relief**, and it is allowed only where
  relief would lie: an icon that is the whole content of an empty region, where a raised
  button reads as an unfilled form. It carries no background and no shadow, so it is also
  the one control whose hover changes the ink rather than the ground — there is no ground
  to change. It presses by scale rather than by translation, because nothing that never
  stood up can sink.
- **A container that groups controls carries no relief**, or the controls inside read as
  sunk into a well. The panel is the single exception, carrying `--dya-elev-chassis`, a
  1px light on its top edge, which is a seam and not relief.
- **Only what receives input is recessed**: fields, sliders, and any control being pressed.
- **Hover changes the background, never the shadow.** There is no raised-hover elevation;
  `--dya-raised` moves to `--dya-raised-hover`.
- **The contour ring is the theme's own darkest value, not its opposite.** Black in Gi,
  `#02040a` in Rei. A white ring over a dark ground reads as a grey outline instead of as
  depth. No shadow uses positive spread.
- **Carving is relief for a word.** `--dya-carve` is a two-edged text shadow, one edge lit
  and one in shade, and the light comes from below in both themes, because both grounds are
  dark. `--dya-carve-filter` is the same pair as `drop-shadow`, for a
  word whose fill is a gradient of `--dya-carve-a` to `--dya-carve-b` rather than a flat
  ink. Static, and therefore free.


## Type

**IBM Plex Sans is the interface. IBM Plex Mono is the data. Spectral is the brand.** Seven
static faces: sans at 300, 400 and 500, mono at 400 and 500, serif at 300 and 500. Mono Light
was carried for two years and nothing ever set it; it is deleted.

- **The interface speaks in sentence case, in the sans.** A tab, a button, a table head, a
  label, a badge, a menu item: sentence case, `--dya-tracking-ui`, sans. An application whose
  every word is 10px mono capitals with 0.2em of tracking reads as a terminal in costume, and
  this one was exactly that — `CRAWLEE`, `+ NEW TARGET`, `REFRESH`, `TARGET GROUP PAGES SIZE`,
  down to the word `COMMIT` beside a checkbox.
- **Capitals are one component's privilege.** `.dya-eyebrow` names a region, once per view,
  with the accent dot before it. Capitals signal only while almost nothing else wears them.
  The brand and the carved word keep theirs because a wordmark is not interface text.
- **Data keeps its face and its case.** A file name, a path, a target, a model name, a figure,
  a log line: mono at `--dya-tracking-mono`, in whatever case it came in.
- **Hierarchy comes from size and tracking, never from weight.** The three weights in use are
  300 for the serif and for a rendered `h1`, 400 for everything, 500 for the eyebrow and the
  brand.
- **The serif is the brand and the one big figure.** `.dya-brand`, `.dya-carved` and
  `.dya-stat__value`; a heading, a label or a sentence in Spectral is a fork.
- **Nothing in the interface is smaller than 11px, and almost nothing is that small.** The
  floor is the eyebrow and the label; a control is 12.5 or 13.5, a tab is 14.5.

```text
--dya-size-body       14.5px   prose, sentences, tabs, the empty state
--dya-size-body-sm    13.5px   buttons, key labels, menu items
--dya-size-body-xs    12.5px   small buttons, chips, table heads
--dya-size-mono       13.5px   the mono block
--dya-size-mono-sm    12.5px   code, fields, entries, table cells
--dya-size-mono-xs    12px     log lines, the meta rank
--dya-size-label      12px     badges
--dya-size-label-sm   11px     the eyebrow
--dya-size-brand      16px     the brand badge
```

```text
--dya-tracking-ui       0         every word of the interface, in the sans
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    a data label that still wants the wider set
--dya-tracking-label    0.2em     the eyebrow
--dya-tracking-brand    0.16em    the brand and the carved word, and nothing else
```

One scale, no breakpoint, no `clamp()`.

**The prose sizes are a second, shorter scale for documents the system did not write**, and
they are tokens rather than a component now: `--dya-size-h2` through `--dya-size-h4` are
declared and nothing in this system applies them, because the block that did had no
consumer left. A product rendering markdown cannot put a class on every element, so
whatever renders it next styles by element under its own prefix, from these sizes. Prose is
content: sans, and it keeps its case.

`.dya-math` is the exception inside the exception: notation is data, so it is mono at
`0.94em` of its surroundings carrying `--dya-text-2` — 11.06 and 11.63 on Gi's two
surfaces, 11.14 and 11.77 on Rei's. The em-relative size is deliberate: an expression
inside a heading has to scale with it, and no fixed step can. `.dya-math--block` is the
display form.


## Shape, spacing and motion

```text
--dya-radius-sm         4px    control under 16px: checkbox, radio, toggle knob, thumb
--dya-radius            8px    buttons, fields, keys, small surfaces
--dya-radius-card      12px    a card, a row, a tile, a log, a media block
--dya-radius-chassis   16px    the panel and the sheet, and nothing else
--dya-radius-full     999px    badge, tag, chip, accent dot, radio, avatar
```

Four radii and a pill, and the ladder doubled: a 3px corner on a 22px control and a 6px one on a
card read as a rectangle that missed, which is most of what made this system look unfinished.
Something asking for 10px gets 8px or 12px, and a badge or a tag is a pill. Spacing is the `--dya-space-1`
to `--dya-space-24` ladder and nothing outside it.

- **`transform`, `opacity` and `background-color` are the only properties a transition may
  name.** `color` and `border-color` change instantly, which is why hover on a tab snaps
  rather than eases. The list is closed. **Never name `box-shadow` in a transition.**
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a status dot.
- **Pressing never changes colour alone.** It scales on `--dya-press-scale` and translates
  on `--dya-press-y`.
- **Performance outranks aesthetics.** No WebGL, no shaders. `backdrop-filter` is off by
  default: `--dya-glass` resolves to `none`. The carve filter is two static drop shadows on
  one word and is the only `filter` in the system.


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
Structure    pane bar (--flush --inset __group) card card__header masthead brand carved
             splitter (--vertical) sheet (--side)
Pressable    button (--primary --success --quiet --sm --danger --bare) key (--active) chip
             entry (--active) tile (--dense __icon __head __name __note)
Input        field (--sm --auto --prose) checkbox form (__actions __push)
Hue          hue--<name> pane--<name> dot legend   (amber mint cyan blue violet pink)
Content      tag badge (--accent --accent-2 --accent-3 --success --warning --danger --soft)
             pills table (__num __fit __key __name __end __prose) row (--selected)
             stat (__figure __value __unit __text __note) meter (__pip)
             title (--lg) lede text (--success --danger) label eyebrow value meta mono
             key-label
Documents    prose__scroll code (__kw __str __num __com __fn __pun) log math (--block)
Layers       menu menu__item (--selected) tip scrim
Navigation   tabs tab
Absence      empty (--inline __actions) loading
Assistive    sr-only
```

**A row is a card, and the three classes that draw rows draw the same card.** `table`'s
cells, `row` and `entry` all carry `--dya-surface-1`, `--dya-border` and the 6px radius, with
a gap of ground between one row and the next; hover moves the ground to `--dya-flat-hover` and
selection to `--dya-selected` with `--dya-border-strong` around it. A table does this with
`border-collapse: separate` and `border-spacing` on the block axis, and puts the radius on the
first and last cell so the row carries it end to end — which is why a row's state is set on its
cells and never on the `tr`, where it would sit behind them and never be seen.

**`splitter` is the handle between two regions of a panel.** Everything else in this
application resizes and the regions inside a panel did not, so a console filling with output a
line at a time was whatever height its plugin wrote down. The strip is 11px for a pointer to
catch and pulls its own height back out of the layout with a negative margin, so adding one
moves nothing above it; the grip is a 64 by 4 pill in `--dya-text-3`, 8.95 in Gi and 8.76 in
Rei on `--dya-surface-1`, and takes `--dya-accent` under the pointer and while dragging. A
handle is found before it is used, so it is drawn in an ink that is found.
The consumer owns the drag, the clamp and where the size is remembered.

**A sheet that covers is modal, and modality is two things or it is neither.** A sheet is
inset from its panel, so what it opened over keeps showing through around it, and that
margin is where the defect lives: the rows and cards still visible there hover, take a
click and answer it — in the crawlee editor, by loading another target over the one being
written — the whole region behind stays in the tab order, and the wheel over the margin
moves what is behind rather than what is on top. A covering sheet therefore raises a
`scrim` over what it covers and sets `inert` on it in the same breath. The scrim says the
region is out of play, `inert` makes it true, and either one alone ships half a modal.
`--dya-scrim` is the theme's own ground at 72%: a `tile` behind it dims 1.37 in Gi and 1.49
in Rei, while the sheet stands 1.16 and 1.15 clear of the ground it covers, which is the
separation `--dya-surface-1` already has over `--dya-bg`. Two more belong to the consumer:
focus into the sheet when it opens and back to whatever raised it when it closes, and
Escape bound to the panel rather than to the sheet, so it closes from wherever the reader's
hands are.

**`sheet--side` is the one that is not, until it covers.** A side sheet is the detail beside
the list it came from, and the list stays live because picking the next item out of it is
what the arrangement is for — the kanban inspector would be broken by a scrim, not fixed by
one. That holds only while it stays to one side. A side sheet widened to cover the panel is
a covering sheet whatever class it carries, and owes the scrim, the `inert`, the focus and
the Escape from the moment it is widened to the moment it is narrowed back.

**Emphasis is a family, not an accident.** Every other rule here is a prohibition — do not
glare, do not truncate, never below 4.50 — and prohibitions produce a screen where nothing
is wrong and nothing is first. `title`, `lede`, `button--primary`, `tile`,
`empty__actions` and `stat` are the six that say what matters:

- **`title` is a size and a tracking, never a weight.** It is `--dya-size-h3` at
  `--dya-weight`, carrying `--dya-text` where the line under it carries `--dya-text-3`.
  Hierarchy in this system comes from the type scale and the ink rank; a heading that
  reaches for 500 is how a screen ends up with four kinds of bold and still no order.
  `--lg` is the same rule at `--dya-size-h2`, for a screen that is only a heading.
- **`lede` is one sentence under a title**, sans, capped at 68ch, `--dya-text-3`. It is not
  `text`: the cap and the rank are the difference between a lede and a paragraph.
- **`button--success` is go, and it is not a second primary.** A primary is the one action a
  view is about; a success button is a meaning, and a view may hold one beside the `--danger`
  fill that is its opposite. Run, approve, confirm.
- **`button--primary` is the one action a screen is about.** At most one per view, because
  a second first is none. It is the only filled control in the system that does not report
  a status, and its hover step is `--dya-accent-hover` — a token rather than a filter,
  because a transition may name `background-color` and nothing else.
- **`tile` is a pressable card**: an icon, a name and one line. It is how a region with
  nothing in it yet offers what to do next, and the shell's launcher is built from nothing
  else.
- **A panel with nothing in it offers what to put in it, and the offer is a `tile`.** The rule
  used to be the opposite — an empty panel is empty, its controls live in its bar — and what
  that produces at a window's width is a black rectangle nine hundred pixels tall with one word
  in a corner, which reads as a thing that does not work. The reader and the player each carry
  one tile now: an icon, what the panel is for, and the way in. `empty__actions` stays for the
  case where the reader has to choose rather than to start — a board that is gone, and which
  board to open instead.
- **`empty--inline` is absence inside a populated view**: one quiet line where the first row
  would be, because centring "nothing is running" in a band of its own makes the emptiest
  part of the screen the loudest.

`stat` is the sixth, and it arrived the way the paragraph above says one should: three panels
had each invented a large figure with a label under it, and each drew it differently. **A stat is
loud by size and never by weight.** Its `__value` is the serif at `--dya-size-display` and weight
300 — the family this system otherwise spends on a single word in the title bar — against a
`--dya-size-label-sm` name beside it, a ratio of four that no weight in this scale can reach. The
name is `.dya-label`, because a stat does not redeclare a class the system already has; `__unit`
is what the figure is out of or measured in, `__note` is the one line under it. Over
`--dya-surface-2`, the masthead ground, `__value` measures 13.30 in Gi and 13.24 in Rei, and
`__unit` and `__note` 6.37 and 7.61. **At most one stat per view**, for the same reason as
`button--primary`.

`masthead` is where a stat usually sits: the band at the head of a view, saying once what the
view is about. It is flat and not relief — a header is not pressable — carrying
`--dya-elev-chassis` as a seam under its top edge, the same seam a panel has. It wraps, because
at a 400px pane a stat, a name and two badges are three lines.

`meter` is a capacity, not a progress bar: n marks, filled while what they count is busy. **It
never animates.** A machine being busy is a fact, not something to pulse at a reader for as long
as the panel is open. Its empty mark has to be countable or the meter reports nothing, which is
why the track is an ink and not a surface step: over `--dya-raised`, `--dya-text-4` measures 5.73
in Gi and 6.52 in Rei, where `--dya-selected` measures 1.29 and 1.40 and cannot be seen at all. A
filled mark is `--dya-accent`, 4.91 and 6.05 on the same ground. Neither is text and both clear
the 3.00 a graphical object owes. Draw one only above two marks: a single pip is a stray dash.

`form` belongs to the same argument from the other side. The system had no form, so every
consumer invented one and each reached for the same wrong answer: a centred paragraph above
the input explaining what it does. Three of those in a column is a page of prose with three
boxes in it, and the reader parses a sentence to learn that the next box takes a number. A
form is a two-column grid — **what the field is called, and the field** — and the sentence
behind the name is a tip on the label. `__actions` is the row at the end, spanning both columns,
and `__push` sends what carries it and everything after it to the far end, which is where a
destructive action goes.

`pane` is not a component either: it declares an element a query container under the name
`pane` and carries no look at all. It exists because a panel's width is its own — in a dock
it has nothing to do with the window's, so a viewport query answers the wrong question and
is wrong at every split. A consumer writes `@container pane (max-width: 700px)` and gets the
panel, not whichever container happens to be nearest. **The three widths the system is
measured at are 400, 700 and 1900**: below 700 a pane is one column and nothing sits beside
anything, at 700 a second column is affordable, and 1900 is the whole window, where a layout
stops gaining from more room.

A consumer that needs a threshold of its own declares its own container rather than bending
the pane's. The cost panel does: its list is a fixed 300px, so the pane decides whether the
list sits beside the detail, and the detail — a container in its own right — decides whether
its ten columns are a table or a stack of cards. At a 1000px pane those two answers differ,
which is the case a single query cannot express.

`sr-only` is the one class that is not a component: it takes an element out of the visual
layout while leaving it in the accessibility tree, which is what a live region needs and
what `[hidden]` would destroy. Measured 1x1 and still rendered.

`brand` is the word in the title bar: serif, uppercase, carved, with the accent dot after
it. `carved` is the same word at display size for a region that has nothing else to show:
transparent text over the carve gradient, cut by the carve filter. Both are static.

`tile--dense` is the other tile: a row instead of an icon — a name, what is happening to it, and
the tallies under — at `--dya-space-3` rather than `--dya-space-4`, because a grid of them is a
list of things to open rather than the one thing a blank region offers. Its `__name` is data and
keeps its case and its mono tracking; the icon tile's `__name` labels a panel and is uppercase.
That is the system's own division between interface text and data, and a tile sits on both sides
of it.

`pills` is a row of badges that wraps, and it is a component because the wrap is the part every
consumer got wrong. A badge is a word, several are a line, and several at panel width are two.

`bar__group` is the same argument in a bar: controls that belong together, and the group is what
wraps, so a bar at panel width breaks between groups and never inside one.

**`table__key` and `table__name` are the same column and not the same thing.** A key is interface
text saying what the value beside it is, so it is uppercase, tracked and `--dya-text-4`, 6.70 in
Gi and 8.04 in Rei over `--dya-surface-1`. A name is data — a plugin, a board, a file — so it
keeps its case and takes `--dya-text`, 13.98 and 13.99, the rank the subject of a row is owed.
Getting the two backwards is how a table of paths ends up shouting the word PATH at a reader who
came to read the path. `__fit` is the width both share and nothing else, `__end` is that width at
the end of the row, where an action sits, and a `td` wraps anywhere, because a table cell that
makes a panel scroll sideways to read a path is unusable at panel width.

**Prose is sans, and it is the third case the case rule never named.** The system says interface
text is uppercase and data keeps its case; it had nothing to say about a sentence somebody typed.
The field and the table are both mono, because most of what they hold is data — a path, a model
name, a log line, a column of figures — and a sentence set in mono at a tracking meant for
identifiers reads as a ransom note: every word the same width, every letter held off the next,
the eye reading characters instead of words. `field--prose` and `table__prose` are the two places
a consumer needs it: a title, a brief, a note, a query, a description. `--sm --prose` steps down
to `--dya-size-body-sm`, because sans is wider than the mono the small field was measured
against.

Four distinctions in that list are easy to collapse and are not the same thing:

- **`code` is authored, `log` is streamed.** Code is highlighted and scrolls sideways
  because its indentation carries meaning. A log wraps, because a panel that scrolls to
  read a filename is unusable at panel width. `log` sets no height and no flex.
- **`badge` is a chip, `text--*` is a sentence.** Same three tokens; a reported outcome in
  prose must not be dressed as a label.
- **`bar` is window chrome, `bar--inset` is a row of controls.** The chrome is the 38px,
  the gradient and the hairline; the rhythm is what the modifier keeps.
- **`title` is a heading, `label` is a name.** A title is sans and keeps its case because
  it is a sentence about the screen; a label is mono, uppercase and tracked because it
  names a control. Interface text is uppercase by default and a heading is the exception,
  along with data.
- **`tip` is a sentence, `menu` is a choice.** A tip is a `[popover="hint"]` the browser
  opens on interest, anchored to its `[interestfor]` control by the engine and flipped at
  an edge by `position-try-fallbacks`; mono, sentence case, never uppercase, because it
  explains rather than labels. A control that shows only an icon carries a tip and an
  `aria-label`, and `key` is that control: a 22px square whose content is an `svg` at
  14px or one glyph.
- **`field` is full-width by default.** `--auto` opts out; a minimum width is the
  consumer's layout.


## Verification

There is nothing to build, lint or test. What replaces those commands:

- **Arithmetic.** Any change to a text, border, surface or accent token is re-measured
  against every surface it can sit on, **in both themes**, and the numbers go in the commit
  body. `py tools/contrast.py <token-suffix>` reads `tokens.css` and prints that grid; a
  literal `#rrggbb` measures a value that is not a token yet.
- **Visual.** The system carries no render of its own; the desktop shell is the render.
  With the app running in dev, `node scripts/screenshot.mjs out.png` at the workspace root
  captures the window over the Chrome DevTools Protocol, and an optional second argument is
  an expression evaluated in the page first — `document.documentElement.dataset.theme =
  'rei'` switches the theme, a `.click()` opens a panel. One capture per theme per
  change, and the pair is what a commit body describes.
- **The invariant.** `components.css` must resolve to zero literal colours. Verify against
  the CSSOM, not by reading the file.


## Open questions

- `pane` has been measured against all six panels at 400, 700 and 1900, in Gi only. The
  sweep walks every descendant for a box crossing the pane's right edge or an element
  scrolling on x; the terminal cannot be measured that way, because xterm refits from a
  `ResizeObserver` and a background window is given no frames to deliver one in. Its
  behaviour under a real resize is untested here.
- The two thresholds in use are properties of their content, not of the system: 640 for a
  corpus row and 900 for the cost panel's ten columns, both measured against the data on one
  machine. A corpus with longer names or a column added to that table moves them.
- Rei has been seen against the launcher, Setup, docviewer, kanban, crawlee and the terminal
  at 1400 px, and nowhere else yet. Its two hover steps, `--dya-flat-hover` and
  `--dya-raised-hover`, are interpolated rather than observed, and they and the 9% inset
  light on relief are the values most likely to move once a long session is spent in it.
- The prose block went with its last consumer, and the SDK's markdown renderer still emits
  `code`, `math` and `prose__scroll`. Whatever renders markdown next needs typography for
  the elements between them. docviewer answers that today with its own prefixed rules,
  styling by element in sans from `--dya-size-h2` to `--dya-size-h4`; a second consumer
  is what would move those rules upstream.
- `text--warning` went and its two siblings stayed, because nothing reports a warning in
  prose yet. The triad returns whole the day something does.
- The IBM Plex stylistic sets are undetermined.
