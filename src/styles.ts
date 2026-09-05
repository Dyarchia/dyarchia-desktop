export const STYLE_ID = 'eforoi-styles'

export const STYLES = `
.eforoi {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--dya-text);
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body);
}

.eforoi-head {
    flex: none;
    padding: var(--dya-space-3) var(--dya-space-3) var(--dya-space-2);
    border-bottom: var(--dya-border-width) solid var(--dya-hairline);
}

.eforoi-columns {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: var(--dya-space-2) var(--dya-space-5);
    align-items: stretch;
}

.eforoi-column {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-2);
    min-width: 0;
}

.eforoi-column[data-side='prompt'] { grid-column: span 5; }
.eforoi-column[data-side='panel'] { grid-column: span 7; }

.eforoi-results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--dya-space-3);
}

.eforoi-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--dya-space-2);
}

.eforoi-legend {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: var(--dya-space-2);
    padding: 0 var(--dya-space-2);
}

.eforoi-legend-actions {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}

.eforoi-name {
    flex: 1;
    min-width: 0;
    max-width: 260px;
}

.eforoi-name[hidden] { display: none; }

.eforoi-prompt {
    flex: 1;
    min-height: 96px;
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body);
    letter-spacing: normal;
}

.eforoi-seats { display: flex; flex-direction: column; gap: 2px; }
.eforoi-seats + .eforoi-seats { margin-top: var(--dya-space-2); }

.eforoi-seat {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) 168px 76px 46px 54px;
    align-items: center;
    gap: var(--dya-space-2);
    padding: 3px var(--dya-space-2);
    border-radius: var(--dya-radius);
}

.eforoi-seat[data-role='analyst'] { box-shadow: inset 2px 0 0 var(--dya-accent); }

.eforoi-role { color: var(--dya-accent); }

.eforoi-cell { min-width: 0; }

.eforoi-pick { min-width: 0; }

.eforoi-pick-label {
    min-width: 0;
    letter-spacing: var(--dya-tracking-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.eforoi-pick[data-empty='true'] { color: var(--dya-text-4); }
.eforoi-pick[data-broken='true'] { color: var(--dya-danger); }

.eforoi-route {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-tier { flex: none; }

.eforoi-bar {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    margin-top: var(--dya-space-3);
}

.eforoi-spacer { flex: 1; }

.eforoi-meta {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-card {
    grid-column: span 12;
    overflow: hidden;
}

.eforoi-card[data-role='answer'] { grid-column: span 6; border-color: var(--dya-accent-soft); }
.eforoi-card[data-role='analysis'] { grid-column: span 6; }

.eforoi-card-head { padding-right: var(--dya-space-2); }

.eforoi-card-head:hover {
    background-image: none;
    background-color: var(--dya-flat-hover);
}

.eforoi-card-toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    height: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.eforoi-copy { flex: none; }
.eforoi-copy[data-done='true'] { border-color: var(--dya-success); color: var(--dya-success); }

.eforoi-chevron {
    flex: none;
    width: 10px;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    color: var(--dya-text-4);
}

.eforoi-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-idle);
}

.eforoi-dot[data-state='running'] { background: var(--dya-accent); }
.eforoi-dot[data-state='done'] { background: var(--dya-success); }
.eforoi-dot[data-state='error'] { background: var(--dya-danger); }

.eforoi-card-title { flex: none; color: var(--dya-text); }

.eforoi-card-note {
    flex: 1;
    min-width: 0;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-body {
    padding: var(--dya-space-3);
    white-space: pre-wrap;
    line-height: var(--dya-leading-loose);
    overflow-wrap: anywhere;
}

.eforoi-body[hidden] { display: none; }
.eforoi-body[data-structured='true'] { padding: 0; white-space: normal; }
.eforoi-body[data-prose='true'] { white-space: normal; }
.eforoi-body[data-prose='true'] > *:first-child { margin-top: 0; }
.eforoi-body[data-prose='true'] > *:last-child { margin-bottom: 0; }

.eforoi-body p { margin: 0 0 var(--dya-space-2); }
.eforoi-body h4 { margin: var(--dya-space-4) 0 var(--dya-space-2); }

.eforoi-body ul,
.eforoi-section ul {
    margin: 0;
    padding-left: var(--dya-space-4);
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-1);
}

.eforoi-body ul { margin-bottom: var(--dya-space-2); }

.eforoi-body code {
    padding: 0 3px;
    border-radius: var(--dya-radius-sm);
    background: var(--dya-surface-2);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-sm);
}

.eforoi-error {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    color: var(--dya-danger);
}

.eforoi-section {
    padding: var(--dya-space-3);
    border-top: var(--dya-border-width) solid var(--dya-rule);
}

.eforoi-section:first-child { border-top: none; }
.eforoi-section h4 { margin: 0 0 var(--dya-space-2); }
.eforoi-section li { line-height: var(--dya-leading-body); }

.eforoi-tag { margin-left: var(--dya-space-1); }

.eforoi-menu {
    position: fixed;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    min-width: 260px;
    max-width: 380px;
}

.eforoi-submenu { min-width: 150px; }

.eforoi-menu-search { flex: none; margin-bottom: var(--dya-space-1); }

.eforoi-menu-list { overflow-y: auto; }

.eforoi-menu-group { padding: var(--dya-space-2) var(--dya-space-2) var(--dya-space-1); }

.eforoi-menu-item[data-active='true'] { background-color: var(--dya-surface-2); }
.eforoi-menu-item:disabled { color: var(--dya-text-4); cursor: default; }

.eforoi-menu-label {
    flex: 1;
    min-width: 0;
    letter-spacing: var(--dya-tracking-mono);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.eforoi-menu-arrow { flex: none; color: var(--dya-text-3); }
.eforoi-menu-hint { flex: none; }
.eforoi-menu-empty { padding: var(--dya-space-3); }

@container (max-width: 1180px) {
    .eforoi-column[data-side='prompt'],
    .eforoi-column[data-side='panel'] { grid-column: span 12; }
    .eforoi-card[data-role='answer'],
    .eforoi-card[data-role='analysis'] { grid-column: span 12; }
}

@container (max-width: 720px) {
    .eforoi-seat { grid-template-columns: 64px minmax(0, 1fr) 168px; }
    .eforoi-seat > .eforoi-cell:nth-last-child(-n + 3) { display: none; }
}
`
