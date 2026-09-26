# dyarchia-kanon

The shared visual system: plain CSS custom properties, a layer of `dya-*` component
classes and three families under the SIL Open Font License. No build step, no dependency,
no JavaScript, no test suite. This file is the authority over the CSS: it states what the
system is, not how it got there. The before and after of a change belongs in its commit
body.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the eight @font-face declarations
css/tokens.css       the one theme
css/reset.css        normalisation, [hidden], the ground, focus ring, scrollbars, reduced motion
css/motion.css       four keyframes, all prefixed dya-
css/components.css   the dya-* classes
fonts/               eight static woff2, 536 KB
tools/contrast.py    the measurement Verification requires
tools/palette.py     what lifts the six reference colours to lights, inks and bright twins
```

The shell links `css/dyarchia.css` once, before React mounts, and every plugin renders
into that document. Import order matters: `reset.css` and `components.css` consume tokens,
so `tokens.css` precedes both. Every custom property is prefixed `--dya-`, every keyframe
and every class `dya-`.

`[hidden]` is declared `!important`, which is the only form that works: the UA stylesheet
loses to any class that sets `display`, so a hidden flex container stays on screen. A
consumer toggling `element.hidden` is guaranteed an effect. Hidden but laid out is
`visibility`.


## Four materials, three voices

The system is made of four materials, and every element on a screen is one of them.

```text
material   what it is                                     where it is
--------   --------------------------------------------   ------------------------------
glass      a translucent white that fades downward,       the panel, and only the panel
           under a hairline and a rim lit from above
key        a flat face, 3px corners, a hard 3px edge      every control
           underneath with no blur; pressed, it drops
           2px onto its edge and the edge is gone
pill       round, a faint glass of its own, its words     every piece of information:
           in the mono                                    a group, a tag, a count
light      a dot in green, yellow or red with a glow of   status, and only status
           its own colour
```

The three voices are the three families: Spectral for the brand, Plex Sans for the
interface, Plex Mono for data.

**Round is information and square is action.** A pill is never pressable and a key is never
round, so a reader never has to try something to learn whether it does anything. A chip,
which is pressable, is square. A tag, which is not, is round.

**A light lives inside a pill or around a key, and nowhere else is colour spent on status.**
Green is up to date or running, yellow is changed or waiting, red is failed or stopping. A pill
without a light is information with no outcome: a group, a count, a kind. Which of several
things of one kind something is, is a hue, and it is never a dot inside a pill, because a dot
inside a pill is a light.

**The glass needs no blur.** Nothing in the system uses `backdrop-filter`. The shell paints
`--dya-ground`, an even near-black, with `--dya-noise`, a static grain, over it; a panel is
translucent white over that, lit along its top rim, and the grain showing through is what
reads as frosted. The ground carries no pools of light: an uneven ground made the same panel a
different grey in each corner of the window. A surface that covers content, a
sheet or a menu, is opaque, because glass over content is content read through a veil.


## One theme

There is one theme, on `:root`, and nothing reads a theme attribute. It is graphite: a
near-black with a cold cast, and inks that are grey with a little blue in them. The CSS never
consults `prefers-color-scheme`; `--dya-scheme` hands `dark` to `color-scheme` on the root, so
a native scrollbar, a form control the system has not replaced and the `canvas` keyword follow
it.

```text
token                  value     relative luminance   role
--------------------   -------   ------------------   ----------------------------------
--dya-bg               #0a0b0d              0.00333   the ground under the glass
--dya-sunken           #0c0d0e              0.00398   a log, a code block, a terminal, a field
--dya-chassis          #0e0f11              0.00475   the glass at its foot; a board's stages
--dya-overlay          #141518              0.00751   a menu, a tip, a sheet
--dya-surface-1        #161719              0.00854   the glass at its head
--dya-disabled         #1a1b1e              0.01097   the face of a key that is off
--dya-surface-2        #1c1e21              0.01285   a raised step inside the glass
--dya-raised           #1f2125              0.01513   the face of a key
--dya-flat-hover       #202124              0.01522   a flat row under the pointer
--dya-raised-hover     #23262a              0.01911   a key under the pointer
--dya-selected         #2a2d32              0.02599   a key that is on, or held down
```

The glass and the pills are alphas of white, and two grounds exist only where those alphas
stack. `tools/contrast.py` measures every ink against them as `glass-peak`, `#27292c`, and
`card-peak`, `#2f3033`, a card on that glass. They were measured over the brightest pool of
light the ground used to carry and are kept as a ceiling: the ground today is darker than
either, so every figure in this file is the worst case, and a ground that ever brightens
again stays inside what the inks were solved for.

