export const STYLES = `
.kanban {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.kanban-bar {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-health-mark {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-1);
}

.kanban-health-mark > svg {
    width: 14px;
    height: 14px;
}

.kanban-tips { display: contents; }

.kanban-decided {
    width: 100%;
}

.kanban-decided-card > td {
    padding-top: var(--dya-space-5);
    padding-bottom: var(--dya-space-1);
}

.kanban-outcome {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    white-space: normal;
}

.kanban-outcome-files {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dya-space-2);
}

.kanban-outcome-list {
    margin: 0;
    padding-inline-start: var(--dya-space-4);
}

.kanban-outcome-json > summary {
    cursor: pointer;
    list-style: none;
}

.kanban-outcome-json > summary::-webkit-details-marker {
    display: none;
}

.kanban-outcome-json > .dya-code {
    margin-top: var(--dya-space-2);
    max-height: 320px;
    overflow: auto;
}

/*
 * Folding is there when a column is being looked at, not eight times over at rest. A folded
 * column keeps its key, because it is the only way back.
 */
.kanban-fold {
    opacity: 0;
    transition: opacity var(--dya-dur-fast) var(--dya-ease);
}

.kanban-column:hover .kanban-fold,
.kanban-fold:focus-visible,
.kanban-column[data-collapsed='true'] .kanban-fold {
    opacity: 1;
}

.kanban-meta {
    flex: none;
    cursor: help;
}

.kanban-main {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
}

.kanban-board {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
}

.kanban-column {
    flex: 1 1 168px;
    min-width: 168px;
}

.kanban-column[data-collapsed='true'] {
    flex: 0 0 36px;
    min-width: 36px;
}

/*
 * The header, not the name, carries the measure. Its height is the longest stage name on this
 * board — one character being 1ch plus the label tracking — plus room for the two controls, and
 * the controls are pushed to the bottom of it. So the count and the fold key of every folded
 * stage land on one line across the board, which is the only way a row of folded stages reads as
 * a row, and no name is stretched, padded or otherwise touched to get there.
 */
.kanban-column[data-collapsed='true'] .kanban-column-head {
    flex-direction: column;
    height: calc(var(--kanban-stage-chars, 9) * (1ch + var(--dya-tracking-label)) + var(--dya-space-12));
    padding: var(--dya-space-2) 0;
    gap: var(--dya-space-2);
}

.kanban-column[data-collapsed='true'] .kanban-count {
    margin-top: auto;
}

.kanban-column[data-collapsed='true'] .kanban-column-title {
    flex: none;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
}

/* Adding a card is not something you do to a stage you have put away. */
.kanban-column[data-collapsed='true'] .kanban-list,
.kanban-column[data-collapsed='true'] .kanban-empty {
    display: none;
}

.kanban-new {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    margin-bottom: var(--dya-space-2);
}

.kanban-new[hidden] {
    display: none;
}

.kanban-new > .dya-field {
    flex: 1;
    min-width: 0;
}

.kanban-column-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-height: 44px;
    padding: var(--dya-space-2) var(--dya-space-3) 0;
}

.kanban-column-title { flex: 1; min-width: 0; }

.kanban-count { flex: none; }

.kanban-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-2) var(--dya-space-3) var(--dya-space-3);
}

.kanban-list {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}

.kanban-indicator {
    position: absolute;
    left: var(--dya-space-2);
    right: var(--dya-space-2);
    top: var(--dya-space-2);
    transition: transform var(--dya-dur-fast) var(--dya-ease);
}

/*
 * The drop target, and it exists while something is being dropped. A dashed box in every empty
 * column is seven boxes of nothing across the widest part of the screen on a board at rest, which
 * is the same sentence the column used to say, drawn instead of written.
 */
.kanban-drop {
    display: none;
}

.kanban-board[data-dragging='true'] .kanban-drop {
    display: block;
}

.kanban-card {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    padding: var(--dya-space-2);
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.kanban-card[data-locked='true'] { cursor: default; }

.kanban-marks {
    flex: 0 0 auto;
    gap: var(--dya-space-2);
}

.kanban-card-who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
}

.kanban-card-who[hidden] { display: none; }

.kanban-card-foot {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
}

.kanban-card > .dya-pills[hidden],
.kanban-card-foot[hidden] { display: none; }

.kanban-danger {
    margin-top: var(--dya-space-2);
}

.kanban-card-note {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 3px var(--dya-space-2);
}

.kanban-ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 9000;
    pointer-events: none;
}

/* The shape is kanon's sheet; what belongs here is how wide this one opens. */
.kanban-drawer {
    gap: 0;
    padding: 0;
    overflow: hidden;
}

.kanban-drawer[data-size='full'] {
    inset-inline-start: var(--dya-space-3);
    width: auto;
}

/*
 * The head is the form's first row: the state in the label column, the title where the values
 * start. It repeats the body's columns, so beside the stage the form's half is the head's half,
 * and its lead keeps the form's padding and the gutter the form's scrollbar takes, so every
 * column lands where the form's does. The keys stand over the end of the title's row.
 */
.kanban-drawer-head {
    flex: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    padding: 0;
}

.kanban-drawer-lead {
    grid-area: 1 / 1;
    padding: var(--dya-space-2) calc(var(--dya-space-3) + 8px) var(--dya-space-2) var(--dya-space-3);
}

.kanban-drawer-keys {
    grid-area: 1 / 1;
    justify-self: end;
    align-self: center;
    display: flex;
    gap: var(--dya-space-2);
    padding-inline-end: calc(var(--dya-space-3) + 8px);
}

.kanban-drawer-title {
    min-width: 0;
    padding-inline-end: calc(2 * var(--dya-size-control-sm) + var(--dya-space-2));
    overflow-wrap: anywhere;
}

.kanban-drawer-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}

.kanban-form {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: var(--dya-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
}

@container (min-width: 720px) {
    .kanban-drawer[data-stage='true'] .kanban-drawer-body {
        display: grid;
        grid-template-columns: minmax(360px, 1fr) minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
    }

    .kanban-drawer[data-stage='true'] .kanban-form {
        grid-column: 1;
        grid-row: 1;
    }

    .kanban-drawer[data-stage='true'] .kanban-drawer-head {
        grid-template-columns: minmax(360px, 1fr) minmax(0, 1fr);
    }

    .kanban-drawer[data-stage='true'] .kanban-drawer-keys {
        grid-area: 1 / 2;
    }

    .kanban-drawer[data-stage='true'] .kanban-drawer-title {
        padding-inline-end: 0;
    }

    .kanban-drawer[data-stage='true'] .kanban-stage {
        grid-column: 2;
        grid-row: 1;
        height: auto;
        min-height: 0;
    }
}

.kanban-group {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
}

.kanban-row {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-row--top { align-items: flex-start; }

.kanban-row > .dya-field { flex: 1; min-width: 0; }

.kanban-row > .kanban-cap { flex: 0 0 4rem; }

.kanban-select { display: flex; min-width: 0; }

.kanban-select > .dya-field { width: 100%; }

.kanban-body-field {
    min-height: 160px;
    resize: vertical;
}

.kanban-model {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    min-width: 0;
}

.kanban-menu {
    position: fixed;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    min-width: 240px;
    max-width: 380px;
}

.kanban-submenu { min-width: 150px; }

.kanban-health {
    min-width: 280px;
    overflow-y: auto;
}

/*
 * A form sits near the top of the panel, not in the middle of it. Centred vertically it floats in
 * whatever height the panel happens to have, which at full height is a small box adrift in an
 * empty screen — and that is what this looked like.
 */
.kanban-setup {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--dya-space-6) var(--dya-space-5);
    overflow-y: auto;
}

/*
 * The two forms want opposite things. Settings is a page you came to on purpose, so it starts at
 * the top where a page starts. The first-run form is the whole window and the only thing to do in
 * it, so it sits in the middle and wears a card: pinned to the top of an empty panel it reads as
 * a fragment of a screen that failed to load the rest.
 */
.kanban-setup[data-mode='welcome'] {
    align-items: center;
}

.kanban-welcome {
    padding: var(--dya-space-5);
}

.kanban-setup-shell {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    width: min(760px, 100%);
}

.kanban-setup-head {
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    flex-wrap: wrap;
}

.kanban-stage {
    flex: none;
    height: 44%;
    min-height: 160px;
    display: flex;
    flex-direction: column;
}

/*
 * The stage keeps the form's edges: its tabs, its head and its steps start where the form's labels
 * do and end where its fields do, the end holding the gutter the form's scrollbar takes.
 */
.kanban-stage-body {
    flex: 1;
    min-height: 0;
    padding: var(--dya-space-2) calc(var(--dya-space-3) + 8px) 0 var(--dya-space-3);
}

.kanban-terminal { height: 100%; }

.kanban-watch {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    padding: var(--dya-space-4);
}

.kanban-watch-body {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    width: 100%;
    max-width: 96rem;
}

.kanban-tabs {
    flex: none;
    padding: var(--dya-space-3) calc(var(--dya-space-3) + 8px) 0 var(--dya-space-3);
}

.kanban-history {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
}

.kanban-activity-head {
    flex: none;
}

.kanban-activity-head > .dya-select {
    min-width: 0;
}

.kanban-steps {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin-inline-start: calc(-1 * var(--dya-space-2));
}
`
