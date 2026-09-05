import { BrowserWindow, dialog } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

const MAX_FILE_SIZE = 2 * 1024 * 1024

const TEXT_EXTENSIONS = [
    'md', 'txt', 'json', 'yaml', 'yml', 'js', 'ts', 'css', 'html',
    'xml', 'csv', 'log', 'ps1', 'py', 'cls', 'trigger', 'apex'
]

async function choose(): Promise<string | null> {
    const options = {
        title: 'Open document',
        properties: ['openFile' as const],
        filters: [
            { name: 'Documents', extensions: TEXT_EXTENSIONS },
            { name: 'All files', extensions: ['*'] }
        ]
    }
    const parent = BrowserWindow.getFocusedWindow()
    const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function activate(ctx: PluginMainContext): void {
    ctx.handle('open', async () => {
        const filePath = await choose()
        if (!filePath) return { canceled: true }
        try {
            const info = await stat(filePath)
            if (info.size > MAX_FILE_SIZE) {
                return { error: `File too large (${Math.round(info.size / 1024)} KB)` }
            }
            return {
                name: basename(filePath),
                markdown: extname(filePath).toLowerCase() === '.md',
                content: await readFile(filePath, 'utf-8')
            }
        } catch {
            return { error: 'Cannot read that file' }
        }
    })
}
