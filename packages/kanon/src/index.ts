export function token(name: string): string {
    const property = name.startsWith('--') ? name : `--dya-${name}`
    return getComputedStyle(document.documentElement).getPropertyValue(property).trim()
}