```text
token              value       bg   surf-1   raised   overlay   r-hover   selected   card-peak
----------------   -------   -----   ------   ------   -------   -------   --------   ---------
--dya-text         #e6e8ec   16.05    14.62    13.14     14.88     12.39      11.26       10.76
--dya-text-2       #c4c8cf   11.73    10.69     9.60     10.88      9.05       8.23        7.86
--dya-text-3       #a3a8b2    8.25     7.52     6.76      7.65      6.37       5.79        5.53
--dya-text-4       #9499a3    6.89     6.27     5.64      6.39      5.31       4.83        4.61
--dya-accent       #c9ced6   12.45    11.35    10.20     11.55      9.61       8.74        8.35
--dya-success-ink  #9ad8ab   11.99    10.92     9.82     11.11      9.25       8.41        8.03
--dya-warning-ink  #f3d687   13.86    12.62    11.35     12.85     10.69       9.72        9.29
--dya-danger-ink   #f4a59d   10.05     9.15     8.23      9.32      7.75       7.05        6.73
```

**Every ink is text on every ground in the system**, the quietest at 4.61 on a card at the
brightest point of the glass. `--dya-text-4` is the tabs that are not open, the head of a table
column, the eyebrow, the meta line and the key-label. `--dya-text-off`, `#6b717c`, is the one
ink that is not text: it is the word on a key that cannot be pressed, which is exempt, and it
is chosen to look off rather than to be read, 3.51 on `--dya-disabled`.

`--dya-accent` is a silver, not a hue. It marks what matters without meaning anything: the
primary key's light, the splitter under the pointer, the rule beside a displayed expression,
the selection behind highlighted text, with `--dya-on-accent` over it at 12.45. Colour in this
system is spent on status and on which-one, and emphasis gets neither.

```text
token                 value     on bg   on chassis   on surface-1   on raised
-------------------   -------   -----   ----------   ------------   ---------
--dya-border          #2e3136    1.51         1.47           1.37        1.24
--dya-border-hover    #373a40    1.73         1.68           1.57        1.41
--dya-border-strong   #44474e    2.12         2.06           1.93        1.73
--dya-border-menu     #2a2c31    1.41         1.37           1.28        1.15
```

A border is a graphical object and the 3.00 bar does not apply to it. `--dya-border` is the
outline of a key and moves to `--dya-border-hover` under the pointer and to
`--dya-border-strong` when the key is on. `--dya-hairline` is white at 7%: it outlines a panel,
a card, a field, a log and a code block. **Nothing inside a panel is divided by a horizontal
line**: not a table's rows, not a bar from what is under it, not a tab strip, not a card's head.
Space divides, and a row under the pointer lifts its ground.
`--dya-pill-border` is white at 9%, the outline of a pill.


## Colour rules

- **Colour is never the only signal.** It states an outcome; a word or an icon says what
  the outcome is.
- **An ink under 4.50 against what it sits on is not text.** Above 3.00 it may still be a
  graphical object: a dot, a rule, a selection bar, a focus ring, a fill.
- **Status, hue and emphasis are three axes, never mixed.** Status is the three lights. Hue
  says which one of several things of one kind this is. Emphasis is the silver accent, the
  type scale and the ink rank.

**Six colours and no others.** Blue, purple, orange, green, yellow and red, taken from one
reference, and every one of them has a single job. Green is success, yellow is warning and
red is error, everywhere and always: a green that meant anything else would be read as a
green that passed. Blue, purple and orange mean nothing about how anything went, so they are
the three that say which one. A mark that belongs to somebody else keeps its own colours and
is none of the six.

Each colour is two tokens. The colour itself, `--dya-<name>`, is for what is not text: a
light, a dot, a bar, a glow. Blue and purple are the reference lifted in OKLCH until they
clear 3.00 as graphical objects on the lightest ground a panel has. The `-ink` is the same hue
lifted until it is text on every ground, and it is what a word in that colour is written in.
Purple's ink turns 15 degrees toward magenta before it is lifted: at its own hue it lands so
close to blue's that a keyword and the name it declares read as one colour.

