import { BrowserWindow, dialog } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
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

async function load(filePath: string): Promise<Record<string, unknown>> {
    try {
        const info = await stat(filePath)
        if (info.size > MAX_FILE_SIZE) {
            return { error: `File too large (${Math.round(info.size / 1024)} KB)` }
        }
        return {
            name: basename(filePath),
            path: filePath,
            markdown: extname(filePath).toLowerCase() === '.md',
            /*
             * What the file was when it was read. A panel that lets somebody edit has to be able
             * to tell a save from an overwrite, and the only honest way to know is to compare
             * this against the file on disk at the moment of writing.
             */
            mtime: info.mtimeMs,
            content: await readFile(filePath, 'utf-8')
        }
    } catch {
        return { error: 'Cannot read that file' }
    }
}

export function activate(ctx: PluginMainContext): void {
    ctx.handle('open', async () => {
        const filePath = await choose()
        if (!filePath) return { canceled: true }
        return load(filePath)
    })

    /*
     * Read a file somebody else found. The dialog is the other way in and stays; this one exists
     * because a plugin that locates something should be able to show it without asking the user
     * to find it again in a file picker.
     */
    ctx.handle('read', async (target: unknown) => {
        if (typeof target !== 'string' || !target) return { error: 'No file to open' }
        return load(target)
    })

    /*
     * The one thing in this plugin that changes something. It writes only where it was told, only
     * a file it already read, and only when what is on disk is still what was read — unless the
     * caller says to overwrite, which the panel asks for a second time before it sends.
     */
    ctx.handle('write', async (payload: unknown) => {
        const { path, content, mtime, force } = (payload ?? {}) as {
            path?: unknown
            content?: unknown
            mtime?: unknown
            force?: unknown
        }
        if (typeof path !== 'string' || !path) return { error: 'No file to save' }
        if (typeof content !== 'string') return { error: 'Nothing to save' }

        try {
            const info = await stat(path)
            if (force !== true && typeof mtime === 'number' && info.mtimeMs !== mtime) {
                return { stale: true }
            }
        } catch {
            return { error: 'That file is no longer there' }
        }

        try {
            await writeFile(path, content, 'utf-8')
            return { mtime: (await stat(path)).mtimeMs }
        } catch {
            return { error: 'Cannot write to that file' }
        }
    })
}
