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

`Gi` is the default and lives on `:root`. `Paper` is a single `[data-theme="paper"]`
block that redefines **colour tokens only** — not a radius, not a spacing step, not a
duration, not a font size. A product switches by setting the attribute on the root element
and nothing else.

```text
theme    selector                 ground              the accent that carries the weight
------   ----------------------   -----------------   ----------------------------------
Gi       :root                    warm near-black     an orange ink, used sparingly
Paper    [data-theme="paper"]     warm off-white      the same orange, darkened to read
```

Components never learn that themes exist. `components.css` names no colour, so a theme is
a change of values and can never be a change of rules. **A theme that needs a new rule is
not a theme; it is a second system, and it is refused.**

One is dark and one is light, and the CSS never consults `prefers-color-scheme`. The
browser learns which is mounted through `--dya-scheme`, which `reset.css` hands to
`color-scheme` on the root: a native scrollbar, a form control the system has not replaced
and the `canvas` colour keyword all follow the theme instead of the operating system.

Both grounds are warm: every grey carries a unit or two more red than blue. The status and
syntax hues are the one place a theme redefines a value that Gi declares functional, because
a light ground turns a legible pastel into a fail.


## Gi

Warm near-black ground. Ten surfaces on a monotonic ramp.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #000000              0.00000
--dya-sunken           #0e0d0b              0.00405
--dya-chassis          #131210              0.00608
--dya-surface-1        #181714              0.00857
--dya-surface-2        #1d1c18              0.01158
--dya-flat-hover       #22211d              0.01517
--dya-raised           #262521              0.01845
--dya-overlay          #2a2925              0.02212
--dya-raised-hover     #31302b              0.02941
--dya-selected         #383733              0.03812
```

The canvas is the only pure black and it carries nothing. Everything above it leans red
over green over blue by one unit at each step, which is the whole of the warmth.

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-text      #e6e3db  16.38    13.98    11.96     11.35          10.31       9.29
--dya-text-2    #d3d0c8  13.63    11.63     9.95      9.45           8.58       7.73
--dya-text-3    #bdbab2  10.83     9.24     7.91      7.51           6.82       6.15
--dya-text-4    #a19e96   7.85     6.70     5.73      5.44           4.94       4.45
--dya-accent    #d97757   6.73     5.74     4.91      4.66           4.24       3.82
--dya-accent-2  #6a9bcc   7.17     6.12     5.24      4.97           4.52       4.07
--dya-accent-3  #788c5d   5.71     4.87     4.17      3.96           3.59       3.24
```

Every text level clears AA everywhere except `--dya-text-4` on `--dya-selected` at 4.45;
on that surface the label level is `--dya-text-3`.

`--dya-accent` is the primary: text up to and including `--dya-overlay`, a graphical
object above it. It is also `--dya-field`, where `--dya-on-field` `#181714` measures 5.74
against it. `--dya-accent-2` is the cool secondary, measures better everywhere, and is the
right choice for a link, a selected state or an informational mark. `--dya-accent-3` is
the weakest ink in the system: text on the canvas, the sunken step, the chassis,
`--dya-surface-1` and `--dya-surface-2` at 4.63, and nowhere else.

```text
token                  value     on chassis   on surface-1
--------------------   -------   ----------   ------------
--dya-border           #35332e         1.48           1.42
--dya-border-strong    #4a473f         2.02           1.93
--dya-hairline         #262521         1.22           1.17
```

A border is a graphical object and the 3.00 bar does not apply to it, but a border that
measures under 1.40 against the ground it separates is not there. `--dya-border` marks a
panel edge on the chassis; `--dya-hairline` separates rows inside one surface and is never
the outline of a container.


## Paper

