# Five additions proposed to the Dyarchia design system

Written from building the dyarchia-crawlee panel against `docs/ui.md`. Every item here is
something that panel needed, could not take from the system, and therefore declares under its own
prefix today. `docs/ui.md` section 3 says that is the moment to propose upstream, so this is that
proposal.

Nothing in this repository writes to dyarchia-desktop. The panel already carries the proposed class
names in its markup, so the day kanon ships one of these the plugin deletes a rule and moves no
markup. Section 7 lists exactly what it deletes.

**This stops being a proposal when dyarchia-desktop absorbs this repository**, which was decided on
2026-09-11 and is described in [architecture.md section 10](../architecture.md#10-when-dyarchia-desktop-absorbs-this).
At that point the five are simply five edits in kanon, made by whoever does the move, and this
document is the specification for them rather than a request across a boundary.

## Index

- [1. What was checked, and how](#1-what-was-checked-and-how)
- [2. hidden in the reset](#2-hidden-in-the-reset)
- [3. dya-log](#3-dya-log)
- [4. dya-text status modifiers](#4-dya-text-status-modifiers)
- [5. dya-bar--inset](#5-dya-bar--inset)
- [6. dya-field--auto](#6-dya-field--auto)
- [7. What the panel deletes when these land](#7-what-the-panel-deletes-when-these-land)

## 1. What was checked, and how

The panel was mounted in a browser against `packages/kanon/css/dyarchia.css` itself, with the fonts
beside it, in both themes. Six things that looked correct against a hand-written imitation of the
stylesheet were wrong against the real one. Five of those were the panel's fault and are fixed:
`dya-mono` instead of a local `font-family`, `dya-badge` instead of coloured text, `dya-checkbox` on
the `input` rather than on the wrapping `label`, `dya-entry--active` instead of a list with no
selected state, and `dya-empty` instead of a blank region.

What is below is the remainder: the cases where the system has no class, or has one that is nearly
right. Each was confirmed against `components.css`, `reset.css` and `tokens.css` rather than
assumed, and every token cited already exists.

    Proposal            Kind            Confirmed by
    -----------------   -------------   ----------------------------------------------------
    hidden in reset     defect          no [hidden] rule anywhere in reset.css
    dya-log             new class       0 matches for dya-log, dya-output, dya-console
    dya-text status     modifier        0 matches for dya-text--
    dya-bar--inset      modifier        .dya-bar hardcodes 46px, a gradient and a border
    dya-field--auto     modifier        .dya-field is width: 100% with no opt-out

## 2. hidden in the reset

**The defect.** A plugin that toggles `element.hidden` on anything the system or the plugin has
given a `display` gets no effect at all. The UA stylesheet's `[hidden] { display: none }` is beaten
by any class-based `display`, so a hidden flex container stays on screen.

This is not a corner case. It cost the dyarchia panel its tab switching: both views rendered at
once, stacked, and the bug was invisible until the real stylesheet was linked. Any plugin with two
views, a collapsible form or a conditional row hits it, and each one will solve it privately.

**The change**, in `packages/kanon/css/reset.css`:

```css
[hidden] {
    display: none !important;
}
```

`!important` is deliberate and is the conventional form of this rule: without it the reset loses to
every component class that sets `display`, which is the whole problem. A plugin that genuinely
needs a hidden-but-laid-out element has `visibility` and `aria-hidden`.

**Documentation.** Worth a line in `docs/ui.md` section 2, where the ambient contract is described:
the document guarantees `[hidden]` works, so a panel toggles `el.hidden` and never writes a display
rule for it.

## 3. dya-log

**The gap.** There is no surface for the streamed output of a process. `dya-card` is a raised card
with a border and elevation, `dya-field` is an input, and the terminal plugin owns xterm, which is a
different thing entirely. A panel that runs something and shows what it prints has to invent one.

That shape recurs: a crawl, a build, a deploy, a test run, a migration. Every plugin that has one
will reach for `--dya-sunken` and a radius and land somewhere slightly different.

**The change**, in `packages/kanon/css/components.css`:

```css
.dya-log {
    overflow: auto;
    padding: var(--dya-space-3);
    border-radius: var(--dya-radius);
    background: var(--dya-sunken);
    box-shadow: var(--dya-elev-sunken);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    color: var(--dya-text-3);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
```

Notes on the shape, each from a real failure while building the panel:

- `white-space: pre-wrap` rather than `pre`. Process output carries long paths and long URLs, and a
  panel that scrolls horizontally to read a filename is unusable at panel width.
- `overflow-wrap: anywhere` rather than `word-break: break-word`. A 200-character URL with no break
  opportunity still has to break.
- No height and no flex. The consumer decides whether it fills the panel or takes what it needs;
  that is layout and belongs to the plugin.
- It is intended for `pre`, which the reset has already stripped of its margin.

**Sizing.** `--dya-size-mono-xs` matches `dya-table` and `dya-entry`, so a log beside a table of the
same data reads at the same weight.

## 4. dya-text status modifiers

**The gap.** The system colours a *status* with `dya-badge--success`, `--warning` and `--danger`,
which is right for a chip and wrong for a sentence. A panel reporting an outcome in prose -- "saved
profiles/claude-docs.yaml, committed 4f1c9a2b", "no URL in this profile to probe" -- has no class
for it and writes `color: var(--dya-danger)` under its own prefix.

Every plugin that reports an outcome will write that same rule, and the system already owns the
three tokens.

**The change**, in `packages/kanon/css/components.css`, beside `.dya-text`:

```css
.dya-text--success {
    color: var(--dya-success);
}

.dya-text--warning {
    color: var(--dya-warning);
}

.dya-text--danger {
    color: var(--dya-danger);
}
```

**Contrast.** These are the same three tokens `dya-badge--*--soft` already puts on `--dya-tag-bg`.
Panel interiors are `--dya-surface-1`, so the pair to measure is each status token against
`--dya-surface-1` in both themes. That check belongs with whoever owns the palette; the panel does
not paint the ground.

**Scope.** `dya-text-sm` and `dya-prose` would want the same modifiers if they are ever needed. Only
`dya-text` is proposed here, because only that one was needed.

## 5. dya-bar--inset

**The gap.** `dya-bar` carries the right rhythm for a row of controls -- flex, centred,
`--dya-space-2` gap, `--dya-space-3` padding -- and three things that only make sense as window
chrome:

```css
.dya-bar {
    height: 46px;
    background: var(--dya-grad-bar);
    border-bottom: var(--dya-border-width) solid var(--dya-hairline);
}
```

Inside a panel that reads as a mistake: a second title bar, 46 pixels tall, with its own gradient
and a rule under it. So the panel declares a plain flex row and loses the system's rhythm.

**The change**, in `packages/kanon/css/components.css`:

```css
.dya-bar--inset {
    height: auto;
    padding: 0;
    background: none;
    border-bottom: none;
}
```

The modifier keeps `display`, `align-items` and `gap` from `.dya-bar`, which is the part worth
sharing, and drops the chrome. `padding: 0` because an inset bar sits inside a container that has
already paid for its own padding.

**Alternative considered.** Splitting `.dya-bar` so the chrome lives in a `--chrome` modifier is
cleaner but changes every existing call site. The modifier costs nothing today.

## 6. dya-field--auto

**The gap.** `.dya-field` is `width: 100%` with no opt-out. That is right for a form, and wrong for
a control row: a `select` or a short input in a flex row expands to fill it and pushes everything
after it onto a second line. The dyarchia panel's round selector did exactly that, and the
checkbox and the run button wrapped under it.

It is also not documented. `docs/ui.md` lists `dya-field` under Input with no mention that it
claims the full width, so the first sign is a broken row.

**The change**, in `packages/kanon/css/components.css`:

```css
.dya-field--auto {
    width: auto;
}
```

A plugin still sets its own `min-width`, which is layout.

**Documentation.** The `dya-field` row of the component table in `docs/ui.md` section 3 is worth a
note that the field is full-width by default and `--auto` opts out. That sentence would have saved
the panel a broken row.

## 7. What the panel deletes when these land

The panel's markup already names every proposed class. Each rule below exists only until its
proposal ships, and is marked `until upstream` in
[dyarchia-plugin/renderer.js](../../dyarchia-plugin/renderer.js).

    Proposal            Plugin rule deleted    Markup change
    -----------------   --------------------   -----------------------------
    hidden in reset     .crw-root [hidden]     none
    dya-log             .crw-log               drop crw-log from two elements
    dya-text status     .crw-bad, .crw-good    drop both from say()
    dya-bar--inset      .crw-bar               drop crw-bar from two elements
    dya-field--auto     width in .crw-scope    none, min-width stays

What is left after that is layout and nothing else: flex and grid containers, widths, scroll boxes
and the two panes' proportions. That is the line `docs/ui.md` draws, and it is where the panel wants
to end up.
