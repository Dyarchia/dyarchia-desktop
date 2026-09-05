# dyarchia-kanon

Shared CSS for the dyarchia products. One dark theme, one typeface, one grammar of
relief, and a layer of components the products consume without redefining them. No
dependencies, no build step, no JavaScript.

## What is here

```text
css/dyarchia.css      single entry point, imports the five below
css/fonts.css         the six IBM Plex @font-face declarations
css/tokens.css        the theme: 105 custom properties
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

There is nothing to switch on. The system has one theme, the root carries no
attribute, and the CSS never consults `prefers-color-scheme`.

## Components

Reference the classes; do not redefine them. A product that restyles `.dya-button`
has forked the system.

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
            <input class="dya-field" placeholder="Buscar trace">
        </div>
    </div>
</div>
```

`components.css` contains no literal colour, radius or duration. Every rule
resolves to a token, so a change to `tokens.css` reaches every component.

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

- **What can be pressed stands out.** Only what receives input sits recessed: text
  fields, sliders, and any control while it is being pressed. Surfaces and rows are
  flat and express their state through background.
- **A container that groups controls carries no relief of its own.** If it does,
  the controls inside read as sunk into a well. The panel is the exception and
  carries `--dya-elev-chassis`, a 1px light at 4%, which is a seam and not relief.
- **Never put `box-shadow` in a `transition`.** It is the most expensive property
  to animate and it interpolates badly against a list of shadows. Animate
  `transform`, `opacity` and `background-color` instead. Hover changes the
  background, never the shadow.
- **The orange appears sparingly.** Never as a button fill. It is text only on its
  own tint — the active chip, the active tab — where it measures 4.75 to 5.30.
  Everywhere else it is a graphical object: an accent dot, an active indicator, a
  selection bar, a focus ring.
- **A label never sits on `--dya-overlay`, `--dya-raised-hover` or
  `--dya-selected`.** `--dya-text-4` measures 4.38, 4.12 and 3.53 there. On those
  three the label level is `--dya-text-3`.
- **Nothing animates forever.** No shimmer on a skeleton, no pulse on a status dot.
  The loading state is a static `--dya-surface-2` block.

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

IBM Plex Sans Condensed for content, IBM Plex Mono for interface. Neither family
ships a variable font, so the system carries six static faces at weights 300, 400
and 500.

All interface text is mono, uppercase, with positive tracking that follows the role
rather than the size:

```text
--dya-tracking-mono     0.02em    values, paths, figures, identifiers
--dya-tracking-data     0.14em    data labels in a table or a record
--dya-tracking-label    0.2em     section labels, buttons, chips, tabs
--dya-tracking-brand    0.26em    the brand badge, and nothing else
```

Hierarchy comes from size and tracking, not from weight. 300 is for display and for
a data figure; 400 and 500 carry everything else. One scale, no breakpoint, no
`clamp()`.

## Status

Three hues, one role each, and unlike the accent they are meant to be read. All
three fill, with `--dya-on-status` as the ink.

```text
Token            Value     As a fill   Use
--------------   -------   ---------   -------------------------------------
--dya-success    #63cf95      10.33    confirmation, a positive delta
--dya-warning    #d6a95c       9.19    caution that is not yet a failure
--dya-danger     #f59790       9.21    error, a negative delta, a destructive
                                       control
--dya-idle       #2b3140       7.59    no outcome yet
--dya-on-status  #08090b          —    text or icon on any status fill
```

Each hue has a `-soft` companion — the same value over the surface at 10% — for the
background of a row or a quiet badge. As text on a plain surface every hue lands
between 6.00 and 10.89 depending on what is underneath.

Colour is never the only signal. It states the outcome; a word or an icon says what
it is.

## The theme

```text
canvas             #000000   the void the chassis is cut against, never content
chassis            #0a0b0f   the panel plate
working surfaces   #0d0f15 to #2b3140
text               #e3e3e4 down to #83858d
accent             #ee6018   one orange, no ramp
neutrals           cold, blue-biased
```

The canvas is the one pure black in the system and it carries nothing. Every
surface that receives content sits above it, which is what keeps the scale from
flattening.

Relief is a top highlight of 1px plus a black contour ring. The ring is black
rather than white because a white ring over near-black reads as a grey outline
instead of as depth. No shadow uses positive spread.

## Known limits

- **The system carries no render of its own.** Any adjustment to relief or colour
  is judged inside a consuming product or against a surface built for the occasion.
- **Ten components are derived rather than observed.** Toggle, checkbox, radio,
  slider, content tabs, pagination, empty, loading and skeleton do not appear in
  the skin this system is drawn from; they follow its rules but have not been seen
  against real content.
- **The IBM Plex stylistic sets are undetermined.** Which of them earn their place
  is an open question, as it was for the typeface before.
- **Products that start in light have nowhere to go.** The light theme and
  `data-dya-theme` no longer exist.
- **The prose scale has one step.** `.dya-heading` is the only heading, at
  `--dya-size-h2`, and there is nothing between `--dya-size-metric` and
  `--dya-size-body`. A product that renders arbitrary documents has three heading
  levels and one size to spend on them; the standing answer is to drop the lower
  two into the mono label idiom, which reads as a section label and stays inside
  the grammar. Whether the system should carry a real prose scale is open.
