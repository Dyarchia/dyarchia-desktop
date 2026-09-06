import { access, constants } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

const EXTENSIONS = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']

const cache = new Map<string, string | null>()

async function executable(path: string): Promise<boolean> {
    try {
        await access(path, constants.X_OK)
        return true
    } catch {
        return false
    }
}

export async function which(name: string): Promise<string | null> {
    if (cache.has(name)) return cache.get(name) ?? null

    const roots = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    for (const root of roots) {
        for (const extension of EXTENSIONS) {
            const candidate = join(root, `${name}${extension}`)
            if (await executable(candidate)) {
                cache.set(name, candidate)
                return candidate
            }
        }
    }

    cache.set(name, null)
    return null
}

export function forget(): void {
    cache.clear()
}
