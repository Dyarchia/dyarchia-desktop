import { getTheme, setTheme } from '@dyarchia/ui'
import type { ThemeName } from '@dyarchia/ui'

const STORAGE_KEY = 'dyarchia:theme'

function stored(): ThemeName | null {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
}

export function bootstrapTheme(): void {
    setTheme(stored() ?? 'dark')
}

export function applyTheme(theme: ThemeName): void {
    localStorage.setItem(STORAGE_KEY, theme)
    setTheme(theme)
}

export function toggleTheme(): void {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
