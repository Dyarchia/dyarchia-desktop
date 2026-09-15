const EARTH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>'
const SLATE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>'

export interface ThemeDescriptor {
    id: string
    label: string
    icon: string
}

export const THEMES: ThemeDescriptor[] = [
    { id: 'gi', label: 'Gi', icon: EARTH_ICON },
    { id: 'slate', label: 'Slate', icon: SLATE_ICON }
]

const STORAGE_KEY = 'dyarchia:theme'
const FALLBACK = THEMES[0].id

export function readTheme(): string {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && THEMES.some((theme) => theme.id === stored)) return stored
    } catch {
        return FALLBACK
    }
    return FALLBACK
}

export function applyTheme(id: string): void {
    document.documentElement.dataset.theme = id
    try {
        localStorage.setItem(STORAGE_KEY, id)
    } catch {
        return
    }
}
