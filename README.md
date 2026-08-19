# dyarchia-ui

Shared CSS for the dyarchia products. Two themes, one typeface and one grammar
of relief. No dependencies, no build step, no JavaScript.

## What is here

```text
css/dyarchia.css     single entry point, imports the four below
css/fonts.css        the two Geist @font-face declarations
css/tokens.css       both themes: 85 custom properties
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
Surface        --dya-bg  --dya-surface-1  --dya-surface-2  --dya-surface-inverse
Text           --dya-text  --dya-text-2  --dya-text-3  --dya-text-4
Relief         --dya-elev-raised  --dya-elev-raised-hover
               --dya-elev-pressed  --dya-elev-overlay  --dya-elev-flat
Accent         --dya-accent  --dya-accent-soft
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

## Four rules to respect

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

## Themes

```text
                     light                     dark
background           #f5f5f5                   #07080a
raised surface       #ffffff                   #0e0f11
text                 #020202                   #f4f4f6
neutrals             warm, brown-tinted        cold, blue-biased
accent               #ee6018                   #ee6018   same in both
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

- `--dya-text-3` in dark yields 3.75:1 against the background, so it is limited
  to text of 18px or larger. Easy to apply to a small label and drop below AA
  without noticing.
- The two themes have opposite neutral temperature. Each is internally coherent,
  but switching reads as a change of temperature and not only of luminance.
  Whether to unify them is still open.
