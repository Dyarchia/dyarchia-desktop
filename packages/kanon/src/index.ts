export function token(name: string): string {
    const property = name.startsWith('--') ? name : `--dya-${name}`
    return getComputedStyle(document.documentElement).getPropertyValue(property).trim()
}

export interface Theme {
    id: string
    name: string
}

/*
 * Every theme kanon declares, the default first. The default is `:root` in tokens.css; each other
 * is `:root[data-theme="<id>"]` in css/themes: the tokens it changes, and component rules where
 * its shape differs.
 */
export const THEMES: readonly Theme[] = [{ id: 'dyarchia', name: 'Dyarchia' }]

export const DEFAULT_THEME = THEMES[0].id
