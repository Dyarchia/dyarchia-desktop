export interface ThemeDescriptor {
    id: string
    label: string
    glyph: string
}

export const THEMES: ThemeDescriptor[] = [
    { id: 'gi', label: 'Gi', glyph: '🌍' },
    { id: 'oneiro', label: 'Oneiro', glyph: '🌙' }
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
