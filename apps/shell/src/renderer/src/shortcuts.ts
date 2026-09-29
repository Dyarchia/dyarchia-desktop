import type { DockviewApi } from 'dockview-react'

export interface ShortcutActions {
    openPanel: (id: string) => void
    togglePalette: () => void
}

const SETTINGS_PANEL = 'settings'

export const PANEL_KEYS: Record<string, string> = { [SETTINGS_PANEL]: 'Ctrl+,' }

function insideTerminal(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('.xterm') !== null
}

function cycle(api: DockviewApi, offset: number): void {
    const group = api.activeGroup
    if (!group || group.panels.length < 2) return
    const current = group.activePanel ? group.panels.indexOf(group.activePanel) : -1
    const next = (current + offset + group.panels.length) % group.panels.length
    group.panels[next].api.setActive()
}

/*
 * Ctrl+W and Ctrl+K are left alone while a terminal has the focus: there they are the shell's
 * own word erase and kill to the end of the line, and a panel that closes under a typist's fingers is worse than one that needs the
 * mouse. Zoom lives in the main process, because the application menu is null and the
 * page never sees those keys.
 */
export function installShortcuts(api: DockviewApi, actions: ShortcutActions): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
        if (!event.ctrlKey || event.altKey || event.metaKey) return

        if (event.key === 'Tab') {
            event.preventDefault()
            cycle(api, event.shiftKey ? -1 : 1)
            return
        }
        if (event.shiftKey) return

        if (event.key === 'k' && !insideTerminal(event.target)) {
            event.preventDefault()
            actions.togglePalette()
            return
        }
        if (event.key === 'w' && !insideTerminal(event.target)) {
            event.preventDefault()
            api.activePanel?.api.close()
            return
        }
        if (event.key === ',') {
            event.preventDefault()
            actions.openPanel(SETTINGS_PANEL)
        }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
}