```text
colour    value     worst     ink       worst
-------   -------   -----     -------   -----
blue      #1970fd    3.00     #75a8fe    5.52
purple    #8559f9    3.01     #c790fe    5.56
orange    #f07a35    4.74     #fe8743    5.50
green     #4bbc6e    5.48     #4dbe70    5.60
yellow    #f5b031    7.00     #f5b031    7.00
red       #ec4b3a    3.54     #ff8472    5.53
```

Worst is the ratio on `card-peak`, the lightest place a panel's text lands.

**The lights are green, yellow and red.** `--dya-success`, `--dya-warning` and `--dya-danger`
are those three colours, and each has four tokens: the light itself, a `-soft` tint at 11 to
12% for the ground of its pill, a `-line` at 30 to 32% for the pill's border, and an `-ink`
for its words. **A light is never text**: red is 3.54 on `card-peak`, and every light's words
are its ink, 5.53 at the least. `--dya-idle` is the grey dot of a pill with nothing to report,
3.85 at the least, a graphical object everywhere it sits. `--dya-on-status` is the ground's own
near-black, and ticks a checkbox over green at 8.17.

**Hue says which one.** Three categorical hues, blue, purple and orange, mark which of several
things of one kind something is: which group of corpora, which agent. `hue--<name>` sets
`--dya-hue` to the colour's ink and `--dya-hue-light` to the colour itself. A plugin has no
hue: the chrome is black and white, and a plugin is told apart by its icon and its name.

**A hue is an ink, never a fill.** It colours the word of a pill (`tag` under `hue--<name>`)
and the dot beside a name (`dot`, `legend`), and nothing else. A thing with a face wears its
face rather than a dot: a plugin's tab and its row in Setup carry the plugin's icon, a
terminal running a known program carries that program's mark, a card carries its agent's.
`glyph--mark` is somebody else's mark and never wears a hue: in its own colours where it has
them, in the ink of the text beside it where it is monochrome.

A hue is assigned, never chosen per screen: a set of categories inside a plugin gets its hues
from `ctx.hues`, which keeps a key's hue as long as the set does not force it to move. Past
three, hues repeat, and the name beside the colour is what tells them apart.

**The terminal's sixteen colours are tokens.** `--dya-ansi-*` holds the six chromatic colours
and their bright twins; black and white are the system's own ink ranks. Red, green, yellow,
blue and magenta are the inks of red, green, yellow, blue and purple; cyan is the one colour a
terminal needs that the palette does not have, and keeps its own. The bright twins are the
same hues lifted to 9.00. A `log` renders the same colours when a program writes them:
`ansi--<name>` for the twelve, `--black`, `--bright-black` and `--dim` in `--dya-text-4`,
`--white` and `--bright-white` in `--dya-text-2` and `--dya-text`, `--bold` at 500.

```text
token                 value     on sunken   on card-peak   says
-------------------   -------   ---------   ------------   -------------------------------
--dya-code-keyword    #c790fe        8.20           5.56   the language's own words
--dya-code-string     #4dbe70        8.26           5.60   what is quoted, an added line
--dya-code-number     #fe8743        8.12           5.50   a value written out
--dya-code-function   #75a8fe        8.14           5.52   a name being declared, a heading
--dya-code-key        #f5b031       10.32           7.00   the key of a pair
--dya-code-deleted    #ff8472        8.15           5.53   a removed line
--dya-code-punct      #a3a8b2        8.15           5.53   punctuation and operators
--dya-code-comment    #9499a3        6.80           4.61   a comment
```

**Code is coloured by highlight.js**, through `highlight` in `@dyarchia/sdk`, which registers
the grammars the application meets and emits every scope under the `dya-code__` prefix. The
scopes are grouped onto the eight inks above in `components.css`, so a grammar added later
lands on a colour without a rule of its own. The key of a pair has its own ink, which is what
sets a JSON or YAML key apart from its value. A block that declares no language is guessed
among the common ones and left plain when no grammar is confident. `--dya-code-comment` shares
its value with `--dya-text-4` and is the most recessive of the eight.


## Materials

