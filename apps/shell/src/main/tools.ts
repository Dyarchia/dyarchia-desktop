import { app } from 'electron'
import { readdir, stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

async function exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false)
}

function executable(name: string): string {
    return process.platform === 'win32' ? `${name}.exe` : name
}

async function onPath(name: string): Promise<string | null> {
    const wanted = executable(name)
    for (const directory of (process.env['PATH'] ?? '').split(delimiter).filter(Boolean)) {
        const candidate = join(directory, wanted)
        if (await exists(candidate)) return candidate
    }
    return null
}

async function findFile(root: string, wanted: string, depth: number): Promise<string | null> {
    const direct = join(root, wanted)
    if (await exists(direct)) return direct
    if (depth === 0) return null
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
        if (!entry.isDirectory()) continue
        const nested = await findFile(join(root, entry.name), wanted, depth - 1)
        if (nested) return nested
    }
    return null
}

/*
 * Where a binary a plugin needs is, or null: on PATH first, because a machine that already has it
 * should not get a second copy, then in the folder Setup extracted it into under the tools
 * directory, however deep the archive put it. Every plugin asks here, Setup included, so a binary
 * one of them fetched is the one all of them run.
 */
export async function findBinary(name: string): Promise<string | null> {
    const found = await onPath(name)
    if (found) return found
    const folder = join(app.getPath('userData'), 'tools', name)
    return (await exists(folder)) ? findFile(folder, executable(name), 4) : null
}
