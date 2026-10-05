import { DEFAULT_THEME, THEMES, token } from '@dyarchia/kanon'
import type { Theme } from '@dyarchia/kanon'

let current = DEFAULT_THEME
const listeners = new Set<(id: string) => void>()

function apply(id: string): void {
    current = THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME
    document.documentElement.dataset.theme = current
}

/*
 * The stored theme is applied before the first render, so nothing is drawn in the default and then
 * repainted. An id kanon no longer declares falls back to the default.
 */
export async function restoreTheme(): Promise<void> {
    const stored = (await window.dyarchia?.invoke('shell:theme:get').catch(() => null)) as string | null
    apply(stored ?? DEFAULT_THEME)
}

export const theme = {
    list: (): Theme[] => THEMES.map((entry) => ({ ...entry })),
    current: (): string => current,
    async set(id: string): Promise<void> {
        if (id === current || !THEMES.some((entry) => entry.id === id)) return
        apply(id)
        for (const listener of listeners) listener(current)
        await window.dyarchia?.invoke('shell:theme:set', current, token('ground'))
    },
    on(listener: (id: string) => void): () => void {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }
}
