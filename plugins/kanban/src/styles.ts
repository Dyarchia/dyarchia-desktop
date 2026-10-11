export const STYLES = `
.kanban {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.kanban-spacer { flex: 1; }

.kanban-switch { max-width: 16rem; }

.kanban > .dya-scrim { z-index: 21; }

.kanban-settings {
    z-index: 22;
    overflow-y: auto;
}

.kanban-diff {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    min-width: 0;
}

.kanban-decided {
    width: 100%;
}

.kanban-decided-card > td {
    padding-top: var(--dya-space-5);
    padding-bottom: var(--dya-space-1);
}

.kanban-outcome { white-space: normal; }

.kanban-outcome-list {
    margin: 0;
    padding-inline-start: var(--dya-space-4);
}

.kanban-more > .dya-code {
    margin-top: var(--dya-space-2);
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

.kanban-main:has(> .kanban-drawer[data-size='half']:not([hidden])) > .kanban-board {
    margin-inline-end: calc(50% + var(--dya-space-3));
}

.kanban-column[data-collapsed='true'] {
    flex: 0 0 36px;
    min-width: 36px;
}

/*
 * The header, not the name, carries the measure. Its height is the longest stage name on this
 * board, one character being 1ch plus the label tracking, plus room for the controls, and the
 * controls are pushed to the bottom of it, so the count and the keys of every folded stage land
 * on one line across the board.
 */
.kanban-column[data-collapsed='true'] .kanban-column-head {
    flex-direction: column;
    height: calc(var(--kanban-stage-chars, 9) * (1ch + var(--dya-tracking-label)) + var(--dya-space-12));
    padding: var(--dya-space-2) 0;
    gap: var(--dya-space-2);
}

.kanban-column[data-collapsed='true'] .kanban-column-keys {
    flex-direction: column;
}

.kanban-column[data-collapsed='true'] .kanban-column-keys > .dya-key:not(.kanban-fold) {
    display: none;
}

.kanban-column[data-collapsed='true'] .kanban-count {
    margin-top: auto;
}

.kanban-column[data-collapsed='true'] .kanban-column-title {
    flex: none;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
}

.kanban-column[data-collapsed='true'] .kanban-list,
.kanban-column[data-collapsed='true'] .kanban-new {
    display: none;
}

.kanban-new {
    margin-bottom: var(--dya-space-2);
}

.kanban-new[hidden] {
    display: none;
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

.kanban-column-keys { flex: none; }

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
 * The drop target exists while something is being dropped: a dashed box in every empty column at
 * rest is the sentence "nothing here", drawn instead of written.
 */
.kanban-drop {
    display: none;
}

.kanban-board[data-dragging='true'] .kanban-drop {
    display: block;
}

.kanban-board[data-dragging='true'],
.kanban-board[data-dragging='true'] * {
    cursor: grabbing;
}

.kanban-board[data-drop='refuse'],
.kanban-board[data-drop='refuse'] * {
    cursor: not-allowed;
}

.kanban-card {
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

.kanban-drawer-head {
    flex: none;
    padding: var(--dya-space-3);
}

.kanban-drawer-title { cursor: text; }

.kanban-drawer-rename {
    flex: 1;
    min-width: 0;
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

@container (min-width: 1040px) {
    .kanban-drawer[data-stage='true'] .kanban-drawer-body {
        display: grid;
        grid-template-columns: minmax(480px, 1fr) minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
    }

    .kanban-drawer[data-stage='true'] .kanban-form {
        grid-column: 1;
        grid-row: 1;
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

.kanban-file {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
}

.kanban-file > .dya-file { flex: 1; }

.kanban-clip {
    display: block;
    max-width: 20rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

.kanban-foot {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: var(--dya-space-3);
    padding: var(--dya-space-2) var(--dya-space-3);
}

/*
 * A form sits near the top of the panel, not in the middle of it: centred vertically it floats in
 * whatever height the panel happens to have.
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

.kanban-setup[data-mode='welcome'] {
    align-items: center;
}

.kanban-setup[data-mode='gallery'] {
    justify-content: flex-start;
    padding: var(--dya-space-4);
}

.kanban-gallery { width: 100%; }

.kanban-welcome {
    padding: var(--dya-space-5);
}

.kanban-setup-shell {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    width: min(760px, 100%);
}

/*
 * The review of a card's work, in one place: the index of its history on top, what the chosen
 * run did under it. The index is kept to two fifths of the stage and scrolls; the steps take the
 * rest.
 */
.kanban-stage {
    flex: none;
    height: 50%;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    padding: var(--dya-space-2) calc(var(--dya-space-3) + 8px) 0 var(--dya-space-3);
}

.kanban-index-scroll {
    flex: none;
    max-height: 40%;
    overflow-y: auto;
}

.kanban-index .dya-row { cursor: pointer; }

.kanban-run-name {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-stage-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
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

.kanban-steps {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin-inline-start: calc(-1 * var(--dya-space-2));
}
`