- **Glass is the panel.** `--dya-glass` is white from 5% at the top to 2% at the foot, under
  `--dya-hairline`, with `--dya-elev-chassis`, a 1px light along the top inside. Its rim,
  `--dya-glass-edge`, is a gradient border cut out of a pseudo-element with a mask: bright
  along the top, all but gone halfway down the sides, a trace again at the foot. A border
  cannot carry a gradient, and a panel lit from above is lit unevenly. A card is the same glass
  one step brighter, `--dya-glass-card`, and is not relief: nothing about it says press.
- **A key is every control**: `button`, `key`, `chip`, `tile` and the `select` wrapper's
  field. `--dya-raised` under `--dya-border`, corners at `--dya-radius-sm`, and
  `--dya-elev-key`: a lit top edge inside and a 3px edge underneath in `--dya-edge`, with no
  blur. Pressed, it translates by `--dya-press-y` and its shadow becomes
  `--dya-elev-key-down`, a 1px edge, so it is sitting on what it stood on. The drop animates
  over 50ms; the edge swaps in the same frame, because a transition may not name
  `box-shadow`.
- **A key that is on stays up and brightens**: `--dya-selected` under `--dya-border-strong`,
  white ink. A key whose panel is open is held down: it sits on its edge with its glyph in the
  top ink. A key that cannot be pressed keeps its shape, loses its light and wears
  `--dya-text-off` over `--dya-disabled`.
- **Three keys are lit.** A lit key has a border in its light, an ink mixed from its light
  and `--dya-text`, and a still glow cast on the glass around it, `--dya-glow` in the light at
  70%. `button--primary` is lit in the silver accent, the one action a view is about, at most
  one per view. `button--success` is lit green: go, run, approve. `button--danger` is lit red:
  stop, delete. Lit inks measure 11.49, 9.05 and 6.87 on the key's face and 10.83, 8.53 and
  6.47 on its hover step. `button--danger button--quiet` is a plain key with a red ink, for a
  destructive action offered among others: the light is for the confirmation.
- **The halo says here.** `--dya-halo` is the primary key's silver glow, and it is spent on
  one other thing: where the window is. The open tab in the group being worked in, the open
  tab inside a panel, the tile under the pointer, the field being typed into. Words take it as
  `--dya-halo-text`. The title bar's keys never wear it: held down is all an open panel's key
  says. A tile's halo is a pseudo-element that fades in on `opacity`, because a hover never
  changes a key's shadow.
- **A glow never breathes.** Nothing in this system animates for as long as a panel is open,
  and a light that pulsed would be the one thing on screen that did.
- **A pill is information.** `tag` and `badge` share one shape: 22px tall, round, the mono at
  `--dya-size-pill` and 500, `--dya-glass-pill` under `--dya-pill-border` with a lit top edge.
  A `tag` has no light; its word is `--dya-text-3`, or its hue under `hue--<name>`. A `badge`
  always has one: a 6px dot with a glow of its own colour, grey and still when it is idle.
- **`light` is a light on its own**: the state of a card, a run, a row, where a whole pill
  would be too much. The same dot a badge carries, with the same three modifiers.
- **Only what receives input is recessed.** A `field` is set into the glass: `--dya-sunken`
  under a hairline, with `--dya-elev-sunken` falling in from the top edge, and
  `--dya-elev-focus` adds a ring in `--dya-focus` and the halo while it is being typed
  into. A list to choose from is a key, because nothing is typed into it.
- **`button--bare` is the one control that is not a key**: a glyph with no face, for the close
  on a tab and the icons inside a row, where a key's edge would be a stamp on every line. It
  presses by scale, because nothing that never stood up can sink.
- **Carving is relief for a word.** The wordmark is cut into the metal: a gradient of
  `--dya-carve-a` to `--dya-carve-b` clipped to the letters and cut by `--dya-carve-filter`, a
  dark lip above and a light one below. It is not text and says so: the window's title carries
  the name for anything that reads it. `.dya-carved` is the wordmark at display size, the
  whole content of the launcher; `.dya-brand` is the same cut at `--dya-size-brand`, centred in
  the title bar whenever a panel is open, and absent while the launcher shows the large one.
- **The focus ring is an outline**, 2px in `--dya-focus` at an offset of 3px, and never a
  shadow, because a key's shadow is its edge.


## Type

**IBM Plex Sans is the interface. IBM Plex Mono is the data. Spectral is the brand.** Seven
static faces: sans at 300, 400 and 500, mono at 400 and 500, serif at 300 and 500.

