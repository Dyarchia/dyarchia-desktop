# dyarchia-kanon design specification

The binding mandate for the shared visual system of the dyarchia products. `css/` is its
output. When the two disagree, this document decides.

Written as state, not as a diary: present tense, mandate voice, measurements as properties
of the system. The before-and-after of any change belongs in the commit body.

## Index

- [1. What the system is](#1-what-the-system-is)
- [2. Two themes over one contract](#2-two-themes-over-one-contract)
- [3. Gi](#3-gi)
- [4. Oneiro](#4-oneiro)
- [5. Colour rules](#5-colour-rules)
- [6. Relief](#6-relief)
- [7. Type](#7-type)
- [8. Shape and spacing](#8-shape-and-spacing)
- [9. Motion](#9-motion)
- [10. Components](#10-components)
- [11. Verification](#11-verification)
- [12. Open questions](#12-open-questions)

## 1. What the system is

Plain CSS custom properties, a layer of `dya-*` component classes, and two IBM Plex
families. No build step, no package manager, no dependency, no JavaScript, no test suite.
Consumers copy `css/` and `fonts/` and link a single stylesheet.

Declared consumers: dyarchia-desktop (Electron, React 19, Vite) and a web product on
Next.js.

```text
css/dyarchia.css     the only entry point; imports the five below, in this order
css/fonts.css        the six IBM Plex @font-face declarations
css/tokens.css       both themes
css/reset.css        normalisation, focus ring, scrollbars, reduced motion
css/motion.css       four keyframes, all prefixed dya-
css/components.css   the dya-* classes
fonts/               six static woff2, 336 KB
```

Import order is load-bearing. `reset.css` and `components.css` consume tokens, so
`tokens.css` precedes both. Every custom property is prefixed `--dya-`, every keyframe and
every class `dya-`.

## 2. Two themes over one contract

The system carries two dark themes. `Gi` is the default and lives on `:root`. `Oneiro` is
a single `[data-theme="oneiro"]` block that redefines **colour tokens only** — not a
radius, not a spacing step, not a duration, not a font size.

```text
theme    selector                  ground        the accent that carries the weight
------   -----------------------   -----------   ----------------------------------
Gi       :root                     achromatic    an orange ink, used sparingly
Oneiro   [data-theme="oneiro"]     blue-black    a blue field, flooded
```

A product switches by setting the attribute on the root element and nothing else:

```html
<html data-theme="oneiro">
```

Components never learn that themes exist. `components.css` names no colour, so a theme is
a change of values and can never be a change of rules. A theme that needs a new rule is
not a theme; it is a second system, and it is refused.

Both themes are dark. There is no light theme and the CSS never consults
`prefers-color-scheme`.

## 3. Gi

The ground is achromatic. Ten surfaces, of which six are sampled from a shipping product
and four are interpolated between them.

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

The warmth is a whisper and it is deliberate: `--dya-surface-2`, `--dya-flat-hover`,
`--dya-overlay` and `--dya-selected` carry one unit less blue than red and green. Below
them the ramp is neutral. The canvas is the only pure black and it carries nothing.

Text, measured against every surface it can sit on:

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-text      #d9d8d5  14.73    12.81    11.04     10.63           9.67       8.74
--dya-text-2    #cbcbc8  12.92    11.23     9.67      9.32           8.48       7.67
--dya-text-3    #b7b6b4  10.36     9.01     7.76      7.48           6.80       6.15
--dya-text-4    #9b9a98   7.47     6.50     5.60      5.39           4.90       4.43
```

Every text level clears AA on every surface except `--dya-text-4` on `--dya-selected`,
which measures 4.43. On that one surface the label level is `--dya-text-3`.

Three accents, in descending order of licence:

```text
token           value       bg   surf-1   raised   overlay   raised-hover   selected
-------------   -------   ----   ------   ------   -------   ------------   --------
--dya-accent    #d97757   6.73     5.85     5.04      4.85           4.42       3.99
--dya-accent-2  #6a9bcc   7.17     6.24     5.37      5.17           4.71       4.26
--dya-accent-3  #788c5d   5.71     4.96     4.28      4.12           3.75       3.39
```

`--dya-accent` is the primary. It is text on any surface up to and including
`--dya-overlay`; on `--dya-raised-hover` and `--dya-selected` it is a graphical object
only. It is also `--dya-field`, the flooded surface, where `--dya-on-field` `#151515`
measures 5.85 against it.

`--dya-accent-2` is the cool secondary and measures better than the primary everywhere.
It is the correct choice for a link, a selected state or an informational mark.

`--dya-accent-3` is the weakest ink in the system. It clears AA on the canvas, the sunken
step, the chassis and `--dya-surface-1` and nowhere else. Above `--dya-surface-1` it is a
graphical object — a dot, a bar, a fill — and never text.

## 4. Oneiro

The ground is blue-black. Four surfaces are sampled, six are interpolated.

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

`--dya-selected` breaks the monotonic ramp on purpose. In Oneiro selection is not a
lighter step of the ground; it is a saturated field, darker than `--dya-flat-hover` and
bluer than everything. It reads as a filled region rather than as relief.

Text and accents:

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

`--dya-text-4` measures 4.27 on `--dya-raised-hover` and is the only ink in the theme
below AA on any surface. On that surface the label level is `--dya-text-3`.

`--dya-field` is `#0000f2` and it is the point of the theme. It is not an ink: as text on
the chassis it measures 2.12 and fails, which is correct and intended. It is a surface
that carries `--dya-on-field` `#ffffff` at 9.20, clearing AAA. Whole panels are flooded
with it.

`--dya-accent` `#e0cbf8` is the theme's speaking accent, a pale lavender at 13.06 on the
chassis. It sits 28 degrees from the field in hue, so hue does not separate the two:
luminance does, by a factor of ten, and the ratio between them is 6.16.

The two accents divide by role and therefore never compete. The field carries weight by
area; the lavender carries it by contrast. The field floods, the lavender speaks.

## 5. Colour rules

- **A theme redefines values, never rules.** Everything in this section holds in both
  themes.
- **Colour is never the only signal.** It states an outcome; a word or an icon says what
  the outcome is.
- **An ink under 4.50 against the surface it sits on is not text.** It may still be a
  graphical object above 3.00: a dot, a rule, a selection bar, a focus ring, a fill.
- **The status hues are functional and do not belong to either theme's palette.** They are
  the same three values in Gi and Oneiro because their job is legibility, not identity.

```text
token           value     as a fill in Gi   as a fill in Oneiro   role
-------------   -------   ---------------   -------------------   ------------------
--dya-success   #63cf95              9.47                 10.58   a positive outcome
--dya-warning   #d6a95c              8.43                  9.42   caution, not failure
--dya-danger    #f59790              8.45                  9.44   error, destruction
--dya-idle      per theme               —                     —   no outcome yet
```

Each hue has a `-soft` companion at 10% for the background of a row or a quiet badge.
`--dya-on-status` is the ink on any status fill.

- **The syntax hues are functional on the same grounds, and are likewise declared once.**
  A highlighted token means the same thing in both themes, so `--dya-code-*` is defined on
  `:root` and Oneiro does not touch it. What changes between themes is the ground under
  the block, which is `--dya-surface-2` in both.

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

`--dya-code-comment` is the lowest ink in the system that is still text. It is deliberately
the most recessive of the six and sits just above the 4.50 floor on every ground; anything
darker would put a comment below the bar. `--dya-code-number` reuses the value of
`--dya-warning`, which is coincidence rather than kinship: they answer to different rules
and either may move without the other.

Colour is not the only signal here either, but the second signal is position in the
grammar rather than a word. Two of the six, keyword and string, converge under
deuteranopia; the system accepts that in a code block because a reader who cannot separate
them still has indentation, quotes and delimiters.

- **`--dya-faint`, the elevation shadows and the glass tokens are theme-neutral.** They are
  black and white alphas and resolve correctly over either ground. `--dya-elev-focus` is
  the exception: it names the accent and each theme overrides it.

## 6. Relief

- **Relief means pressable.** Buttons, keys and chips are raised. Rows, cells and
  containers are flat and express state through background.
- **A container that groups controls carries no relief of its own**, or the controls inside
  read as sunk into a well. The panel is the single exception and carries
  `--dya-elev-chassis`, a 1px light at 4%, which is a seam and not relief.
- **Only what receives input is recessed**: text fields, sliders, and any control while it
  is being pressed.
- **Hover changes the background, never the shadow.** There is no raised-hover elevation;
  `--dya-raised` moves to `--dya-raised-hover`.
- **The contour ring is black, not white.** A white ring over a near-black ground reads as
  a grey outline instead of as depth. No shadow uses positive spread.
- **Never name `box-shadow` in a `transition`.** It is the most expensive property to
  animate and it interpolates badly against a list of shadows.

## 7. Type

IBM Plex Sans Condensed for content, IBM Plex Mono for interface. Neither family ships a
variable font, so the system carries six static faces at weights 300, 400 and 500.

- **Hierarchy comes from size and tracking, never from weight.** 300 is for display and for
  a data figure; 400 and 500 carry everything else.
- **All interface text is mono, uppercase, with positive tracking chosen by role rather
  than by size.**
- **Interface text is uppercase and data is not.** A control label is a label. A file name,
  a path or a log line keeps its case, in mono at `--dya-tracking-mono`. `.dya-entry` is
  the class for that and it is the only list row in the system that does not uppercase.

```text
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    data labels in a table or a record
--dya-tracking-label    0.2em     section labels, buttons, chips, tabs
--dya-tracking-brand    0.26em    the brand badge, and nothing else
```

One scale, no breakpoint, no `clamp()`.

**The prose scale is a second, shorter scale, and it exists for documents the system did
not write.** A product that renders markdown, model output or a fetched file cannot put a
class on every element, so `.dya-prose` is the one block in the system that styles by
element rather than by class. Inside it, `h1` takes `--dya-size-h2`, `h2` takes
`--dya-size-h3` at 19px, `h3` takes `--dya-size-h4` at 15.5px, and `h4` through `h6` sit
at body size and separate themselves by weight, which is the single sanctioned exception
to hierarchy coming from size and tracking: six levels do not fit in four sizes.

Prose is content, so it is sans and it keeps its case. The one uppercase element inside
`.dya-prose` is a table head, which is a label.

`.dya-math` is the exception inside the exception: notation is data, not prose, so it is
mono at `0.94em` of whatever surrounds it and carries `--dya-text-2` — 11.23 on Gi's
`--dya-surface-1`, 10.71 on `--dya-surface-2`, 15.37 and 14.46 on Oneiro's. The em-relative
size is deliberate: an expression inside a heading has to scale with the heading, and no
step in the type scale can do that. `.dya-math--block` is the display form, centred with an
accent rule down its left edge and its own horizontal scroll.

## 8. Shape and spacing

```text
--dya-radius-sm         3px    control under 16px: checkbox, radio, toggle knob, thumb
--dya-radius            6px    buttons, chips, fields, cards, surfaces
--dya-radius-media      6px    image, video, media blocks
--dya-radius-chassis    9px    the panel, and nothing else
--dya-radius-tag       14px    the tag, and nothing else
--dya-radius-full     999px    accent dot, radio, avatar
```

Five radii and a pill. Something asking for 8px gets 6px. Spacing is the
`--dya-space-1` to `--dya-space-24` ladder and nothing outside it.

## 9. Motion

- **`transform`, `opacity` and `background-color` are the only properties any transition
  may name.** `color` and `border-color` change instantly, which is why hover on a tab or
  an entry snaps rather than eases. The list is closed: a sheet where half the hovers ease
  their colour and half snap has two habits, not one rule.
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a status dot. The
  loading state is a static `--dya-surface-2` block.
- **Pressing never changes colour alone.** It scales inward on `--dya-press-scale` and
  translates on `--dya-press-y`.
- **Performance outranks aesthetics.** WebGL, shaders and particle fields are out.
  `backdrop-filter` is opt-in and off by default: `--dya-glass` resolves to `none` and the
  base system emits none.

## 10. Components

`components.css` is the single declaration site for the `dya-*` classes. A consuming
product that restyles `.dya-button` has forked the system.

**It contains no literal colour, radius or duration.** Every rule resolves to a token.
This is what makes a theme possible at all, and it is the invariant to check first when
anything looks wrong in one theme and right in the other.

```text
Structure    panel bar (--flush) dock card card__header card__body rule brand
Pressable    button (--quiet --sm --danger) key chip item entry (--strong --active)
Input        field toggle checkbox radio slider
Content      tag badge (--success --warning --danger --soft) table row (--selected)
             metric display heading text label eyebrow value mono caret
Documents    prose (styles by element) prose__scroll
             code (__kw __str __num __com __fn __pun)
             math (--block)
Layers       menu menu__item tooltip
Navigation   tabs tab pagination
Absence      empty loading skeleton
```

## 11. Verification

There is nothing to build, lint or test. What replaces those commands:

- **Arithmetic.** Any change to a text, border, surface or accent token is re-measured as a
  WCAG contrast ratio against every surface it can sit on, **in both themes**, and the
  measured numbers go in the commit body. The surfaces are the ten listed in sections 3
  and 4.
- **Visual.** The system carries no render of its own. `scratch/build_themes.py` generates
  a page holding both themes over the real component layer with every ratio computed and
  marked; regenerate it and look. `scratch/` is gitignored.
- **The invariant.** `components.css` must resolve to zero literal colours. Verify against
  the CSSOM, not by reading the file.

## 12. Open questions

- Ten components are derived from these rules rather than observed in a design: toggle,
  checkbox, radio, slider, content tabs, pagination, empty, loading and skeleton. They are
  the first candidates for revision.
- The IBM Plex stylistic sets are undetermined.
- `.dya-prose` styles by element and every other component styles by class. The exception
  is justified by content the system does not author, but it is still an exception, and a
  second one would mean the rule is not holding.
- Oneiro has no observed source for its raised and overlay steps, only for its chassis,
  surface, raised and selected. The four interpolated values have not been seen against
  real content.
- Whether `--dya-field` earns its place in Gi is open. It currently aliases the primary
  accent, which is the one value the theme is told to use sparingly.
- The system carries no version a consumer can read. A product vendors `css/` and its
  plugins then reference `dya-*` classes from the document without importing anything, so
  a plugin's dependency on this system is real, unversioned and invisible. A plugin
  written against a class this system has not shipped yet installs cleanly and renders
  wrong, with nothing to check and nothing to report. Exposing the version at runtime,
  letting a plugin declare a minimum and having the host say something when it is not met
  is the shape of an answer; whether an unmet minimum should refuse to load or only warn
  is the part that needs deciding.
- The system has no flat pressable. dyarchia-desktop draws the open control of two panels
  as a bare icon with no background, border or relief, because an empty panel holding one
  raised button reads as an unfilled form. It does that with plugin-prefixed rules built
  from tokens, which is the sanctioned escape hatch and also a standing bug report: a
  `.dya-button--bare` beside `--quiet` would let the product drop those rules.
