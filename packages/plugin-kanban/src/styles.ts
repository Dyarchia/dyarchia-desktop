export const STYLES = `
.kanban [hidden],
.kanban-ghost[hidden] { display: none; }

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

.kanban-spacer { flex: 1; }

.kanban-meta {
    min-width: 0;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.kanban-main {
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
    flex: 0 0 262px;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
    background: var(--dya-sunken);
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

.kanban-empty {
    padding: var(--dya-space-4) var(--dya-space-2);
    text-align: center;
}

.kanban-card {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
    padding: var(--dya-space-2);
    cursor: grab;
    touch-action: none;
    transition: background-color var(--dya-dur-fast) var(--dya-ease);
}

.kanban-card:hover { background: var(--dya-flat-hover); }
.kanban-card[data-selected='true'] { border-color: var(--dya-accent); }
.kanban-card[data-dragging='true'] { opacity: 0.35; }
.kanban-card[data-pending='true'] { opacity: 0.6; cursor: progress; }
.kanban-card[data-locked='true'] { cursor: default; }

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

.kanban-card-note {
    flex: 1;
    min-width: 0;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-xs);
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
    flex: 0 0 330px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: var(--dya-border-width) solid var(--dya-hairline);
    background: var(--dya-chassis);
}

.kanban-drawer-head {
    flex: none;
    gap: var(--dya-space-2);
}

.kanban-drawer-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-3);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-3);
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

.kanban-body-field {
    min-height: 128px;
    resize: vertical;
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body);
    line-height: var(--dya-leading-body);
    letter-spacing: normal;
}

.kanban-parents {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dya-space-1);
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
.kanban-menu-item[data-active='true'] { background-color: var(--dya-surface-2); }
.kanban-menu-item:disabled { color: var(--dya-text-4); cursor: default; }

.kanban-menu-label {
    flex: 1;
    min-width: 0;
    letter-spacing: var(--dya-tracking-mono);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.kanban-menu-arrow { flex: none; color: var(--dya-text-3); }
.kanban-menu-hint { flex: none; }
.kanban-menu-empty { padding: var(--dya-space-3); }

.kanban-setup {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--dya-space-6);
}

.kanban-setup-form {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    width: min(420px, 100%);
}

.kanban-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
`