- **The interface speaks in sentence case, in the sans.** A tab, a button, a label, a menu
  item.
- **Capitals are two components' privilege**: the eyebrow, which names a region, and the head
  of a table column. Both are small and tracked. The brand and the carved word keep theirs,
  because a wordmark is not interface text.
- **Data keeps its face and its case.** A file name, a path, a target, a model name, a figure,
  a log line, and every word inside a pill: mono at `--dya-tracking-mono`, in whatever case it
  came in.
- **Hierarchy comes from size, tracking and rank before weight.** 500 is the key's label, the
  pill's word, the eyebrow, the head of a column, the open tab and the brand; 300 is the
  serif's figure.
- **The serif is the brand and the one big figure.** `.dya-brand`, `.dya-carved` and
  `.dya-stat__value`; a heading, a label or a sentence in Spectral is a fork.
- **Nothing in the interface is smaller than 10.5px, and only the eyebrow is that small.**

```text
--dya-size-body       14px     prose, sentences, the empty state
--dya-size-body-sm    13px     a panel's tab, a table's prose cell
--dya-size-body-xs    12.5px   keys, labels, tabs inside a panel, menu items
--dya-size-mono       13px     the mono block
--dya-size-mono-sm    12.5px   code, fields, table cells, the options of a list
--dya-size-mono-xs    12px     log lines, the meta rank
--dya-size-pill       11.5px   the word inside a pill
--dya-size-label      11px     the head of a table column, a key's shortcut
--dya-size-label-sm   10.5px   the eyebrow
--dya-size-brand      30px     the wordmark in the title bar, 472px wide
```

```text
--dya-tracking-ui       0         every word of the interface, in the sans
--dya-tracking-key     -0.005em   the label on a key
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-head     0.06em    the head of a table column
--dya-tracking-label    0.16em    the eyebrow
--dya-tracking-brand    0.34em    the brand and the carved word, and nothing else
```

One scale, no breakpoint, no `clamp()`. The prose sizes `--dya-size-h2` to `--dya-size-h4`
are tokens for documents the system did not write: whatever renders markdown styles by
element under its own prefix, from these sizes.

`.dya-math` is notation, so it is data: mono at `0.94em` of its surroundings in
`--dya-text-2`. The em-relative size is deliberate: an expression inside a heading has to
scale with it. `.dya-math--block` is the display form.


## Shape, spacing and motion

```text
--dya-radius-sm         3px    every key, a field, a checkbox, a menu row, a tip
--dya-radius            6px    a menu
--dya-radius-card       8px    a card, a log, a code block, a masthead, a media block
--dya-radius-chassis   12px    the panel and the sheet, and nothing else
--dya-radius-full     999px    a pill, a light, a dot, a meter's pip, a scrollbar thumb
```

A key is 34px tall and a small key 28px; a field matches the key beside it. Something asking
for 10px gets 8px or 12px. Spacing is the `--dya-space-1` to `--dya-space-24` ladder and
nothing outside it.

- **`transform`, `opacity` and `background-color` are the only properties a transition may
  name.** `color` and `border-color` change instantly. The list is closed. **Never name
  `box-shadow` in a transition.**
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a light, no breathing
  glow.
- **Pressing moves the control.** A key drops on `--dya-press-y`; a bare glyph and a menu row
  scale on `--dya-press-scale`.
- **Performance outranks aesthetics.** No WebGL in the system, no shaders, no
  `backdrop-filter`. The grain and every glow are static images and shadows, painted
  once. The carve filter is two static drop shadows on one word and is the
  only `filter` in the system.


## Components

`components.css` is the single declaration site for the `dya-*` classes. A product that
restyles `.dya-button` has forked the system. **It contains no literal colour, radius or
duration**: every rule resolves to a token.

**The system carries only what something consumes.** A class nobody uses is dead code and
goes. A plugin that needs what the system does not declare proposes it here first, with its
contrast measured and its rule written in this file, and only then uses it.

