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
panel edge on the chassis and **the row rule inside a table**; `--dya-hairline` separates
rows inside one surface and is never the outline of a container.

**A table's rule is `--dya-border`, and that is a correction.** It was `--dya-rule`, which
measures 1.05 against `--dya-surface-1` in Gi and 1.06 in Rei: a separator this system's own
sentence says is not there, and a table whose rows it separated read as a run of loose lines
with words drifting under headings. `--dya-hairline` does not save it either, at 1.17 and
1.23. `--dya-border` is the only step in either ramp that clears 1.40 — 1.42 in Gi, 1.53 in
Rei — so the rule that says where a border goes loses to the rule that says what a border
has to measure.


## Rei

A deep blue ground, tinted rather than neutral, for eyes that a pale surface hurts. No white
anywhere in the ramp and no pure black either: `--dya-bg` is `#05080f`, which is a blue and
reads as one. The ten steps climb the same distances Gi's do, so a component lands on the
same relative depth in both themes, and the ink ranks stay four deep and evenly spaced.

```text
token                  value     relative luminance
--------------------   -------   ------------------
--dya-bg               #05080f              0.00240
--dya-sunken           #090e19              0.00442
--dya-chassis          #0d1322              0.00667
--dya-surface-1        #111829              0.00933
--dya-surface-2        #151d32              0.01268
--dya-flat-hover       #1a233c              0.01748
--dya-raised           #1f2946              0.02319
--dya-overlay          #242f4f              0.02973
--dya-raised-hover     #2a3759              0.03946
--dya-selected         #324063              0.05246
```

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   -----   ------   ------   -------   ------------   --------
--dya-text      #dde5f5   15.84    13.99    11.34     10.41           9.28       8.10
--dya-text-2    #c8d3ea   13.32    11.77     9.54      8.76           7.80       6.81
--dya-text-3    #aebcd9   10.49     9.27     7.51      6.90           6.15       5.37
--dya-text-4    #a1afce    9.10     8.04     6.52      5.98           5.33       4.65
--dya-accent    #74a9ff    8.46     7.47     6.05      5.56           4.95       4.32
--dya-accent-2  #f0a45c    9.70     8.57     6.95      6.38           5.68       4.96
--dya-accent-3  #7fd3b8   11.37    10.04     8.14      7.47           6.66       5.81
```

**Every ink rank is text on every surface in this theme**, `--dya-text-4` included, where Gi
has to reserve `--dya-selected`. The one reading under the floor is `--dya-accent` on
`--dya-selected` at 4.32, and the accent is never text on that surface: it is the ink of an
active key on the bar, where it measures 6.05 on `--dya-raised`. `--dya-code-comment`
`#8290ad` is the most recessive ink, 5.22 and 5.51 on the two surfaces a code block sits on.

`--dya-on-accent`, `--dya-on-field` and `--dya-on-status` are `#05080f`, the ground itself,
and measure 8.46 on the accent, 11.29 on success, 10.31 on warning and 9.90 on danger.
`--dya-on-idle` measures 6.81 on `--dya-idle`.

```text
token                  value     on chassis   on surface-1
--------------------   -------   ----------   ------------
--dya-border           #2c3859         1.60           1.53
--dya-border-strong    #41507a         2.34           2.24
--dya-hairline         #1f2946         1.29           1.23
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
  the job, legibility, is done on that theme's ground.
- **A badge may wear an accent as well as a status.** A status says how something turned out;
  an accent says what kind of thing it is, and a system with six hues that let a label reach
  three has three it declared and never spends. `--dya-on-accent` over each fill measures
  5.74 / 6.12 / 4.87 in Gi and 8.46 / 9.70 / 11.37 in Rei; as soft inks on `--dya-surface-1`,
  5.74 / 6.12 / 4.87 in Gi and 7.47 / 8.57 / 10.04 in Rei.

```text
token           Gi        fill   Rei       fill   role
-------------   -------   ----   -------   ----   ------------------------
--dya-success   #63cf95   9.30   #6fd6a4  11.29   a positive outcome
--dya-warning   #d6a95c   8.27   #e2b268  10.31   caution, not failure
--dya-danger    #f59790   8.29   #ff9b95   9.90   error, destruction
--dya-idle      per theme  7.73  per theme  6.81  no outcome yet
```

`fill` is `--dya-on-status` over the hue, or `--dya-on-idle` over `--dya-idle`. Each hue
has a `-soft` companion at 10% for the ground of a row or a quiet badge. As text rather than
fill, the three measure 6.18 / 5.50 / 5.51 at worst in Gi and 5.77 / 5.27 / 5.06 at worst in
Rei, both on `--dya-selected`, so `.dya-text--success` and `--danger` carry no reservation on
any surface in either theme.

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
- **The contour ring is the theme's own darkest value, not its opposite.** Black in Gi,
  `#02040a` in Rei. A white ring over a dark ground reads as a grey outline instead of as
  depth. No shadow uses positive spread.
