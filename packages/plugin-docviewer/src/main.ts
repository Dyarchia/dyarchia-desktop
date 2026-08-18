import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

const MAX_FILE_SIZE = 2 * 1024 * 1024

export function activate(ctx: PluginMainContext): void {
    ctx.handle('home', () => homedir())

    ctx.handle('list', async (...args: unknown[]) => {
        const [dirPath] = args as [string]
        const names = await readdir(dirPath, { withFileTypes: true })
        return names
            .filter((entry) => !entry.name.startsWith('.'))
            .map((entry) => ({
                name: entry.name,
                isDir: entry.isDirectory(),
                path: join(dirPath, entry.name)
            }))
            .sort((a, b) =>
                a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1
            )
    })

    ctx.handle('read', async (...args: unknown[]) => {
        const [filePath] = args as [string]
        const info = await stat(filePath)
        if (info.size > MAX_FILE_SIZE) {
            return { error: `File too large (${Math.round(info.size / 1024)} KB)` }
        }
        return { content: await readFile(filePath, 'utf-8') }
    })
}