Warm off-white ground. The ramp is not monotonic: relief goes towards white, recess goes
towards the canvas, so the raised steps are the lightest values and the sunken and selected
steps are darker than the surface they sit in.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #e6e3db              0.76876
--dya-sunken           #dcd9d0              0.69395
--dya-chassis          #eeece6              0.83881
--dya-surface-1        #f6f5f1              0.91249
--dya-surface-2        #fbfaf7              0.95596
--dya-flat-hover       #edebe4              0.83023
--dya-raised           #ffffff              1.00000
--dya-overlay          #ffffff              1.00000
--dya-raised-hover     #f3f1eb              0.87963
--dya-selected         #e2dfd5              0.73748
```

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-text      #181510  14.19    16.69    18.20     18.20          16.12      13.65
--dya-text-2    #2f2b25  10.97    12.89    14.06     14.06          12.45      10.55
--dya-text-3    #4f4a42   6.85     8.05     8.78      8.78           7.78       6.59
--dya-text-4    #5f5a51   5.34     6.27     6.85      6.85           6.06       5.13
--dya-accent    #a2451f   4.81     5.65     6.16      6.16           5.46       4.62
--dya-accent-2  #2b5f8f   5.22     6.14     6.70      6.70           5.93       5.02
--dya-accent-3  #4f6236   5.23     6.14     6.70      6.70           5.93       5.03
```

Every text level is text on every surface; the lowest reading in the theme is
`--dya-text-4` on `--dya-sunken` at 4.85. The three accents are text everywhere except
`--dya-accent` on `--dya-sunken` at 4.37, where it is a ring or a fill and not a word.
`--dya-on-accent` and `--dya-on-field` are `#fbfaf7` and measure 5.90 on the accent.

```text
token                  value     on chassis   on surface-1
--------------------   -------   ----------   ------------
--dya-border           #d3cfc5         1.32           1.43
--dya-border-strong    #bab5a9         1.73           1.87
--dya-hairline         #e0ddd4         1.15           1.24
```

The elevation tokens are redefined in Paper because a black contour ring over an off-white
ground reads as a hard outline: the ring becomes `#181510` at 15%, the inset light becomes
opaque white, and the drop shadows fall to a third of their Gi alpha. Same shape, same
offsets, same blur.


## Colour rules

- **A theme redefines values, never rules.** Everything in this section holds in both.
- **Colour is never the only signal.** It states an outcome; a word or an icon says what
  the outcome is.
- **An ink under 4.50 against what it sits on is not text.** Above 3.00 it may still be a
  graphical object: a dot, a rule, a selection bar, a focus ring, a fill.
- **The status and syntax hues are functional.** Each theme declares its own values so that
  the job, legibility, is done on that theme's ground.

```text
token           Gi        fill   Paper     fill   role
-------------   -------   ----   -------   ----   ------------------------
--dya-success   #63cf95   9.30   #1a6e3d   6.02   a positive outcome
--dya-warning   #d6a95c   8.27   #7d5410   6.39   caution, not failure
--dya-danger    #f59790   8.29   #ab3226   6.26   error, destruction
--dya-idle      per theme  7.73  per theme  9.97  no outcome yet
```

`fill` is `--dya-on-status` over the hue, or `--dya-on-idle` over `--dya-idle`. Each hue
has a `-soft` companion at 10% for the ground of a row or a quiet badge. As text rather than
fill, the three measure 6.18 / 5.50 / 5.51 at worst in Gi, on `--dya-selected`, and
4.90 / 5.20 / 5.09 at worst in Paper on the canvas, so `.dya-text--success` and
`--danger` carry no reservation on any surface. On `--dya-sunken` in Paper, success
measures 4.45 and is a fill there, not a sentence.

```text
token                 Gi        s-2    s-1    Paper     s-2    s-1
-------------------   -------   ----   ----   -------   ----   ----
--dya-code-keyword    #cf8fb4   6.69   7.03   #9c3874   6.23   5.96
--dya-code-string     #8fb87a   7.56   7.94   #35691f   6.30   6.03
--dya-code-number     #d6a95c   7.87   8.27   #7d5410   6.39   6.12
--dya-code-function   #7fb0dd   7.44   7.82   #2b5f8f   6.42   6.14
--dya-code-punct      #bdbab2   8.79   9.24   #4f4a42   8.42   8.05
--dya-code-comment    #85857f   4.59   4.83   #6f6a60   5.15   4.93
```

`--dya-code-comment` is the lowest ink in the system that is still text, deliberately the
most recessive of the six and just above the 4.50 floor on the two surfaces a code block
sits on. Keyword and string converge under deuteranopia; a code block accepts that, because
the reader still has indentation, quotes and delimiters.

