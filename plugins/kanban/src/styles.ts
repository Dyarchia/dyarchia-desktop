export const STYLES = `
.kanban {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--dya-text);
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body);
}

.kanban-bar {
    flex: none;
    gap: var(--dya-space-2);
}

.kanban-bar-sep {
    flex: none;
    width: var(--dya-border-width);
    height: 16px;
    margin: 0 var(--dya-space-1);
    background: var(--dya-rule);
}

.kanban-health-button {
    display: inline-flex;
    align-items: center;
    gap: var(--dya-space-1);
    color: var(--dya-warning);
}

.kanban-health-button > svg {
    width: 14px;
    height: 14px;
}

.kanban-tips { display: contents; }

.kanban-spacer { flex: 1; }

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
    display: flex;
    align-items: stretch;
    gap: var(--dya-space-2);
    padding: var(--dya-space-3);
    overflow-x: auto;
    overflow-y: hidden;
}

.kanban-column {
    flex: 1 1 168px;
    min-width: 168px;
    max-width: 340px;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
.kanban-column[data-collapsed='true'] .kanban-new-key {
    display: none;
}

.kanban-column[data-collapsed='true'] .kanban-list,
.kanban-column[data-collapsed='true'] .kanban-empty {
    display: none;
}

.kanban-new {
    margin-bottom: var(--dya-space-2);
}

.kanban-column[data-drop='accept'] { border-color: var(--dya-accent); }
.kanban-column[data-drop='refuse'] { border-color: var(--dya-danger); }

.kanban-column-head {
    flex: none;
    height: 32px;
    gap: var(--dya-space-2);
}

.kanban-column-title { flex: 1; min-width: 0; }

.kanban-count {
    flex: none;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-4);
}

.kanban-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-2);
    background: var(--dya-chassis);
    border-bottom-left-radius: var(--dya-radius);
    border-bottom-right-radius: var(--dya-radius);
}

.kanban-column[data-drop='accept'] .kanban-scroll { background: var(--dya-accent-soft); }
.kanban-column[data-drop='refuse'] .kanban-scroll { background: var(--dya-danger-soft); }

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
    height: 2px;
    background: var(--dya-accent);
    pointer-events: none;
    transition: transform var(--dya-dur-fast) var(--dya-ease);
}

/*
 * The drop target, and it exists while something is being dropped. A dashed box in every empty
 * column is seven boxes of nothing across the widest part of the screen on a board at rest, which
 * is the same sentence the column used to say, drawn instead of written.
 */
.kanban-drop {
    display: none;
    min-height: var(--dya-space-12);
    border: var(--dya-border-width) dashed var(--dya-dashed);
    border-radius: var(--dya-radius);
}

.kanban-board[data-dragging='true'] .kanban-drop {
    display: block;
}

/* An empty column steps back: it is a place for something, not a thing. */
.kanban-column[data-empty='true'] .kanban-scroll {
    background: var(--dya-sunken);
}

.kanban-card {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    padding: var(--dya-space-2);
    cursor: grab;
    touch-action: none;
    user-select: none;
    transition: background-color var(--dya-dur-fast) var(--dya-ease);
}

.kanban-card:hover { background: var(--dya-flat-hover); }
.kanban-card[data-selected='true'] { border-color: var(--dya-accent); }
.kanban-card[data-dragging='true'] { opacity: 0.35; }
.kanban-card[data-pending='true'] { opacity: 0.6; cursor: progress; }
.kanban-card[data-locked='true'] { cursor: default; }
.kanban-card[data-problem='true'] { border-color: var(--dya-danger); }
.kanban-card[data-marked='true'] { background: var(--dya-accent-soft); }

.kanban-marks {
    flex: 0 0 auto;
    gap: var(--dya-space-2);
}

.kanban-card-title {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    color: var(--dya-text);
    overflow-wrap: anywhere;
}

.kanban-card-foot {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
}

.kanban-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-idle);
}

.kanban-dot[data-tone='accent'] { background: var(--dya-accent); }
.kanban-dot[data-tone='accent-2'] { background: var(--dya-accent-2); }
.kanban-dot[data-tone='accent-3'] { background: var(--dya-accent-3); }
.kanban-dot[data-tone='warning'] { background: var(--dya-warning); }
.kanban-dot[data-tone='success'] { background: var(--dya-success); }
.kanban-dot[data-tone='danger'] { background: var(--dya-danger); }

.kanban-card-note {
    flex: 1;
    min-width: 0;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kanban-ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 9000;
    pointer-events: none;
    opacity: 0.92;
    box-shadow: var(--dya-elev-overlay);
}

.kanban-drawer {
    position: absolute;
    top: var(--dya-space-3);
    right: var(--dya-space-3);
    bottom: var(--dya-space-3);
    z-index: 20;
    width: 50%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container-type: inline-size;
    box-shadow: var(--dya-elev-overlay);
}

.kanban-drawer[data-size='full'] {
    width: calc(100% - var(--dya-space-3) * 2);
}

.kanban-drawer-head {
    flex: none;
    gap: var(--dya-space-2);
}

.kanban-drawer-state { flex: none; }

.kanban-drawer-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    padding: var(--dya-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
}

.kanban-grow { flex: 1 0 auto; }

.kanban-grow > .kanban-body-field {
    flex: 1 1 auto;
    min-height: 96px;
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

    .kanban-drawer[data-stage='true'] .kanban-stage {
        grid-column: 2;
        grid-row: 1;
        height: auto;
        min-height: 0;
        border-bottom: none;
        border-left: var(--dya-border-width) solid var(--dya-hairline);
    }
}

.kanban-group {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
}

.kanban-group > .dya-button { align-self: flex-start; }

.kanban-row {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-row > .dya-field { flex: 1; min-width: 0; }

.kanban-row > .kanban-cap { flex: 0 0 4rem; }

.kanban-runner { flex-wrap: wrap; }

.kanban-runner > .dya-field { flex: 1 1 12rem; }

.kanban-select { display: flex; min-width: 0; }

.kanban-select > .dya-field { width: 100%; }

.kanban-runner > .kanban-select { flex: 1 1 6.5rem; }

.kanban-body-field {
    min-height: 96px;
    resize: vertical;
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body);
    line-height: var(--dya-leading-body);
    letter-spacing: normal;
}

.kanban-settings {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-runners {
    display: grid;
    grid-template-columns: 7.5rem repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: var(--dya-space-2);
    margin-top: var(--dya-space-2);
}

.kanban-runners > .kanban-runner { display: contents; }

.kanban-model {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    min-width: 0;
}

.kanban-settings > .kanban-select { justify-self: stretch; }

.kanban-setting {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-3);
}

.kanban-file {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.kanban-comment {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--dya-space-2);
    background: var(--dya-surface-1);
    border-radius: var(--dya-radius);
}

.kanban-comment-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.kanban-comment-text {
    line-height: var(--dya-leading-body);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.kanban-error {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-danger);
}

.kanban-problem {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    color: var(--dya-danger);
    padding: var(--dya-space-2);
    border-radius: var(--dya-radius);
    background: var(--dya-sunken);
    overflow-wrap: anywhere;
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
.kanban-menu-search { flex: none; margin-bottom: var(--dya-space-1); }
.kanban-menu-list { overflow-y: auto; }
.kanban-menu-group { padding: var(--dya-space-2) var(--dya-space-2) var(--dya-space-1); }
.kanban-menu-item { height: auto; min-height: 26px; padding: var(--dya-space-1) var(--dya-space-2); }
.kanban-menu-item[data-active='true'] { background-color: var(--dya-surface-2); }
.kanban-menu-item:disabled { color: var(--dya-text-4); cursor: default; }

.kanban-menu-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    text-align: left;
}

.kanban-menu-label {
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    overflow-wrap: anywhere;
}

.kanban-menu-note {
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    text-transform: none;
    color: var(--dya-text-4);
    overflow-wrap: anywhere;
}

.kanban-menu-arrow { flex: none; color: var(--dya-text-3); }
.kanban-menu-empty { padding: var(--dya-space-3); }

.kanban-health {
    min-width: 280px;
    overflow-y: auto;
}

.kanban-health-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--dya-space-1);
    width: 100%;
    padding: var(--dya-space-2);
    border: none;
    border-radius: var(--dya-radius);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
}

button.kanban-health-row {
    cursor: pointer;
    transition: background-color var(--dya-dur-fast) var(--dya-ease);
}

button.kanban-health-row:hover,
button.kanban-health-row:focus-visible { background-color: var(--dya-surface-2); }

.kanban-health-where {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
}

.kanban-health-where > .dya-text {
    overflow-wrap: anywhere;
}

.kanban-health-problem {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    line-height: var(--dya-leading-body);
    color: var(--dya-text-3);
    overflow-wrap: anywhere;
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

.kanban-chooser-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--dya-space-3);
}

.kanban-chooser-path {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    overflow-wrap: anywhere;
}

.kanban-setup-shell {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    width: min(560px, 100%);
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
    border-bottom: var(--dya-border-width) solid var(--dya-hairline);
    background: var(--dya-surface-1);
}

.kanban-stage-body {
    flex: 1;
    min-height: 0;
    padding: var(--dya-space-2) 0 0 var(--dya-space-2);
}

.kanban-terminal { height: 100%; }

.kanban-run {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--dya-space-2);
    padding: var(--dya-space-1) 0;
    border-bottom: var(--dya-border-width) solid var(--dya-border);
}

.kanban-run > .kanban-comment-text {
    flex: 1 0 100%;
    font-size: var(--dya-size-body-sm);
    color: var(--dya-text-3);
}

.kanban-watch {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    padding: var(--dya-space-4);
}

/* The boards, as many across as the panel affords. */
.kanban-board-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
    gap: var(--dya-space-3);
}

.kanban-watch-body {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-4);
    width: 100%;
    max-width: 96rem;
}

.kanban-watch-run {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-bottom: var(--dya-border-width) solid var(--dya-border);
    color: inherit;
    font: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--dya-space-2);
    padding: var(--dya-space-2);
    border-radius: var(--dya-radius);
}

.kanban-watch-run:hover { background: var(--dya-surface-2); }
.kanban-watch-run:focus-visible { box-shadow: var(--dya-elev-focus); }

.kanban-card[data-waiting='true'] { border-color: var(--dya-warning); }

.xterm .xterm-viewport { background-color: transparent !important; }
.xterm .xterm-viewport::-webkit-scrollbar { width: 8px; }
.xterm .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
.xterm .xterm-viewport::-webkit-scrollbar-thumb {
    background-color: transparent;
    border-radius: var(--dya-radius);
}
.xterm .xterm-viewport:hover::-webkit-scrollbar-thumb { background-color: var(--dya-border); }
.kanban-tabs {
    flex: none;
    padding: var(--dya-space-2) var(--dya-space-3) 0;
}

.kanban-history {
    height: 100%;
    overflow-y: auto;
    padding-right: var(--dya-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
}

.kanban-row-entry {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--dya-space-1) 0;
    border-bottom: var(--dya-border-width) solid var(--dya-border);
}

.kanban-row-entry[data-kind='text'] { padding: var(--dya-space-2) 0; }
.kanban-row-entry[data-error='true'] .dya-badge { background: var(--dya-danger-soft); color: var(--dya-danger); }

.kanban-row-head {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.kanban-row-body {
    margin: 0;
    padding: var(--dya-space-2);
    background: var(--dya-sunken);
    border-radius: var(--dya-radius);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-3);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 320px;
    overflow-y: auto;
}
`
