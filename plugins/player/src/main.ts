import { app, BrowserWindow, dialog, protocol } from 'electron'
import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { PluginMainContext } from '@dyarchia/sdk'
import { CONVERTIBLE, MIME_TYPES, PLAYABLE_AUDIO, PLAYABLE_VIDEO, VIDEO_EXTENSIONS } from './media.js'

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

async function isFile(path: string): Promise<boolean> {
    return stat(path).then((info) => info.isFile(), () => false)
}

interface Streams {
    duration: number
    video?: string
    audio?: string
}

function probe(ffprobe: string, path: string): Promise<Streams | null> {
    return new Promise((resolve) => {
        execFile(
            ffprobe,
            ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
            { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout) => {
                if (error) return resolve(null)
                try {
                    const parsed = JSON.parse(String(stdout)) as {
                        format?: { duration?: string }
                        streams?: { codec_type?: string; codec_name?: string; disposition?: { attached_pic?: number } }[]
                    }
                    const streams = parsed.streams ?? []
                    resolve({
                        duration: Number(parsed.format?.duration ?? 0),
                        video: streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)?.codec_name,
                        audio: streams.find((s) => s.codec_type === 'audio')?.codec_name
                    })
                } catch {
                    resolve(null)
                }
            }
        )
    })
}

const TEXT_SUBTITLES = new Set(['subrip', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])

function vtt(srt: string): string {
    return `WEBVTT\n\n${srt.replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2')}`
}

function textTracks(ffprobe: string, path: string): Promise<{ index: number; lang: string; title: string }[]> {
    return new Promise((resolve) => {
        execFile(
            ffprobe,
            ['-v', 'error', '-select_streams', 's', '-show_entries', 'stream=index,codec_name:stream_tags=language,title', '-of', 'json', path],
            { windowsHide: true },
            (error, stdout) => {
                if (error) return resolve([])
                try {
                    const streams = (JSON.parse(String(stdout)).streams ?? []) as {
                        index: number
                        codec_name?: string
                        tags?: { language?: string; title?: string }
                    }[]
                    resolve(
                        streams
                            .filter((s) => TEXT_SUBTITLES.has(s.codec_name ?? ''))
                            .map((s) => ({ index: s.index, lang: s.tags?.language ?? '', title: s.tags?.title ?? '' }))
                    )
                } catch {
                    resolve([])
                }
            }
        )
    })
}

/*
 * What Chromium cannot play is converted into one file per player under the cache, then played
 * from there with the seeking a finished file has. A stream it can already decode is copied, so
 * the common case, a known codec in a foreign box, takes seconds. The cache is emptied at start,
 * when a player opens something else and when it closes: the player keeps no history.
 */
