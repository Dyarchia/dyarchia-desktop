import { app, webContents } from 'electron'
import type { Session } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'

interface Found {
    url: string
    kind: 'hls' | 'dash' | 'file'
    page: string
    title: string
}

const PLAYLIST = /\.m3u8(?:[?#]|$)/i
const MANIFEST = /\.mpd(?:[?#]|$)/i
const SEGMENT = /\.(?:ts|m4s|aac|vtt|webvtt)(?:[?#]|$)/i

function kindOf(url: string, type: string, resource: string): Found['kind'] | null {
    if (PLAYLIST.test(url) || /mpegurl/i.test(type)) return 'hls'
    if (MANIFEST.test(url) || /dash\+xml/i.test(type)) return 'dash'
    if (resource === 'media' && /^(?:video|audio)\//i.test(type) && !SEGMENT.test(url)) return 'file'
    return null
}

function header(headers: Record<string, string[]> | undefined, name: string): string {
    const key = Object.keys(headers ?? {}).find((k) => k.toLowerCase() === name)
    return key ? (headers?.[key]?.[0] ?? '') : ''
}

async function exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false)
}

function slug(title: string): string {
    const cleaned = title.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    return cleaned || 'video'
}

/*
 * The videos a page plays, so the bar can offer to keep one. Only what the page fetched in the
 * open counts: an HLS playlist, a DASH manifest or a whole media file. A stream behind DRM never
 * reaches here as anything FFmpeg could read, and nothing tries to make it. A page's list empties
 * when its main frame navigates. The first playlist a page loads is its master, so it is the one
 * kept; saving it picks the tallest picture it offers and its first sound.
 */
export function watchVideos(ctx: PluginMainContext, browsing: Session): void {
    const found = new Map<number, Found[]>()
    const watched = new Set<number>()
    const saving = new Set<number>()

    browsing.webRequest.onResponseStarted({ urls: ['<all_urls>'] }, (details) => {
        const id = details.webContentsId
        if (id === undefined || details.statusCode >= 400) return
        const kind = kindOf(details.url, header(details.responseHeaders, 'content-type'), details.resourceType)
        if (!kind) return
        const contents = webContents.fromId(id)
        if (!contents) return
        if (!watched.has(id)) {
            watched.add(id)
            contents.on('did-start-navigation', (event) => {
                if (!event.isMainFrame || event.isSameDocument) return
                found.delete(id)
                ctx.broadcast('videos', id, 0)
            })
            contents.once('destroyed', () => {
                watched.delete(id)
                found.delete(id)
            })
        }
        const list = found.get(id) ?? []
        if (list.some((item) => item.url === details.url)) return
        if (kind === 'hls' && list.some((item) => item.kind === 'hls')) return
        list.push({ url: details.url, kind, page: contents.getURL(), title: contents.getTitle() })
        found.set(id, list)
        ctx.broadcast('videos', id, list.length)
    })

    async function tools(): Promise<{ ffmpeg: string; ffprobe: string } | null> {
        const ffmpeg = await ctx.binary('ffmpeg')
        if (!ffmpeg) return null
        const sibling = join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
        const ffprobe = (await exists(sibling)) ? sibling : await ctx.binary('ffprobe')
        return ffprobe ? { ffmpeg, ffprobe } : null
    }

    function probe(ffprobe: string, input: string[]): Promise<{
        duration: number
        streams: { index: number; codec_type?: string; height?: number; tags?: { variant_bitrate?: string } }[]
    } | null> {
        return new Promise((resolve) => {
            execFile(
                ffprobe,
                ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ...input],
                { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
                (error, stdout) => {
                    if (error) return resolve(null)
                    try {
                        const parsed = JSON.parse(String(stdout))
                        resolve({ duration: Number(parsed.format?.duration ?? 0), streams: parsed.streams ?? [] })
                    } catch {
                        resolve(null)
                    }
                }
            )
        })
    }

    ctx.handle('canSave', async () => (await tools()) !== null)

    ctx.handle('save', async (raw) => {
        const id = Number(raw)
        const video = found.get(id)?.[0]
        if (!video || saving.has(id)) return
        const binaries = await tools()
        if (!binaries) return
        saving.add(id)
        ctx.broadcast('saving', id, null)

        const cookies = await browsing.cookies.get({ url: video.url })
        const headers = [`Referer: ${video.page}`]
        if (cookies.length > 0) headers.push(`Cookie: ${cookies.map((c) => `${c.name}=${c.value}`).join('; ')}`)
        const input = ['-user_agent', browsing.getUserAgent(), '-headers', `${headers.join('\r\n')}\r\n`, '-i', video.url]

        const described = await probe(binaries.ffprobe, input)
        const pictures = (described?.streams ?? []).filter((s) => s.codec_type === 'video')
        const tallest = pictures.sort(
            (a, b) => (b.height ?? 0) - (a.height ?? 0) || Number(b.tags?.variant_bitrate ?? 0) - Number(a.tags?.variant_bitrate ?? 0)
        )[0]
        const sound = (described?.streams ?? []).find((s) => s.codec_type === 'audio')
        const map: string[] = []
        if (tallest) map.push('-map', `0:${tallest.index}`)
        if (sound) map.push('-map', `0:${sound.index}`)
        if (map.length === 0) map.push('-map', '0:v:0?', '-map', '0:a:0?')

        const folder = app.getPath('downloads')
        const base = join(folder, slug(video.title))
        let output = `${base}.mp4`
        for (let n = 2; await exists(output); n++) output = `${base} (${n}).mp4`

        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-progress', 'pipe:1', '-nostats',
            ...input, ...map, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', output]
        const child = spawn(binaries.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        const duration = described?.duration ?? 0
        let sent = 0
        let tail = ''
        child.stderr.on('data', (chunk: Buffer) => (tail = (tail + chunk.toString()).slice(-2000)))
        child.stdout.on('data', (chunk: Buffer) => {
            const match = /out_time_us=(\d+)/.exec(chunk.toString())
            if (!match || !duration || Date.now() - sent < 250) return
            sent = Date.now()
            ctx.broadcast('saving', id, Math.min(99, Math.floor((Number(match[1]) / 1e6 / duration) * 100)))
        })
        const code = await new Promise<number | null>((resolve) => {
            child.on('error', () => resolve(-1))
            child.on('close', resolve)
        })
        saving.delete(id)
        ctx.broadcast('saved', id, code === 0)
        if (code === 0) {
            ctx.notify({ title: 'Saved', body: output.slice(folder.length + 1), action: { reveal: output } })
        } else {
            await rm(output, { force: true })
            console.error('[browser] saving a video failed:', tail.trim().split('\n').at(-1))
            ctx.notify({ title: 'Not saved', body: slug(video.title) })
        }
    })
}