```text
Structure    pane bar (--flush --inset __group) card (--lift) card__header masthead brand
             carved splitter (--vertical) sheet (--side)
Keys         button (--primary --success --danger --quiet --sm --bare) key (--active) chip
             tile (--dense __icon __head __name __note)
Input        field (--sm --auto --prose) select checkbox form (__actions __push)
Pills        tag (--key) badge (--success --warning --danger) pills
Lights       light (--success --warning --danger) meter (__pip)
Hue          hue--<name> dot legend glyph (--mark)   (blue purple orange)
Content      table (__num __fit __key __name __subject __end __prose) row (--selected)
             stat (__figure __value __unit __text __note)
             title (--lg) lede text (--success --danger) label eyebrow value meta mono
             key-label
Documents    prose__scroll code (__<highlight.js scope>) log math (--block)
Layers       menu menu__item (--selected) tip scrim
Navigation   tabs tab
Absence      empty (--inline __actions) loading
Assistive    sr-only
```

**A table is rows, not cards and not lines.** Rows sit straight on the glass with nothing
between them but their padding, because the glass is already the object, a card per row is a
surface on a surface, and a rule per row is a ladder the eye has to climb. The head of each column is small tracked capitals over the data. Hover
lifts a row's cells by `--dya-glass-hover`, white at 2%; a selected row is `--dya-glass-press`,
white at 5%, in the first ink. Digits are `tabular-nums`.

**A row has one cell in the top ink, and only one: what the row is about.** Everything else,
the description, the figures, the dates, the group, is in `--dya-text-3`, the table's own ink.
A table where every cell is lifted reads as white and one where none is reads as grey, and
neither says where to look. `__name` is that cell when it is data naming the row, a profile, a
corpus, a plugin, on one line; `__subject` is that cell when it is a sentence or a path and
wraps: the value beside a key, the lead of a log line, the first column of a table somebody
wrote in markdown. `__prose` sets a cell in the sans and leaves its rank alone.

**`table__key` and `table__name` are the same column and not the same thing.** A key is
interface text saying what the value beside it is, sans and `--dya-text-4`. A name is data, so
it keeps its case. `__fit` is the width both share and nothing else, `__end` is that width at the
end of the row, where an action sits, and a `td` wraps anywhere, because a table cell that
makes a panel scroll sideways to read a path is unusable at panel width.

**`select` is the platform's own list, drawn by the system.** The wrapper holds a native
`<select>` with `appearance: base-select`, so the list it opens is a `::picker(select)` in the
menu's material: `--dya-overlay` under `--dya-border-menu`, rows in the mono that answer the
pointer with a breath of white, the chosen one marked by `::checkmark` in green. An `<hr>`
inside the select is a hairline between sections. The chevron is the wrapper's and turns over
while the list is open. No script is involved.

**`checkbox` is lit when it is ticked**: green, with the ground's own near-black for the tick.

**`splitter` is the handle between two regions of a panel.** The strip is 11px for a pointer
to catch and pulls its own height back out of the layout with a negative margin, so adding one
moves nothing above it; the grip is a 64 by 4 pill in `--dya-text-4`, and takes the accent
under the pointer and while dragging. The consumer owns the drag, the clamp and where the size
is remembered.

**A sheet that covers is modal, and modality is two things or it is neither.** A sheet is
inset from its panel, so what it opened over keeps showing around it, and that margin is where
the defect lives: rows still visible there hover, take a click and answer it, and the whole
region behind stays in the tab order. A covering sheet therefore raises a `scrim` over what it
covers and sets `inert` on it in the same breath. `--dya-scrim` is the ground at 72%. Two more
belong to the consumer: focus into the sheet when it opens and back to whatever raised it when
it closes, and Escape bound to the panel rather than to the sheet.

**`sheet--side` is the one that is not, until it covers.** A side sheet is the detail beside
the list it came from, and the list stays live because picking the next item out of it is
what the arrangement is for. A side sheet widened to cover the panel is a covering sheet
whatever class it carries, and owes the scrim, the `inert`, the focus and the Escape.

**Emphasis is a family, not an accident.** Every other rule here is a prohibition, and
prohibitions produce a screen where nothing is wrong and nothing is first. `title`, `lede`,
`button--primary`, `tile`, `empty__actions` and `stat` are the six that say what matters:

- **`title` is a size and a tracking, never a weight.** `--dya-size-h3` at `--dya-weight`, in
  `--dya-text`. `--lg` is the same rule at `--dya-size-h2`, for a screen that is only a
  heading.
- **`lede` is one sentence under a title**, sans, capped at 68ch, `--dya-text-3`.
- **`button--primary` is the one action a screen is about**, lit in silver. At most one per
  view, because a second first is none.
