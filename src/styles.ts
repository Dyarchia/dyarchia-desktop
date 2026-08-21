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
    --e-warning: var(--dya-warning, #d6a95c);
    --e-radius: var(--dya-radius, 3px);
    --e-mono: var(--dya-font-mono, 'Geist Mono', ui-monospace, monospace);
    --e-sans: var(--dya-font-sans, 'Geist Sans', system-ui, sans-serif);
    --e-raised: var(--dya-elev-raised, 0 1px 2px rgba(0, 0, 0, 0.5));
    --e-raised-hover: var(--dya-elev-raised-hover, 0 2px 5px rgba(0, 0, 0, 0.55));
    --e-pressed: var(--dya-elev-pressed, inset 0 1px 2px rgba(0, 0, 0, 0.6));
    --e-overlay: var(--dya-elev-overlay, 0 8px 28px rgba(0, 0, 0, 0.6));

    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--e-text);
    font-family: var(--e-sans);
    font-size: 13px;
}

.eforoi * { box-sizing: border-box; }

.eforoi-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.eforoi-label {
    font-family: var(--e-mono);
    font-size: 10px;
    letter-spacing: var(--dya-tracking-mono, 0.06em);
    text-transform: uppercase;
    color: var(--e-text-3);
}

.eforoi-prompt {
    width: 100%;
    min-height: 76px;
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

.eforoi-seats { display: flex; flex-direction: column; gap: 4px; }

.eforoi-seat {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: var(--e-radius);
    border-left: 2px solid transparent;
    background: transparent;
}

.eforoi-seat[data-role='analyst'] { border-left-color: var(--e-accent); }
.eforoi-seat:hover { background: var(--e-surface-2); }

.eforoi-ordinal {
    width: 16px;
    flex: none;
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
    text-align: center;
}

.eforoi-pick {
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 10px;
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

.eforoi-mode {
    flex: none;
    width: 108px;
    text-align: left;
}

.eforoi-pick:hover { box-shadow: var(--e-raised-hover); }
.eforoi-pick:active { box-shadow: var(--e-pressed); transform: translateY(1px); }
.eforoi-pick[data-empty='true'] { color: var(--e-text-3); }

.eforoi-button {
    height: 26px;
    padding: 0 12px;
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

.eforoi-icon { width: 26px; padding: 0; font-size: 13px; }

.eforoi-bar { display: flex; align-items: center; gap: 6px; }
.eforoi-spacer { flex: 1; }

.eforoi-meta {
    font-family: var(--e-mono);
    font-size: 10px;
    color: var(--e-text-3);
}

.eforoi-card {
    border: 1px solid var(--e-line);
    border-radius: var(--e-radius);
    background: var(--e-surface);
    overflow: hidden;
}

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
    flex: 1;
    min-width: 0;
    font-family: var(--e-mono);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.eforoi-body {
    padding: 10px;
    border-top: 1px solid var(--e-line);
    white-space: pre-wrap;
    line-height: 1.55;
    font-size: 13px;
    overflow-wrap: anywhere;
}

.eforoi-body[hidden] { display: none; }
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

.eforoi-section ul { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 4px; }
.eforoi-section li { line-height: 1.5; }

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

.eforoi-menu {
    position: fixed;
    z-index: 9000;
    display: flex;
    flex-direction: column;
    max-height: 340px;
    min-width: 220px;
    max-width: 360px;
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
    gap: 8px;
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

.eforoi-menu-arrow { color: var(--dya-text-3, #7c7f88); }
.eforoi-menu-hint { color: var(--dya-text-4, #55575e); font-size: 9px; }
.eforoi-menu-empty { padding: 8px 6px; color: var(--dya-text-3, #7c7f88); }

.eforoi-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--e-text-3);
    font-family: var(--e-mono);
    font-size: 11px;
    text-align: center;
}
`
