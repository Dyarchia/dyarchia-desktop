export type ThemeName = 'light' | 'dark'

export const THEME_ATTRIBUTE = 'data-dya-theme'

function root(): HTMLElement {
    return document.documentElement
}

export function getTheme(): ThemeName {
    return root().getAttribute(THEME_ATTRIBUTE) === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme: ThemeName): void {
    root().setAttribute(THEME_ATTRIBUTE, theme)
}

export function token(name: string): string {
    const property = name.startsWith('--') ? name : `--dya-${name}`
    return getComputedStyle(root()).getPropertyValue(property).trim()
}

export function onThemeChange(listener: (theme: ThemeName) => void): () => void {
    const observer = new MutationObserver(() => listener(getTheme()))
    observer.observe(root(), { attributeFilter: [THEME_ATTRIBUTE] })
    return () => observer.disconnect()
}