- **Carving is relief for a word.** `--dya-carve` is a two-edged text shadow, one edge lit
  and one in shade, and the light comes from below in both themes, because both grounds are
  dark. `--dya-carve-filter` is the same pair as `drop-shadow`, for a
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
surfaces, 11.14 and 11.77 on Rei's. The em-relative size is deliberate: an expression
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
Structure    pane bar (--flush --inset) card card__header brand carved
Pressable    button (--primary --quiet --sm --danger --bare) key (--active) chip
             entry (--active) tile (__icon __name __note)
Input        field (--sm --auto) checkbox form (__wide __actions __push)
Content      tag badge (--accent --accent-2 --accent-3 --success --warning --danger --soft)
             table (__num) row
             title (--lg) lede text (--success --danger) label eyebrow value mono key-label
Documents    prose__scroll code (__kw __str __num __com __fn __pun) log math (--block)
Layers       menu menu__item (--selected) menu__shortcut tip
Navigation   tabs tab
Absence      empty (--inline __actions) loading
Assistive    sr-only
```

**Emphasis is a family, not an accident.** Every other rule here is a prohibition — do not
glare, do not truncate, never below 4.50 — and prohibitions produce a screen where nothing
is wrong and nothing is first. `title`, `lede`, `button--primary`, `tile` and
`empty__actions` are the five that say what matters:

- **`title` is a size and a tracking, never a weight.** It is `--dya-size-h3` at
  `--dya-weight`, carrying `--dya-text` where the line under it carries `--dya-text-3`.
  Hierarchy in this system comes from the type scale and the ink rank; a heading that
  reaches for 500 is how a screen ends up with four kinds of bold and still no order.
  `--lg` is the same rule at `--dya-size-h2`, for a screen that is only a heading.
- **`lede` is one sentence under a title**, sans, capped at 68ch, `--dya-text-3`. It is not
  `text`: the cap and the rank are the difference between a lede and a paragraph.
- **`button--primary` is the one action a screen is about.** At most one per view, because
  a second first is none. It is the only filled control in the system that does not report
  a status, and its hover step is `--dya-accent-hover` — a token rather than a filter,
  because a transition may name `background-color` and nothing else.
- **`tile` is a pressable card**: an icon, a name and one line. It is how a region with
  nothing in it yet offers what to do next, and the shell's launcher is built from nothing
  else.
- **`empty__actions` is the row under an empty state, and it is for a decision, not for a
  panel with nothing in it yet.** A panel that is simply empty says nothing at all: its
  controls live in its bar, which is where a reader who wants to open something is already
  looking. A title, a sentence and a button centred in a blank panel is an advertisement for
  a panel that has already been opened, and it was removed from the reader and the player for
  exactly that. What is left for this class is the case where the reader has to choose —
  a board that is gone, and the choice of which board to open instead.
- **`empty--inline` is absence inside a populated view**: one quiet line where the first row
  would be, because centring "nothing is running" in a band of its own makes the emptiest
  part of the screen the loudest.

`form` belongs to the same argument from the other side. The system had no form, so every
consumer invented one and each reached for the same wrong answer: a centred paragraph above
the input explaining what it does. Three of those in a column is a page of prose with three
boxes in it, and the reader parses a sentence to learn that the next box takes a number. A
form is a two-column grid — **what the field is called, and the field** — and the sentence
behind the name is a tip on the label. `__wide` spans both columns, `__actions` is the row at
the end, and `__push` sends what carries it and everything after it to the far end, which is
where a destructive action goes.

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
