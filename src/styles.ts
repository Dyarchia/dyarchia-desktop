export const STYLE_ID = 'eforoi-styles'

export const STYLES = `
.eforoi {
    --e-bg: var(--dya-bg, #07080a);
    --e-surface: var(--dya-surface-1, #0e0f11);
    --e-surface-2: var(--dya-surface-2, #17181b);
    --e-text: var(--dya-text, #f4f4f6);
    --e-text-2: var(--dya-text-2, #b4b6bd);
    --e-text-3: var(--dya-text-3, #7c7f88);
    --e-line: var(--dya-line, #24262b);
    --e-accent: var(--dya-accent, #ee6018);
    --e-accent-soft: var(--dya-accent-soft, rgba(238, 96, 24, 0.15));
    --e-danger: var(--dya-danger, #f0857c);
    --e-success: var(--dya-success, #63cf95);
    --e-radius: var(--dya-radius, 3px);
    --e-mono: var(--dya-font-mono, 'Geist Mono', ui-monospace, monospace);
    --e-sans: var(--dya-font-sans, 'Geist Sans', system-ui, sans-serif);
    --e-raised: var(--dya-elev-raised, 0 1px 2px rgba(0, 0, 0, 0.5));
    --e-raised-hover: var(--dya-elev-raised-hover, 0 2px 5px rgba(0, 0, 0, 0.55));
    --e-pressed: var(--dya-elev-pressed, inset 0 1px 2px rgba(0, 0, 0, 0.6));
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--e-text);
    font-family: var(--e-sans);
    font-size: 13px;
}

.eforoi * { box-sizing: border-box; }

.eforoi-head {
    flex: none;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--e-line);
}

.eforoi-columns {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 10px 20px;
    align-items: stretch;
}

.eforoi-column {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.eforoi-column[data-side='prompt'] { grid-column: span 5; }
.eforoi-column[data-side='panel'] { grid-column: span 7; }

.eforoi-results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
}

.eforoi-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: 8px;
}

.eforoi-label {
    font-family: var(--e-mono);
    font-size: 10px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    color: var(--e-text-3);
}

.eforoi-legend {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
}

.eforoi-prompt {
    width: 100%;
    flex: 1;
    min-height: 96px;
    resize: vertical;
    padding: 10px;
    border: none;
    border-radius: var(--e-radius);
    background: var(--e-bg);
    box-shadow: var(--e-pressed);
    color: var(--e-text);
    font-family: var(--e-sans);
    font-size: 13px;
    line-height: 1.5;
}

.eforoi-prompt:focus { outline: 2px solid var(--e-accent-soft); outline-offset: 1px; }

.eforoi-seats { display: flex; flex-direction: column; gap: 2px; }

.eforoi-seat {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) 124px 76px 46px 54px;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 6px;
    border-radius: var(--e-radius);
    border-left: 2px solid transparent;
}

.eforoi-seat:hover { background: var(--e-surface-2); }
.eforoi-seat[data-role='analyst'] { border-left-color: var(--e-accent); }

.eforoi-ordinal {
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
}

.eforoi-role {
    font-family: var(--e-mono);
    font-size: 9px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    color: var(--e-accent);
}

.eforoi-pick {
    height: 24px;
    padding: 0 9px;
    border: none;
    border-radius: var(--e-radius);
    background: var(--e-surface);
    box-shadow: var(--e-raised);
    color: var(--e-text);
    font-family: var(--e-mono);
    font-size: 11px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: transform var(--dya-dur-press, 90ms) var(--dya-ease-press, ease);
}

.eforoi-model { min-width: 0; }
.eforoi-mode { min-width: 0; }

.eforoi-pick:hover { box-shadow: var(--e-raised-hover); }
.eforoi-pick:active { box-shadow: var(--e-pressed); transform: translateY(1px); }
.eforoi-pick[data-empty='true'] { color: var(--e-text-3); }
.eforoi-pick[data-broken='true'] { color: var(--e-danger); }

.eforoi-route {
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-cell { min-width: 0; }

.eforoi-button {
    height: 24px;
    padding: 0 11px;
    border: none;
    border-radius: var(--e-radius);
    background: var(--e-surface);
    box-shadow: var(--e-raised);
    color: var(--e-text);
    font-family: var(--e-mono);
    font-size: 10px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    cursor: pointer;
    transition: transform var(--dya-dur-press, 90ms) var(--dya-ease-press, ease);
}

.eforoi-button:hover:not(:disabled) { box-shadow: var(--e-raised-hover); }
.eforoi-button:active:not(:disabled) { box-shadow: var(--e-pressed); transform: translateY(1px); }
.eforoi-button:disabled { color: var(--e-text-3); cursor: default; }
.eforoi-icon { width: 24px; padding: 0; font-size: 13px; }

.eforoi-bar { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
.eforoi-spacer { flex: 1; }

.eforoi-meta {
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
}

.eforoi-card {
    grid-column: span 12;
    border: 1px solid var(--e-line);
    border-radius: var(--e-radius);
    background: var(--e-surface);
    overflow: hidden;
}

.eforoi-card[data-role='answer'] { grid-column: span 6; border-color: var(--e-accent-soft); }
.eforoi-card[data-role='analysis'] { grid-column: span 6; }

.eforoi-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    user-select: none;
    background: transparent;
    border: none;
    width: 100%;
    color: inherit;
    font: inherit;
    text-align: left;
}

.eforoi-card-head:hover { background: var(--e-surface-2); }

.eforoi-chevron {
    flex: none;
    width: 10px;
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
}

.eforoi-dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: var(--dya-radius-full, 999px);
    background: var(--e-text-3);
}

.eforoi-dot[data-state='running'] { background: var(--e-accent); animation: eforoi-pulse 1.1s ease-in-out infinite; }
.eforoi-dot[data-state='done'] { background: var(--e-success); }
.eforoi-dot[data-state='error'] { background: var(--e-danger); }

@keyframes eforoi-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

.eforoi-card-title {
    flex: none;
    font-family: var(--e-mono);
    font-size: 11px;
}

.eforoi-card-note {
    flex: 1;
    min-width: 0;
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-body {
    padding: 12px 10px;
    border-top: 1px solid var(--e-line);
    white-space: pre-wrap;
    line-height: 1.6;
    font-size: 13px;
    overflow-wrap: anywhere;
}

.eforoi-body[hidden] { display: none; }
.eforoi-body[data-structured='true'] { padding: 0; white-space: normal; }
.eforoi-pending { color: var(--e-text-3); font-family: var(--e-mono); font-size: 11px; }

.eforoi-body[data-prose='true'] { white-space: normal; }
.eforoi-body[data-prose='true'] > *:first-child { margin-top: 0; }
.eforoi-body[data-prose='true'] > *:last-child { margin-bottom: 0; }
.eforoi-body p { margin: 0 0 10px; }
.eforoi-body h4 {
    margin: 16px 0 6px;
    font-family: var(--e-mono);
    font-size: 10px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    color: var(--e-text-3);
    font-weight: 400;
}
.eforoi-body ul { margin: 0 0 10px; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.eforoi-body code {
    padding: 0 3px;
    border-radius: var(--e-radius);
    background: var(--e-surface-2);
    font-family: var(--e-mono);
    font-size: 12px;
}
.eforoi-error { color: var(--e-danger); font-family: var(--e-mono); font-size: 11px; }

.eforoi-section { padding: 10px; border-top: 1px solid var(--e-line); }
.eforoi-section:first-child { border-top: none; }
.eforoi-section h4 {
    margin: 0 0 6px;
    font-family: var(--e-mono);
    font-size: 10px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    color: var(--e-text-3);
    font-weight: 400;
}

.eforoi-section ul {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.eforoi-section li { line-height: 1.55; }

.eforoi-tag {
    display: inline-block;
    margin-left: 6px;
    padding: 0 4px;
    border-radius: var(--e-radius);
    background: var(--e-accent-soft);
    font-family: var(--e-mono);
    font-size: 9px;
    color: var(--e-text-2);
}

.eforoi-tier {
    flex: none;
    padding: 0 4px;
    border-radius: var(--dya-radius, 3px);
    background: var(--dya-surface-2, #17181b);
    font-family: var(--dya-font-mono, 'Geist Mono', ui-monospace, monospace);
    font-size: 9px;
    color: var(--dya-text-3, #7c7f88);
}

.eforoi-menu {
    position: fixed;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    min-width: 260px;
    max-width: 380px;
    padding: 4px;
    border: 1px solid var(--dya-line, #24262b);
    border-radius: var(--dya-radius, 3px);
    background: var(--dya-surface-1, #0e0f11);
    box-shadow: var(--dya-elev-overlay, 0 8px 28px rgba(0, 0, 0, 0.6));
    color: var(--dya-text, #f4f4f6);
    font-family: var(--dya-font-mono, 'Geist Mono', ui-monospace, monospace);
    font-size: 11px;
}

.eforoi-submenu { min-width: 150px; }

.eforoi-menu-search {
    height: 24px;
    margin-bottom: 4px;
    padding: 0 6px;
    border: none;
    border-radius: var(--dya-radius, 3px);
    background: var(--dya-bg, #07080a);
    box-shadow: var(--dya-elev-pressed, inset 0 1px 2px rgba(0, 0, 0, 0.6));
    color: inherit;
    font: inherit;
}

.eforoi-menu-search:focus { outline: 2px solid var(--dya-accent-soft, rgba(238, 96, 24, 0.15)); outline-offset: 1px; }

.eforoi-menu-list { overflow-y: auto; }

.eforoi-menu-group {
    padding: 6px 6px 2px;
    color: var(--dya-text-3, #7c7f88);
    font-size: 9px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
}

.eforoi-menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 6px;
    border: none;
    border-left: 2px solid transparent;
    border-radius: 0 var(--dya-radius, 3px) var(--dya-radius, 3px) 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.eforoi-menu-item > span:first-child {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.eforoi-menu-item:hover:not(:disabled),
.eforoi-menu-item[data-active='true'] { background: var(--dya-surface-2, #17181b); }
.eforoi-menu-item[data-selected='true'] { border-left-color: var(--dya-accent, #ee6018); }
.eforoi-menu-item:disabled { color: var(--dya-text-4, #55575e); cursor: default; }

.eforoi-menu-arrow { flex: none; color: var(--dya-text-3, #7c7f88); }
.eforoi-menu-hint { flex: none; color: var(--dya-text-4, #55575e); font-size: 9px; }
.eforoi-menu-empty { padding: 8px 6px; color: var(--dya-text-3, #7c7f88); }

@container (max-width: 1180px) {
    .eforoi-column[data-side='prompt'],
    .eforoi-column[data-side='panel'] { grid-column: span 12; }
    .eforoi-card[data-role='answer'],
    .eforoi-card[data-role='analysis'] { grid-column: span 12; }
}

@container (max-width: 720px) {
    .eforoi-seat { grid-template-columns: 64px minmax(0, 1fr) 110px; }
    .eforoi-seat > .eforoi-cell:nth-last-child(-n + 3) { display: none; }
}
`
