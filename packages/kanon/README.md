# dyarchia-kanon

Shared CSS for the dyarchia products. Two dark themes over one token contract, one pair of
typefaces, one grammar of relief, and a layer of components the products consume without
redefining them. No dependencies, no build step, no JavaScript.

## What is here

```text
css/dyarchia.css      single entry point, imports the five below
css/fonts.css         the six IBM Plex @font-face declarations
css/tokens.css        both themes
css/reset.css         normalisation, focus, scrollbars, reduced motion
css/motion.css        four keyframes
css/components.css    the dya-* classes
fonts/                IBM Plex Sans Condensed and IBM Plex Mono, 336 KB for six
```

## Usage

Copy `css/` and `fonts/` into the project and link one stylesheet:

```html
<link rel="stylesheet" href="css/dyarchia.css">
```

That gives you `Gi`, the default theme. To get the other one, set an attribute on the root
element and change nothing else:

```html
<html data-theme="oneiro">
```

Both themes are dark. There is no light theme and the CSS never consults
`prefers-color-scheme`.

## The two themes

`Gi` is achromatic: a neutral ramp from pure black to `#343433`, with a whisper of warmth
in the upper half, and three accents used as ink. The orange is the primary and appears
sparingly.

`Oneiro` is blue-black, and its accent is a field rather than an ink. `--dya-field`
`#0000f2` fails as text on purpose — it is a surface that carries white at 9.20, and whole
panels are flooded with it. The theme's speaking accent is a pale lavender at 13.06 on the
chassis. The field carries weight by area, the lavender by contrast, so the two never
compete.

```text
                        Gi          Oneiro
---------------------   ---------   ---------
--dya-bg                #000000     #04040e
--dya-chassis           #111111     #0a0a20
--dya-surface-1         #151515     #101026
--dya-selected          #343433     #08084a
--dya-text              #d9d8d5     #ffffff
--dya-accent            #d97757     #e0cbf8
--dya-accent-2          #6a9bcc     #cdcdf5
--dya-accent-3          #788c5d     #9797a0
--dya-field             #d97757     #0000f2
--dya-on-field          #151515     #ffffff
```

Three inks sit below AA somewhere and are graphical objects there, never text:
`--dya-accent-3` in Gi above `--dya-surface-1`, `--dya-accent` in Gi on
`--dya-raised-hover` and `--dya-selected`, and `--dya-text-4` on one surface in each theme.
The full measurement tables are in `docs/specs/`.

## Components

Reference the classes; do not redefine them. A product that restyles `.dya-button` has
forked the system.

```text
Structure    dya-panel  dya-bar (--flush)  dya-dock  dya-card  dya-card__header
             dya-card__body  dya-rule  dya-brand
Pressable    dya-button (--quiet --sm --danger)  dya-key  dya-chip  dya-item
             dya-entry (--strong --active)
Input        dya-field  dya-toggle  dya-checkbox  dya-radio  dya-slider
Content      dya-tag  dya-badge (--success --warning --danger --soft)
             dya-table  dya-row (--selected)  dya-metric  dya-display
             dya-heading  dya-text  dya-label  dya-eyebrow  dya-value  dya-mono
Layers       dya-menu  dya-menu__item  dya-tooltip
Navigation   dya-tabs  dya-tab  dya-pagination
Absence      dya-empty  dya-loading  dya-skeleton
```

A panel with a bar, a card and a pressable control:

```html
<div class="dya-panel">
    <div class="dya-bar">
        <span class="dya-brand">Dyarchia</span>
        <button class="dya-chip dya-chip--active">Trace</button>
    </div>
    <div class="dya-card">
        <div class="dya-card__header">
            <span class="dya-value">Behaviour matrix</span>
            <button class="dya-button">Modify</button>
        </div>
        <div class="dya-card__body">
            <input class="dya-field" placeholder="Search">
        </div>
    </div>
</div>
```

`components.css` contains no literal colour, radius or duration. Every rule resolves to a
token, which is what lets a second theme exist at all: a theme changes values and can never
change rules.

## The tokens you will reach for

