import { app, BrowserWindow, dialog, protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { PluginMainContext } from '@dyarchia/sdk'
import { MIME_TYPES, VIDEO_EXTENSIONS } from './media.js'

const MEDIA_SCHEME = 'dyarchia-media'

function mimeOf(filePath: string): string {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    return MIME_TYPES[ext] ?? 'application/octet-stream'
}

async function serveMedia(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    let size: number
    try {
        const info = await stat(filePath)
        if (!info.isFile()) return new Response('not a file', { status: 404 })
        size = info.size
    } catch {
        return new Response('not found', { status: 404 })
    }

    const baseHeaders = {
        'Content-Type': mimeOf(filePath),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    }

    const range = request.headers.get('range')
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
    if (match && (match[1] || match[2])) {
        const start = match[1] ? Number(match[1]) : size - Number(match[2])
        const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
        if (Number.isNaN(start) || start < 0 || start > end || end >= size) {
            return new Response('bad range', {
                status: 416,
                headers: { 'Content-Range': `bytes */${size}` }
            })
        }
        const stream = Readable.toWeb(
            createReadStream(filePath, { start, end })
        ) as ReadableStream
        return new Response(stream, {
            status: 206,
            headers: {
                ...baseHeaders,
                'Content-Range': `bytes ${start}-${end}/${size}`,
                'Content-Length': String(end - start + 1)
            }
        })
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
    return new Response(stream, {
        status: 200,
        headers: { ...baseHeaders, 'Content-Length': String(size) }
    })
}

interface Recent {
    path: string
    name: string
    at: number
}

const RECENT_LIMIT = 11

function recentPath(): string {
    return join(app.getPath('userData'), 'player', 'recent.json')
}

async function readRecent(): Promise<Recent[]> {
    try {
        const parsed: unknown = JSON.parse(await readFile(recentPath(), 'utf-8'))
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (item): item is Recent => typeof item?.path === 'string' && typeof item.at === 'number'
        )
    } catch {
        return []
    }
}

async function isFile(path: string): Promise<boolean> {
    return stat(path).then((info) => info.isFile(), () => false)
}

function samePath(a: string, b: string): boolean {
    const plain = (path: string): string =>
        process.platform === 'win32' ? path.replaceAll('/', '\\').toLowerCase() : path
    return plain(a) === plain(b)
}

async function present(): Promise<Recent[]> {
    const all = (await readRecent()).sort((a, b) => b.at - a.at)
    const kept = await Promise.all(all.map((item) => isFile(item.path)))
    return all.filter((_, index) => kept[index])
}

async function remember(path: string): Promise<void> {
    const kept = (await readRecent()).filter((item) => !samePath(item.path, path))
    const next = [{ path, name: basename(path), at: Date.now() }, ...kept].slice(0, RECENT_LIMIT)
    await mkdir(dirname(recentPath()), { recursive: true })
    await writeFile(recentPath(), JSON.stringify(next, null, 4) + '\n', 'utf-8')
}

export function activate(ctx: PluginMainContext): void {
    protocol.handle(MEDIA_SCHEME, serveMedia)

    ctx.handle('pick', async () => {
        const options = {
            title: 'Open media',
            properties: ['openFile' as const],
            filters: [
                { name: 'Media', extensions: Object.keys(MIME_TYPES).map((ext) => ext.slice(1)) },
                { name: 'All files', extensions: ['*'] }
            ]
        }
        const parent = BrowserWindow.getFocusedWindow()
        const result = parent
            ? await dialog.showOpenDialog(parent, options)
            : await dialog.showOpenDialog(options)
        return result.canceled ? null : (result.filePaths[0] ?? null)
    })

    ctx.handle('media', async (path) => {
        const filePath = String(path)
        if (!(await isFile(filePath))) throw new Error('not a file')
        await remember(filePath).then(
            async () => ctx.broadcast('recent', await present()),
            () => undefined
        )
        return {
            path: filePath,
            name: basename(filePath),
            kind: VIDEO_EXTENSIONS.has(extname(filePath).toLowerCase()) ? 'video' : 'audio',
            src: `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`
        }
    })

    ctx.handle('recent', present)
}
