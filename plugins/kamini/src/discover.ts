import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * The files a pattern names: `~` is the home folder and `<project>` the project being looked at,
 * `*` one name and `**` any depth of folders. A pattern whose project is not known names nothing.
 * Depth is capped and dependency folders are never walked, so a project with a large tree costs
 * a moment rather than a scan of everything under it.
 */
const SKIP = new Set(['node_modules', '.git', '.venv', 'dist', 'build', 'out', 'target', '__pycache__'])
const DEEP = 6

function match(name: string, part: string): boolean {
    if (part === '*') return true
    if (!part.includes('*')) return name.toLowerCase() === part.toLowerCase()
    const pattern = new RegExp(`^${part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
    return pattern.test(name)
}

async function walk(base: string, parts: string[], depth: number, found: string[]): Promise<void> {
    if (parts.length === 0) {
        found.push(base)
        return
    }
    const [part, ...rest] = parts as [string, ...string[]]
    if (part === '**') {
        await walk(base, rest, depth, found)
        if (depth >= DEEP) return
        const entries = await readdir(base, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
            if (entry.isDirectory() && !SKIP.has(entry.name)) await walk(join(base, entry.name), parts, depth + 1, found)
        }
        return
    }
    if (!part.includes('*')) {
        const next = join(base, part)
        if (rest.length === 0) {
            if (await stat(next).catch(() => null)) found.push(next)
            return
        }
        await walk(next, rest, depth, found)
        return
    }
    const entries = await readdir(base, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
        if (!match(entry.name, part)) continue
        if (rest.length === 0 || entry.isDirectory()) await walk(join(base, entry.name), rest, depth, found)
    }
}

export async function expand(pattern: string, home: string, project: string): Promise<string[]> {
    let rooted = pattern
    if (rooted.startsWith('~/')) rooted = join(home, rooted.slice(2))
    else if (rooted.startsWith('<project>/')) {
        if (!project) return []
        rooted = join(project, rooted.slice('<project>/'.length))
    } else return []
    const parts = rooted.replace(/\\/g, '/').split('/').filter(Boolean)
    const fixed: string[] = []
    while (parts.length && !parts[0]!.includes('*')) fixed.push(parts.shift()!)
    const base = /^[a-z]:$/i.test(fixed[0] ?? '') ? `${fixed.join('/')}` : `/${fixed.join('/')}`
    if (parts.length === 0) return (await stat(base).catch(() => null)) ? [base] : []
    const found: string[] = []
    await walk(base, parts, 0, found)
    return found
}