export function activate(ctx: PluginMainContext): void {
    protocol.handle(MEDIA_SCHEME, serveMedia)

    const cache = join(app.getPath('userData'), 'cache', 'player')
    void rm(cache, { recursive: true, force: true })
    const working = new Map<string, { child: ChildProcess | null; output: string }>()

    async function tools(): Promise<{ ffmpeg: string; ffprobe: string } | null> {
        const ffmpeg = await ctx.binary('ffmpeg')
        if (!ffmpeg) return null
        const sibling = join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
        const ffprobe = (await isFile(sibling)) ? sibling : await ctx.binary('ffprobe')
        return ffprobe ? { ffmpeg, ffprobe } : null
    }

    async function release(instance: string): Promise<void> {
        const job = working.get(instance)
        if (!job) return
        working.delete(instance)
        job.child?.kill()
        await rm(job.output, { force: true })
    }

    ctx.handle('ffmpeg', async () => (await tools()) !== null)

    /*
     * The subtitles a video carries as text, inside it or beside it as a .srt or .vtt under its
     * own name, handed to the panel as WebVTT text: a picture subtitle cannot become a track,
     * and nothing is written to disk to read them.
     */
    ctx.handle('subtitles', async (path) => {
        const filePath = String(path)
        const found: { lang: string; label: string; text: string }[] = []
        const folder = dirname(filePath)
        const base = basename(filePath, extname(filePath))
        for (const name of await readdir(folder).catch(() => [] as string[])) {
            const extension = extname(name).toLowerCase()
            if (!name.startsWith(`${base}.`) || (extension !== '.vtt' && extension !== '.srt')) continue
            const middle = name.slice(base.length + 1, -extension.length)
            const text = await readFile(join(folder, name), 'utf8').catch(() => '')
            if (!text) continue
            found.push({ lang: middle.split('.')[0] ?? '', label: middle, text: extension === '.srt' ? vtt(text) : text })
        }
        const binaries = await tools()
        if (!binaries) return found
        for (const stream of await textTracks(binaries.ffprobe, filePath)) {
            const text = await new Promise<string>((resolve) =>
                execFile(
                    binaries.ffmpeg,
                    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', filePath, '-map', `0:${stream.index}`, '-f', 'webvtt', 'pipe:1'],
                    { windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
                    (error, stdout) => resolve(error ? '' : String(stdout))
                )
            )
            if (text.startsWith('WEBVTT')) found.push({ lang: stream.lang, label: stream.title, text })
        }
        return found
    })

    ctx.handle('release', (instance) => release(String(instance)))

    ctx.handle('prepare', async (path, instance) => {
        const filePath = String(path)
        const id = String(instance)
        await release(id)
        const found = await tools()
        if (!found) throw new Error('FFmpeg missing')
        const streams = await probe(found.ffprobe, filePath)
        if (!streams || (!streams.video && !streams.audio)) throw new Error('Cannot play')
        await mkdir(cache, { recursive: true })
        const output = join(cache, `${id.replace(/[^\w-]/g, '_')}-${Date.now()}.mp4`)
        const copyVideo = streams.video !== undefined && PLAYABLE_VIDEO.has(streams.video)
        const copyAudio = streams.audio !== undefined && ['aac', 'mp3', 'opus', 'flac'].includes(streams.audio)
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-progress', 'pipe:1', '-nostats', '-i', filePath]
        if (streams.video) {
            args.push('-map', '0:v:0', '-c:v', copyVideo ? 'copy' : 'libx264')
            if (!copyVideo) args.push('-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p')
            if (streams.video === 'hevc') args.push('-tag:v', 'hvc1')
        } else {
            args.push('-vn')
        }
        if (streams.audio) args.push('-map', '0:a:0', '-c:a', copyAudio ? 'copy' : 'aac', '-b:a', '192k')
        args.push('-sn', '-dn', '-movflags', '+faststart', output)
        const child = spawn(found.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        working.set(id, { child, output })
        let sent = 0
        child.stderr.resume()
        child.stdout.on('data', (chunk: Buffer) => {
            const match = /out_time_us=(\d+)/.exec(chunk.toString())
            if (!match || !streams.duration || Date.now() - sent < 250) return
            sent = Date.now()
            ctx.broadcast('progress', id, Math.min(99, Math.floor((Number(match[1]) / 1e6 / streams.duration) * 100)))
        })
        const code = await new Promise<number | null>((resolve) => {
            child.on('error', () => resolve(-1))
            child.on('close', resolve)
        })
        const job = working.get(id)
        if (job?.child !== child) throw new Error('Stopped')
        job.child = null
        if (code !== 0) {
            await release(id)
            throw new Error('Cannot play')
        }
        return {
            path: filePath,
            name: basename(filePath),
            kind: streams.video ? 'video' : 'audio',
            src: `${MEDIA_SCHEME}://local/${encodeURIComponent(output)}`,
            convert: false
        }
    })

    ctx.handle('pick', async () => {
        const convertible = (await tools()) ? CONVERTIBLE : []
        const options = {
            title: 'Open media',
            properties: ['openFile' as const],
            filters: [
                { name: 'Media', extensions: [...Object.keys(MIME_TYPES), ...convertible].map((ext) => ext.slice(1)) },
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
        const extension = extname(filePath).toLowerCase()
        const found = await tools()
        const streams = found ? await probe(found.ffprobe, filePath) : null
        const convert =
            streams !== null &&
            (!(extension in MIME_TYPES) ||
                (streams.video !== undefined && !PLAYABLE_VIDEO.has(streams.video)) ||
                (streams.audio !== undefined && !PLAYABLE_AUDIO.has(streams.audio)))
        return {
            path: filePath,
            name: basename(filePath),
            kind: (streams ? streams.video !== undefined : VIDEO_EXTENSIONS.has(extension)) ? 'video' : 'audio',
            src: `${MEDIA_SCHEME}://local/${encodeURIComponent(filePath)}`,
            convert
        }
    })

}
