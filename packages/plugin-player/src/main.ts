import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { PluginMainContext } from '@dyarchia/sdk'

const MEDIA_SCHEME = 'dyarchia-media'

const MIME_TYPES: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime'
}

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

export function activate(ctx: PluginMainContext): void {
    protocol.handle(MEDIA_SCHEME, serveMedia)

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
}