`--dya-faint`, the glass tokens and the carve tokens are alphas of the theme's own ink and
ground. `--dya-elev-focus` follows the accent in each theme.


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
  1px light on its top edge, which is a seam and not relief.
- **Only what receives input is recessed**: fields, sliders, and any control being pressed.
- **Hover changes the background, never the shadow.** There is no raised-hover elevation;
  `--dya-raised` moves to `--dya-raised-hover`.
- **The contour ring is the theme's ink, not its opposite.** Black in Gi, near-black at 15%
  in Paper. A white ring over a near-black ground reads as a grey outline instead of as
  depth. No shadow uses positive spread.
- **Carving is relief for a word.** `--dya-carve` is a two-edged text shadow, one edge lit
  and one in shade, and the theme decides which side the light comes from: from below in
  Gi, from above in Paper. `--dya-carve-filter` is the same pair as `drop-shadow`, for a
  word whose fill is a gradient of `--dya-carve-a` to `--dya-carve-b` rather than a flat
  ink. Static, and therefore free.


## Type

IBM Plex Sans for content, IBM Plex Mono for interface, Spectral for the brand. None ships
a variable font, so the system carries eight static faces: sans and mono at 300, 400 and
500, serif at 300 and 500.

- **Hierarchy comes from size and tracking, never from weight.**
- **Interface text is mono and uppercase; data is not.** A file name, a path, a model name
  or a log line keeps its case, in mono at `--dya-tracking-mono`. `.dya-entry` is the one
  list row that does not uppercase.
- **The serif is the brand and nothing else.** `.dya-brand` and `.dya-carved` are its two
  consumers; a heading, a label or a sentence in Spectral is a fork.
- **Data is never smaller than 12px.** A figure, a date, a size, a count in a table cell or
  a record is `--dya-size-mono-xs` at the least. The two label sizes exist for words that
  name things: an eyebrow, a table header, a badge, a key.

```text
--dya-size-body       14px    prose, sentences, the empty state
--dya-size-body-sm    13px
--dya-size-body-xs    12px
--dya-size-mono       14px    the mono block
--dya-size-mono-sm    13px    code
--dya-size-mono-xs    12px    fields, entries, log lines, table cells
--dya-size-label      11px    buttons, chips, menu items, tabs
--dya-size-label-sm   10px    eyebrows, labels, table headers, badges, keys
--dya-size-brand      15px    the brand badge
```

```text
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    data labels in a table or a record
--dya-tracking-label    0.2em     section labels, buttons, chips, tabs
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
surfaces, 13.47 and 12.89 on Paper's. The em-relative size is deliberate: an expression
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
Structure    bar (--flush --inset) card card__header brand carved
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

`brand` is the word in the title bar: serif, uppercase, carved, with the accent dot after
it. `carved` is the same word at display size for a region that has nothing else to show:
transparent text over the carve gradient, cut by the carve filter. Both are static.

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
- **Visual.** The system carries no render of its own; the desktop shell is the render.
  With the app running in dev, `node scripts/screenshot.mjs out.png` at the workspace root
  captures the window over the Chrome DevTools Protocol, and an optional second argument is
  an expression evaluated in the page first — `document.documentElement.dataset.theme =
  'paper'` switches the theme, a `.click()` opens a panel. One capture per theme per
  change, and the pair is what a commit body describes.
- **The invariant.** `components.css` must resolve to zero literal colours. Verify against
  the CSSOM, not by reading the file.


## Open questions

- Paper has been seen against the shell and the six panels at one window size. Its
  interpolated steps, `--dya-flat-hover` and `--dya-raised-hover`, are the ones most likely
  to move once a long session is spent in it.
- The prose block went with its last consumer, and the SDK's markdown renderer still emits
  `code`, `math` and `prose__scroll`. Whatever renders markdown next needs typography for
  the elements between them, and the heading scale has one step, which is thin for
  arbitrary documents. docviewer answers both today with its own prefixed rules, dropping
  `h2` and `h3` into the mono label idiom.
- `text--warning` went and its two siblings stayed, because nothing reports a warning in
  prose yet. The triad returns whole the day something does.
- The IBM Plex stylistic sets are undetermined.
