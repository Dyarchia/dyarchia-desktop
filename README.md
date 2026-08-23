# dyarchia-kanon

Shared CSS for the dyarchia products. Two themes, one typeface and one grammar
of relief. No dependencies, no build step, no JavaScript.

## What is here

```text
css/dyarchia.css     single entry point, imports the four below
css/fonts.css        the two Geist @font-face declarations
css/tokens.css       both themes: 73 custom properties
css/reset.css        normalisation, focus, scrollbars, reduced motion
css/motion.css       four keyframes
fonts/               Geist Sans and Geist Mono variable, 140 KB for both
```

## Usage

Copy `css/` and `fonts/` into the project and link one stylesheet:

```html
<link rel="stylesheet" href="css/dyarchia.css">
```

Light is the default theme. Dark is switched on with an attribute on the root:

```js
document.documentElement.dataset.dyaTheme = "dark";
```

The choice belongs to the product, not to the operating system: the CSS never
consults `prefers-color-scheme`.

## The tokens you will reach for

```text
Surface        --dya-bg  --dya-surface-1  --dya-surface-2  --dya-surface-3
               --dya-surface-inverse
Line           --dya-line  --dya-border  --dya-border-card
               --dya-border-control
Text           --dya-text  --dya-text-2  --dya-text-3  --dya-text-4
Relief         --dya-elev-raised  --dya-elev-raised-hover
               --dya-elev-pressed  --dya-elev-overlay  --dya-elev-flat
Accent         --dya-accent  --dya-accent-soft
Status         --dya-danger  --dya-success  --dya-warning
               --dya-*-soft for each, --dya-on-danger for a fill
Shape          --dya-radius  --dya-radius-media  --dya-radius-full
Type           --dya-font-sans  --dya-font-mono  --dya-size-*  --dya-tracking-*
Spacing        --dya-space-1 .. --dya-space-24
Motion         --dya-dur-*  --dya-ease-*
```

A minimal button with the whole system applied:

```css
.button {
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: var(--dya-radius);
    color: var(--dya-text);
    background: var(--dya-surface-1);
    box-shadow: var(--dya-elev-raised);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    transition: transform var(--dya-dur-press) var(--dya-ease-press);
}

.button:hover  { box-shadow: var(--dya-elev-raised-hover); }
.button:active { box-shadow: var(--dya-elev-pressed); transform: translateY(1px); }
```

## Five rules to respect

- **What can be pressed stands out.** Only what receives input sits recessed:
  text fields, and any control while it is being pressed. Surfaces and rows are
  flat and express their state through background.
- **A container that groups controls carries no relief of its own.** If it does,
  the controls inside read as sunk into a well.
- **Never put `box-shadow` in a `transition`.** It freezes the shadow against
  theme changes: the browser stops re-evaluating the `var()` it derives from and
  the relief keeps the previous theme's parameters. Animate `transform`,
  `opacity` and `background-color` instead.
- **The orange appears sparingly.** Never as a button fill and never as text on
  a background: at 3.05:1 it clears the bar for a graphical object but not for
  text.
- **Status colour is not accent colour.** The three status hues state an outcome
  — a failure, a gain, a caution — and they are readable as text, which the
  orange is not. They never mark what is merely active or selected: that is the
  orange's job and it does not change hands.

## Status

Three hues, one role each, and unlike the accent they are meant to be read.

```text
Token             Light      Dark       Use
---------------   --------   --------   ---------------------------------
--dya-danger      #9a2419    #f59790    error text, a negative delta,
                                        the hover of a destructive control
--dya-success     #186034    #63cf95    confirmation, a positive delta
--dya-warning     #714900    #d6a95c    caution that is not yet a failure
--dya-on-danger   #ffffff    #08090b    text or icon on a --dya-danger fill
```

Each has a `-soft` companion — the same hex over the surface at 10% — for the
background of a badge or a row. Ten is the ceiling, not a preference: a tint drags
the surface toward the colour of the text it carries, and past that proportion the
pill stops holding AA on a row under hover. It is the pill, not the hue on a plain
surface, that sets the floor for the whole scale.

Measured against `--dya-surface-1`, every hue lands between 7.4:1 and 8.4:1 as
text, and no pill falls below 4.9:1 on any surface in either theme. The margin
over the 4.5:1 line is deliberate: these appear at label sizes, and a thin stem at
12px loses to antialiasing what the number says it has.

Rules:

- **Only `--dya-danger` may fill.** A destructive action earns a red button; a
  success or a warning does not earn a green or yellow one.
- **Never the only signal.** Colour states the outcome, a word or an icon says
  what it is. The two themes do not share these values, so nothing survives a
  theme change except the role.
- **The dark yellow stays dark.** A canary yellow is illegible on the light
  canvas and shouts on the dark one.

## Themes

```text
                     light                     dark
background           #f5f5f5                   #08090b
raised surface       #ffffff                   #1f2126
text                 #020202                   #f4f4f6
neutrals             warm, brown-tinted        cold, blue-biased
accent               #ee6018                   #ee6018   same in both

In dark, the raised surface carries the interface and the background frames it.
The tone under a reader's eyes for hours is `--dya-surface-1`, which is why it
sits at L* 12.7 rather than in the near-black band; `--dya-bg` shows in the gaps
and around the edges, and near-black is right there because it is a minority.
```

The two themes do not share shadow geometry. In light, relief is a 1px edge plus
a stepped drop shadow, with no inner highlight — a white inner line seams
visibly against dark fills such as the primary button. In dark, relief is a top
highlight plus a black contour ring; a white ring over near-black reads as a
grey outline rather than as depth. No shadow uses positive spread.

## Provenance

The light theme comes from an extraction of factory.ai, the dark one from
raycast.com. The relief and the accent are dyarchia's own and apply to both.

## Known limits

- **The dark ramp has a narrow middle.** `--dya-text-2` and `--dya-text-3` sit
  1.48 apart, against 1.60 in light. Both clear AA on every surface — 11.63:1 and
  7.87:1 against the background — but they are two levels a reader has to look
  for rather than two a reader sees. The gap is narrow because the dark floor is
  high: widening it means moving `--dya-text-2` up, which brings it within
  confusing distance of `--dya-text`, and of the two distances that is the one
  that cannot be lost.
- The two themes have opposite neutral temperature. Each is internally coherent,
  but switching reads as a change of temperature and not only of luminance.
  Whether to unify them is still open.