- **`button--success` is go, and it is not a second primary.** A success key is a meaning, and
  a view may hold one beside the lit red that is its opposite.
- **`tile` is a pressable card**: an icon, a name and one line. It is how a region with
  nothing in it yet offers what to do next; the shell's launcher is built from nothing else,
  and the reader and the player each carry one.
- **`empty--inline` is absence inside a populated view**: one quiet line where the first row
  would be.

**A stat is loud by size and never by weight.** Its `__value` is the serif at
`--dya-size-display` and 300, against a `.dya-label` name beside it; `__unit` is what the
figure is out of or measured in, `__note` is the one line under it. **At most one stat per
view.** `masthead` is where a stat usually sits: a card at the head of a view, saying once
what the view is about. It wraps, because at a 400px pane a stat, a name and two pills are
three lines.

**`meter` is a capacity, not a progress bar**: n marks, lit green with a glow while what they
count is busy, idle grey otherwise. It never animates. Draw one only above two marks: a single
pip is a stray dash.

**`form` is a two-column grid: what the field is called, and the field.** The sentence behind
the name is a tip on the label, which is where an explanation that is not always needed
belongs. `__actions` is the row at the end, spanning both columns, and `__push` sends what
carries it and everything after it to the far end, which is where a destructive action goes.

**`pane` declares an element a query container named `pane` and carries no look.** A panel's
width is its own, so a viewport query answers the wrong question. A consumer writes
`@container pane (max-width: 700px)`. **The three widths the system is measured at are 400,
700 and 1900.** A consumer that needs a threshold of its own declares its own container rather
than bending the pane's.

**Prose is sans.** The field and the table are mono, because most of what they hold is data,
and a sentence set in mono at a tracking meant for identifiers reads as a ransom note.
`field--prose` and `table__prose` are the two places a consumer needs it: a title, a brief, a
note, a query, a description.

Five distinctions in that list are easy to collapse and are not the same thing:

- **`code` is authored, `log` is streamed.** Code scrolls sideways because its indentation
  carries meaning. A log wraps, because a panel that scrolls to read a filename is unusable at
  panel width.
- **`badge` is a light in a pill, `text--*` is a sentence.** A reported outcome in prose must
  not be dressed as a label.
- **`tag` is information, `chip` is a key.** The first is round, the second square.
- **`bar` is a strip of the glass with the padding of a bar, `bar--inset` is a row of controls
  without it.** Neither has a ground or a rule of its own.
- **`tag--key` is a pill as tall as a key**, for the one pill that sits in a row of keys: the
  build in the title bar. It keeps the pill's word and its width.
- **`tip` is a sentence, `menu` is a choice.** A tip is a `[popover="hint"]` the browser
  opens on interest, anchored to its `[interestfor]` control by the engine. A control that
  shows only an icon carries a tip and an `aria-label`, and `key` is that control.


## Verification

There is nothing to build, lint or test. What replaces those commands:

- **Arithmetic.** Any change to a text, border, surface or light token is re-measured
  against every ground it can sit on, the two composite grounds included, and the numbers go
  in the commit body. `py tools/contrast.py <token-suffix>` reads `tokens.css` and prints that
  grid; a literal `#rrggbb` measures a value that is not a token yet.
- **Visual.** The system carries no render of its own; the desktop shell is the render. With
  the app running in dev, `node scripts/screenshot.mjs out.png` at the workspace root captures
  the window over the Chrome DevTools Protocol, and an optional second argument is an
  expression evaluated in the page first.
- **The invariant.** `components.css` must resolve to zero literal colours. Verify against
  the CSSOM, not by reading the file.


## Open questions

- `pane` has been measured against all six panels at 400, 700 and 1900. The terminal cannot
  be measured that way, because xterm refits from a `ResizeObserver` and a background window
  is given no frames to deliver one in.
- The two thresholds in use are properties of their content, not of the system: 640 for a
  corpus row and 900 for the cost panel's ten columns, both measured against the data on one
  machine.
- The SDK's markdown renderer emits `code`, `math` and `prose__scroll`. docviewer styles the
  elements between them with its own prefixed rules; a second consumer is what would move
  those rules upstream.
- `text--warning` is absent and its two siblings are present, because nothing reports a
  warning in prose yet. The triad returns whole the day something does.
- The IBM Plex stylistic sets are undetermined.