```text
Surface     --dya-bg  --dya-chassis  --dya-surface-1  --dya-surface-2
            --dya-flat-hover  --dya-raised  --dya-raised-hover  --dya-overlay
            --dya-sunken  --dya-selected
Gradient    --dya-grad-bar  --dya-grad-dock  --dya-grad-header
Line        --dya-border  --dya-border-strong  --dya-hairline  --dya-rule
            --dya-dashed  --dya-faint
Text        --dya-text  --dya-text-2  --dya-text-3  --dya-text-4
Relief      --dya-elev-flat  --dya-elev-chassis  --dya-elev-raised
            --dya-elev-pressed  --dya-elev-sunken  --dya-elev-focus
            --dya-elev-popover  --dya-elev-overlay
Accent      --dya-accent  --dya-accent-soft  --dya-accent-faint  --dya-on-accent
            --dya-accent-2 (--soft)  --dya-accent-3 (--soft)
Field       --dya-field  --dya-on-field
Status      --dya-success  --dya-warning  --dya-danger  --dya-*-soft for each
            --dya-on-status  --dya-idle  --dya-on-idle
Shape       --dya-radius-sm  --dya-radius  --dya-radius-media
            --dya-radius-chassis  --dya-radius-tag  --dya-radius-full
Type        --dya-font-sans  --dya-font-mono  --dya-size-*  --dya-tracking-*
            --dya-weight-*  --dya-leading-*
Spacing     --dya-space-1 .. --dya-space-24
Motion      --dya-dur-*  --dya-ease-*  --dya-press-y  --dya-press-y-key
            --dya-press-scale
```

## Six rules to respect

- **What can be pressed stands out.** Only what receives input sits recessed: text fields,
  sliders, and any control while it is being pressed. Surfaces and rows are flat and
  express their state through background.
- **A container that groups controls carries no relief of its own.** If it does, the
  controls inside read as sunk into a well. The panel is the exception and carries
  `--dya-elev-chassis`, a 1px light at 4%, which is a seam and not relief.
- **Never put `box-shadow` in a `transition`.** It is the most expensive property to
  animate and it interpolates badly against a list of shadows. Animate `transform`,
  `opacity` and `background-color` instead. Hover changes the background, never the shadow.
- **An ink under 4.50 against what it sits on is not text.** Above 3.00 it can still be a
  graphical object: a dot, an active indicator, a selection bar, a focus ring.
- **Interface text is uppercase and data is not.** A file name, a path or a log line keeps
  its case, in mono. `.dya-entry` is the class for that.
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a status dot. The
  loading state is a static `--dya-surface-2` block.

## Shape

```text
--dya-radius-sm         3px    control under 16px: checkbox, radio, toggle knob,
                               slider thumb
--dya-radius            6px    buttons, chips, fields, cards, surfaces
--dya-radius-media      6px    image, video, media blocks
--dya-radius-chassis    9px    the panel, and nothing else
--dya-radius-tag       14px    the tag, and nothing else
--dya-radius-full     999px    accent dot, radio, avatar
```

## Type

IBM Plex Sans Condensed for content, IBM Plex Mono for interface. Neither family ships a
variable font, so the system carries six static faces at weights 300, 400 and 500.

All interface text is mono, uppercase, with positive tracking that follows the role rather
than the size:

```text
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    data labels in a table or a record
--dya-tracking-label    0.2em     section labels, buttons, chips, tabs
--dya-tracking-brand    0.26em    the brand badge, and nothing else
```

Hierarchy comes from size and tracking, not from weight. 300 is for display and for a data
figure; 400 and 500 carry everything else. One scale, no breakpoint, no `clamp()`.

## Status

Three hues, one role each, and unlike the accents they are meant to be read. All three
fill, with `--dya-on-status` as the ink. They are the same values in both themes because
their job is legibility, not identity.

```text
Token            Value     Fill in Gi   Fill in Oneiro   Use
--------------   -------   ----------   --------------   --------------------------
--dya-success    #63cf95         9.47            10.58   confirmation, positive
--dya-warning    #d6a95c         8.43             9.42   caution, not yet a failure
--dya-danger     #f59790         8.45             9.44   error, destructive control
--dya-idle       per theme          —                —   no outcome yet
```

Each hue has a `-soft` companion — the same value over the surface at 10% — for the
background of a row or a quiet badge.

Colour is never the only signal. It states the outcome; a word or an icon says what it is.

## Known limits

- **The system carries no render of its own.** Any adjustment to relief or colour is judged
  inside a consuming product, or against `scratch/build_themes.py`, which generates a page
  holding both themes over the real component layer with every ratio computed.
- **Ten components are derived rather than observed.** Toggle, checkbox, radio, slider,
  content tabs, pagination, empty, loading and skeleton follow the rules but have not been
  seen against real content.
- **Six of Oneiro's ten surfaces are interpolated**, and the interpolated steps have not
  been seen against real content either.
- **The system has no flat pressable.** dyarchia-desktop draws the open control of two
  panels as a bare icon with no background, border or relief, because an empty panel
  holding one raised button reads as an unfilled form. It does that with
  plugin-prefixed rules built from tokens, which is the sanctioned escape hatch and also
  a standing bug report: a `.dya-button--bare` beside `--quiet` would let the product
  drop those rules.
- **The IBM Plex stylistic sets are undetermined.**
- **`.dya-prose` styles by element and every other component styles by class.** The
  exception is justified: a product rendering markdown or model output cannot put a class
  on elements it did not author. A second such exception would mean the rule is not
  holding.
