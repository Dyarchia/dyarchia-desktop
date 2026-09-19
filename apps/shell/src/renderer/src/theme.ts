const GI_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/></svg>'
const REI_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.5 14.5c2-1.6 3.4-1.6 5.4 0s3.4 1.6 5.4 0 3.4-1.6 5.4 0"/><path d="M5.5 10c1.6-1.3 2.7-1.3 4.3 0s2.7 1.3 4.3 0 2.7-1.3 4.3 0"/></svg>'

export interface ThemeDescriptor {
    id: string
    label: string
    icon: string
}

/*
 * Two themes, both dark, and that is now a property of the system rather than an accident of which
 * one shipped first. The mid-tone one is gone: it was the answer to a real complaint about glare,
 * and it was replaced by a ground that is dark and tinted rather than light and tinted, which
 * answers the same complaint without a pale surface anywhere in the application.
 */
export const THEMES: ThemeDescriptor[] = [
    { id: 'gi', label: 'Gi', icon: GI_ICON },
    { id: 'rei', label: 'Rei', icon: REI_ICON }
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
