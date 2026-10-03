import { app, BrowserWindow, dialog, shell } from 'electron'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const FIND_LIMIT = 8

const TEXT_EXTENSIONS = [
    'md', 'txt', 'json', 'yaml', 'yml', 'js', 'ts', 'css', 'html',
    'xml', 'csv', 'log', 'ps1', 'py', 'cls', 'trigger', 'apex'
]

function parentWindow(): BrowserWindow | undefined {
    return BrowserWindow.getFocusedWindow() ?? undefined
}

async function chooseFolder(start: string): Promise<string | null> {
    const options = {
        title: 'Docs folder',
        defaultPath: start,
        buttonLabel: 'Use folder',
        properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const parent = parentWindow()
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
}

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

/*
 * A page is named by whoever makes it, in a field, so the name is checked here: one segment, none
 * of the characters Windows refuses, and markdown unless it says otherwise.
 */
function pageName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    const name = raw.trim().replace(/[. ]+$/, '')
    if (!name || /[<>:"/\\|?*\u0000-\u001f]/.test(name)) return null
    return extname(name) ? name : `${name}.md`
}

async function load(filePath: string): Promise<Record<string, unknown>> {
    try {
        const info = await stat(filePath)
        if (info.size > MAX_FILE_SIZE) {
            return { error: 'Too large' }
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
        return { error: 'Cannot read' }
    }
}

export function activate(ctx: PluginMainContext): void {
    ctx.handle('open', async () => {
        const filePath = await choose()
        if (!filePath) return { canceled: true }
        return load(filePath)
    })

    /*
     * The pages live in one folder the person chooses, asked the first time a page is made and
     * kept in the application's state beside the others. Until then it is the data home's docs
     * folder, which is also where the dialog starts, so the pages already there are one click from
     * staying where they are.
     */
    const fallback = join(ctx.dataHome, 'docs')
    const statePath = join(app.getPath('userData'), 'docviewer.json')
    let chosen: string | null = null

    async function remembered(): Promise<string | null> {
        if (chosen) return chosen
        try {
            const folder = (JSON.parse(await readFile(statePath, 'utf-8')) as { folder?: unknown }).folder
            if (typeof folder === 'string' && isAbsolute(folder)) chosen = folder
        } catch {
            chosen = null
        }
        return chosen
    }

    async function folder(): Promise<string> {
        const path = (await remembered()) ?? fallback
        await mkdir(path, { recursive: true })
        return path
    }

    async function pickFolder(): Promise<string | null> {
        const picked = await chooseFolder((await remembered()) ?? fallback)
        if (!picked) return null
        chosen = picked
        await writeFile(statePath, JSON.stringify({ folder: picked }, null, 4), 'utf-8')
        return picked
    }

    ctx.handle('folder', async () => ({ path: await folder(), chosen: (await remembered()) !== null }))

    ctx.handle('chooseFolder', async () => {
        const picked = await pickFolder()
        return picked ? { path: picked } : { canceled: true }
    })

    /*
     * The pages this panel keeps: the files in its folder, newest first. Files anywhere else are
     * reached through the file picker and are not listed.
     */
    ctx.handle('list', async () => {
        const pages = await folder()
        const entries = await readdir(pages, { withFileTypes: true })
        const files = await Promise.all(
            entries
                .filter((entry) => entry.isFile())
                .map(async (entry) => {
                    const path = join(pages, entry.name)
                    const info = await stat(path)
                    return { name: entry.name, path, size: info.size, mtime: info.mtimeMs }
                })
        )
        return files.sort((a, b) => b.mtime - a.mtime)
    })

    /*
     * The pages whose name or text holds the palette's words: the name first, then the first line
     * that holds them, cut to a line's worth.
     */
    ctx.handle('find', async (raw: unknown) => {
        const words = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
        if (!words) return []
        const pages = await folder()
        const entries = await readdir(pages, { withFileTypes: true })
        const found: { path: string; name: string; line?: number; text?: string }[] = []
        for (const entry of entries) {
            if (!entry.isFile() || found.length >= FIND_LIMIT) continue
            const path = join(pages, entry.name)
            if (entry.name.toLowerCase().includes(words)) {
                found.push({ path, name: entry.name })
                continue
            }
            const info = await stat(path)
            if (info.size > MAX_FILE_SIZE) continue
            const lines = (await readFile(path, 'utf-8')).split(/\r?\n/)
            const at = lines.findIndex((line) => line.toLowerCase().includes(words))
            if (at >= 0) found.push({ path, name: entry.name, line: at + 1, text: lines[at].trim().slice(0, 120) })
        }
        return found
    })

    /*
     * A new page is created empty and then read like any other. A name already taken is refused
     * rather than emptied. The first one asks where the pages live, and a dialog closed without an
     * answer makes nothing.
     */
    ctx.handle('create', async (raw: unknown) => {
        const untitled = raw === undefined
        const name = untitled ? 'Untitled.md' : pageName(raw)
        if (!name) return { error: 'Not a file name' }
        if (!(await remembered()) && !(await pickFolder())) return { canceled: true }
        const pages = await folder()
        for (let n = 1; ; n++) {
            const filePath = join(pages, n === 1 ? name : `Untitled ${n}.md`)
            try {
                await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
                return load(filePath)
            } catch (error) {
                const taken = (error as NodeJS.ErrnoException).code === 'EEXIST'
                if (!(taken && untitled)) return { error: taken ? 'Already exists' : 'Cannot create' }
            }
        }
    })

    ctx.handle('rename', async (payload: unknown) => {
        const { path, name: raw } = (payload ?? {}) as { path?: unknown; name?: unknown }
        const name = pageName(raw)
        if (typeof path !== 'string' || !path) return { error: 'No file to rename' }
        if (!name) return { error: 'Not a file name' }
        const next = join(dirname(path), name)
        if (next === resolve(path)) return { path: next, name }
        const taken = await stat(next).then(() => true, () => false)
        if (taken) return { error: 'Already exists' }
        try {
            await rename(path, next)
            return { path: next, name }
        } catch {
            return { error: 'Cannot rename' }
        }
    })

    /*
     * Deleting sends the file to the recycle bin, never past it, so a wrong click costs a trip
     * there and not the file.
     */
    ctx.handle('delete', async (target: unknown) => {
        if (typeof target !== 'string' || !target) return { error: 'No file to delete' }
        try {
            await shell.trashItem(resolve(target))
            return {}
        } catch {
            return { error: 'Cannot delete' }
        }
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
            return { error: 'File gone' }
        }

        try {
            await writeFile(path, content, 'utf-8')
            return { mtime: (await stat(path)).mtimeMs }
        } catch {
            return { error: 'Cannot write' }
        }
    })
}
