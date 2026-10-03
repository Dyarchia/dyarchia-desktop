import { BrowserWindow, dialog, screen } from 'electron'
import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import type { PluginMainContext } from '@dyarchia/sdk'
import type { Job, Probe, Ready, Sources, Spec, Track } from './types.js'

const MEDIA = [
    'mp4', 'mkv', 'mov', 'webm', 'avi', 'wmv', 'flv', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts', 'mts', '3gp',
    'ogv', 'mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus', 'wma', 'ac3', 'dts', 'aiff', 'gif'
]

const AUDIO_FORMATS = new Set(['mp3', 'm4a', 'flac', 'wav', 'ogg'])

const IMAGE_SUBTITLES = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'])

const AUDIO_EXTENSION: Record<string, string> = {
    aac: 'm4a',
    alac: 'm4a',
    mp3: 'mp3',
    opus: 'opus',
    vorbis: 'ogg',
    flac: 'flac'
}

const CRF: Record<string, number[]> = {
    h264: [20, 24, 28],
    h265: [22, 26, 30],
    av1: [28, 34, 40]
}

interface Plan {
    name: string
    args: string[]
    output?: string
    duration: number | null
    live: boolean
    secret?: string
    temporary?: string
}

interface Running {
    job: Job
    child: ChildProcess | null
    plan: Plan
    stopping: boolean
    sent: number
    tail: string
}

function refuse(message: string): Error {
    return Object.assign(new Error(message), { dyarchiaRefusal: true })
}

function executable(name: string): string {
    return process.platform === 'win32' ? `${name}.exe` : name
}

async function exists(path: string): Promise<boolean> {
    return stat(path).then(() => true, () => false)
}

function capture(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        execFile(file, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (_error, stdout, stderr) =>
            resolve({ stdout: String(stdout), stderr: String(stderr) })
        )
    })
}

function seconds(text: string | undefined): number | null {
    const value = text?.trim()
    if (!value) return null
    const parts = value.split(':').map(Number)
    if (parts.length > 3 || parts.some((part) => Number.isNaN(part) || part < 0)) throw refuse('Bad time')
    return parts.reduce((total, part) => total * 60 + part, 0)
}

function rate(fraction: string | undefined): number {
    const [top, bottom] = (fraction ?? '0/1').split('/').map(Number)
    return bottom ? Math.round((top / bottom) * 100) / 100 : 0
}

function even(value: number): number {
    return Math.max(2, Math.floor(value / 2) * 2)
}

/*
 * Where an output goes: beside what it was made from, under the input's name with what was done
 * to it, and never over a file that is already there, which takes the first free counter instead.
 */
const claimed = new Set<string>()

async function beside(input: string, suffix: string, extension: string): Promise<string> {
    const base = join(dirname(input), basename(input, extname(input)) + suffix)
    let candidate = `${base}.${extension}`
    for (let n = 2; claimed.has(candidate) || (await exists(candidate)); n++) candidate = `${base}-${n}.${extension}`
    claimed.add(candidate)
    return candidate
}

async function freeFolder(path: string): Promise<string> {
    let candidate = path
    for (let n = 2; await exists(candidate); n++) candidate = `${path}-${n}`
    await mkdir(candidate, { recursive: true })
    return candidate
}

function stamp(): string {
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

export function activate(ctx: PluginMainContext): void {
    const jobs = new Map<number, Running>()
    let nextId = 1
    let encoders: Promise<string[]> | null = null

    async function ffmpeg(): Promise<string> {
        const found = await ctx.binary('ffmpeg')
        if (!found) throw refuse('FFmpeg missing')
        return found
    }

    async function ffprobe(): Promise<string> {
        const sibling = join(dirname(await ffmpeg()), executable('ffprobe'))
        if (await exists(sibling)) return sibling
        const found = await ctx.binary('ffprobe')
        if (!found) throw refuse('FFprobe missing')
        return found
    }

    function codecs(): Promise<string[]> {
        encoders ??= ffmpeg().then(async (binary) => {
            const { stdout } = await capture(binary, ['-hide_banner', '-encoders'])
            return stdout
                .split('\n')
                .map((line) => /^\s[VAS][\w.]{5}\s+(\S+)/.exec(line)?.[1])
                .filter((name): name is string => Boolean(name))
        })
        return encoders
    }

    async function probe(path: string): Promise<Probe> {
        const { stdout } = await capture(await ffprobe(), [
            '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path
        ])
        let parsed: {
            format?: { duration?: string; format_long_name?: string; format_name?: string; size?: string; bit_rate?: string }
            streams?: Record<string, unknown>[]
        }
        try {
            parsed = JSON.parse(stdout)
        } catch {
            throw refuse('Not media')
        }
        if (!parsed.format) throw refuse('Not media')
        let width = 0
        let height = 0
        const tracks: Track[] = (parsed.streams ?? []).map((stream) => {
            const type = String(stream['codec_type'] ?? 'data')
            const tags = (stream['tags'] ?? {}) as Record<string, string>
            const language = tags['language'] && tags['language'] !== 'und' ? tags['language'] : ''
            const parts: string[] = []
            if (type === 'video') {
                const w = Number(stream['width'] ?? 0)
                const h = Number(stream['height'] ?? 0)
                if (!width && w) {
                    width = w
                    height = h
                }
                if (w) parts.push(`${w}×${h}`)
                const fps = rate(String(stream['avg_frame_rate'] ?? stream['r_frame_rate'] ?? ''))
                if (fps) parts.push(`${fps} fps`)
            } else if (type === 'audio') {
                const hz = Number(stream['sample_rate'] ?? 0)
                if (hz) parts.push(`${Math.round(hz / 100) / 10} kHz`)
                const channels = Number(stream['channels'] ?? 0)
                if (channels) parts.push(`${channels} ch`)
            }
            if (language) parts.push(language)
            return {
                index: Number(stream['index'] ?? 0),
                type,
                codec: String(stream['codec_name'] ?? '?'),
                detail: parts.join(' - ')
            }
        })
        return {
            path,
            name: basename(path),
            duration: Number(parsed.format.duration ?? 0),
            format: parsed.format.format_long_name ?? parsed.format.format_name ?? '',
            size: Number(parsed.format.size ?? 0),
            bitrate: Number(parsed.format.bit_rate ?? 0),
            width,
            height,
            tracks
        }
    }

    const first = (media: Probe, type: string): Track | undefined =>
        media.tracks.find((track) => track.type === type && !(type === 'video' && track.codec === 'mjpeg' && media.tracks.length > 1))

    async function devices(): Promise<{ video: string[]; audio: string[] }> {
        if (process.platform !== 'win32') return { video: [], audio: [] }
        const { stderr } = await capture(await ffmpeg(), [
            '-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'
        ])
        const video: string[] = []
        const audio: string[] = []
        for (const match of stderr.matchAll(/"([^"]+)" \(([^)]+)\)/g)) {
            if (match[2].includes('video')) video.push(match[1])
            if (match[2].includes('audio')) audio.push(match[1])
        }
        return { video, audio }
    }

    /*
     * A region of the desktop in the pixels gdigrab counts in: physical ones, so a display at 150%
     * is asked for at its real size, and a maximised window's invisible border is cut back to the
     * display it stands on.
     */
    function physical(source: string): { x: number; y: number; w: number; h: number } {
        const displays = screen.getAllDisplays()
        if (source === 'window') {
            const window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible())
            if (!window) throw refuse('No window')
            const bounds = screen.dipToScreenRect(window, window.getBounds())
            const display = screen.dipToScreenRect(null, screen.getDisplayMatching(window.getBounds()).bounds)
            const x = Math.max(bounds.x, display.x)
            const y = Math.max(bounds.y, display.y)
            const right = Math.min(bounds.x + bounds.width, display.x + display.width)
            const bottom = Math.min(bounds.y + bounds.height, display.y + display.height)
            return { x, y, w: even(right - x), h: even(bottom - y) }
        }
        const display = displays.find((d) => `screen:${d.id}` === source) ?? screen.getPrimaryDisplay()
        const rect = screen.dipToScreenRect(null, display.bounds)
        return { x: rect.x, y: rect.y, w: even(rect.width), h: even(rect.height) }
    }

    function videoInput(source: string): string[] {
        if (process.platform !== 'win32') throw refuse('Windows only')
        if (source.startsWith('camera:')) {
            return ['-thread_queue_size', '1024', '-f', 'dshow', '-rtbufsize', '256M', '-i', `video=${source.slice(7)}`]
        }
        const area = physical(source)
        return [
            '-thread_queue_size', '1024', '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '1',
            '-offset_x', String(area.x), '-offset_y', String(area.y), '-video_size', `${area.w}x${area.h}`,
            '-i', 'desktop'
        ]
    }

    function micInput(name: string): string[] {
        return ['-thread_queue_size', '1024', '-f', 'dshow', '-i', `audio=${name}`]
    }

    const EVEN = ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p']

    async function plan(spec: Spec): Promise<Plan> {
        const options = spec.options
        const input = spec.inputs[0]
        const needInput = (): Promise<Probe> => {
            if (!input) throw refuse('No file')
            return probe(input)
        }

        if (spec.tool === 'convert') {
            const media = await needInput()
            const format = options['format'] || 'mp4'
            const video = first(media, 'video')?.codec
            const audio = first(media, 'audio')?.codec
            const sameExtension = extname(input).slice(1).toLowerCase() === format
            const output = await beside(input, sameExtension ? '-converted' : '', format)
            const args = ['-i', input]
            if (AUDIO_FORMATS.has(format)) {
                if (!audio) throw refuse('No audio')
                args.push('-vn', '-map', '0:a:0')
                if (format === 'mp3') args.push('-c:a', audio === 'mp3' ? 'copy' : 'libmp3lame', '-q:a', '2')
                if (format === 'm4a') args.push('-c:a', audio === 'aac' || audio === 'alac' ? 'copy' : 'aac', '-b:a', '192k')
                if (format === 'flac') args.push('-c:a', 'flac')
                if (format === 'wav') args.push('-c:a', 'pcm_s16le')
                if (format === 'ogg') args.push('-c:a', audio === 'opus' || audio === 'vorbis' ? 'copy' : 'libopus', '-b:a', '160k')
            } else if (format === 'mkv') {
                args.push('-map', '0', '-c', 'copy')
            } else if (format === 'webm') {
                args.push('-map', '0:v:0?', '-map', '0:a:0?')
                args.push('-c:v', ['vp8', 'vp9', 'av1'].includes(video ?? '') ? 'copy' : 'libvpx-vp9')
                if (!['vp8', 'vp9', 'av1'].includes(video ?? '')) args.push('-crf', '32', '-b:v', '0', '-row-mt', '1')
                args.push('-c:a', audio === 'opus' || audio === 'vorbis' ? 'copy' : 'libopus', '-b:a', '128k')
            } else {
                args.push('-map', '0:v:0?', '-map', '0:a:0?')
                if (['h264', 'hevc', 'av1'].includes(video ?? '')) {
                    args.push('-c:v', 'copy')
                    if (video === 'hevc') args.push('-tag:v', 'hvc1')
                } else {
                    args.push('-c:v', 'libx264', '-crf', '20', '-preset', 'medium', ...EVEN)
                }
                args.push('-c:a', ['aac', 'mp3', 'alac'].includes(audio ?? '') ? 'copy' : 'aac', '-b:a', '192k')
                args.push('-movflags', '+faststart')
            }
            args.push(output)
            return { name: basename(output), args, output, duration: media.duration, live: false }
        }

        if (spec.tool === 'cut') {
            const media = await needInput()
            const start = seconds(options['start']) ?? 0
            const end = seconds(options['end']) ?? media.duration
            if (end <= start) throw refuse('End before start')
            const length = end - start
            const extension = extname(input).slice(1).toLowerCase() || 'mp4'
            const exact = options['exact'] === '1' && Boolean(first(media, 'video'))
            const container = exact && !['mp4', 'mkv', 'mov'].includes(extension) ? 'mp4' : extension
            const output = await beside(input, '-cut', container)
            const args = ['-ss', String(start), '-i', input, '-t', String(length)]
            if (exact) {
                args.push('-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
                    ...EVEN, '-c:a', 'aac', '-b:a', '192k')
            } else {
                args.push('-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero')
            }
            args.push(output)
            return { name: basename(output), args, output, duration: length, live: false }
        }

        if (spec.tool === 'join') {
            if (spec.inputs.length < 2) throw refuse('Two files at least')
            const media = await Promise.all(spec.inputs.map(probe))
            const duration = media.reduce((total, item) => total + item.duration, 0)
            const shape = (item: Probe): string => {
                const video = first(item, 'video')
                const audio = first(item, 'audio')
                return `${video?.codec}:${item.width}x${item.height}:${audio?.codec}`
            }
            const same = media.every((item) => shape(item) === shape(media[0]))
            const anyVideo = media.some((item) => first(item, 'video'))
            const extension = extname(input).slice(1).toLowerCase() || 'mp4'
            if (same) {
                const list = join(tmpdir(), `dyarchia-forge-${process.pid}-${nextId}.txt`)
                await writeFile(list, spec.inputs.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
                const output = await beside(input, '-joined', extension)
                return {
                    name: basename(output),
                    args: ['-f', 'concat', '-safe', '0', '-i', list, '-map', '0', '-c', 'copy', output],
                    output,
                    duration,
                    live: false,
                    temporary: list
                }
            }
            const allAudio = media.every((item) => first(item, 'audio'))
            const args: string[] = []
            for (const path of spec.inputs) args.push('-i', path)
            const chains: string[] = []
            const pads: string[] = []
            const width = even(media.find((item) => item.width)?.width ?? 1280)
            const height = even(media.find((item) => item.height)?.height ?? 720)
            media.forEach((item, i) => {
                if (anyVideo) {
                    if (!first(item, 'video')) throw refuse('Mixed audio and video')
                    chains.push(`[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`)
                    pads.push(`[v${i}]`)
                }
                if (allAudio) {
                    chains.push(`[${i}:a:0]aresample=48000,aformat=channel_layouts=stereo[a${i}]`)
                    pads.push(`[a${i}]`)
                }
            })
            const outputs = `${anyVideo ? '[v]' : ''}${allAudio ? '[a]' : ''}`
            chains.push(`${pads.join('')}concat=n=${media.length}:v=${anyVideo ? 1 : 0}:a=${allAudio ? 1 : 0}${outputs}`)
            args.push('-filter_complex', chains.join(';'))
            if (anyVideo) args.push('-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium')
            if (allAudio) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k')
            const output = await beside(input, '-joined', anyVideo ? 'mp4' : 'm4a')
            args.push('-movflags', '+faststart', output)
            return { name: basename(output), args, output, duration, live: false }
        }

        if (spec.tool === 'extract') {
            const media = await needInput()
            const what = options['what'] || 'audio'
            if (what === 'audio') {
                const audio = first(media, 'audio')?.codec
                if (!audio) throw refuse('No audio')
                const keep = AUDIO_EXTENSION[audio] ?? (audio.startsWith('pcm_') ? 'wav' : undefined)
                const output = await beside(input, '-audio', keep ?? 'mp3')
                const codec = keep ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-q:a', '2']
                return {
                    name: basename(output),
                    args: ['-i', input, '-vn', '-map', '0:a:0', ...codec, output],
                    output,
                    duration: media.duration,
                    live: false
                }
            }
            if (what === 'frames') {
                if (!first(media, 'video')) throw refuse('No video')
                const every = Number(options['every'] || '1')
                if (!(every > 0)) throw refuse('Bad interval')
                const folder = await freeFolder(join(dirname(input), `${basename(input, extname(input))}-frames`))
                return {
                    name: basename(folder),
                    args: ['-i', input, '-vf', `fps=1/${every}`, '-q:v', '2', join(folder, '%05d.jpg')],
                    output: folder,
                    duration: media.duration,
                    live: false
                }
            }
            const subtitle = first(media, 'subtitle')
            if (!subtitle) throw refuse('No subtitles')
            if (IMAGE_SUBTITLES.has(subtitle.codec)) throw refuse('Image subtitles')
            const output = await beside(input, '', 'srt')
            return {
                name: basename(output),
                args: ['-i', input, '-map', '0:s:0', '-c:s', 'srt', output],
                output,
                duration: media.duration,
                live: false
            }
        }

        if (spec.tool === 'compress') {
            const media = await needInput()
            if (!first(media, 'video')) throw refuse('No video')
            const codec = options['codec'] || 'h264'
            const quality = ['high', 'medium', 'low'].indexOf(options['quality'] || 'medium')
            const available = await codecs()
            const encoder =
                codec === 'h265' ? 'libx265'
                : codec === 'av1' ? (available.includes('libsvtav1') ? 'libsvtav1' : 'libaom-av1')
                : 'libx264'
            if (!available.includes(encoder)) throw refuse(`No ${encoder}`)
            const args = ['-i', input, '-map', '0:v:0', '-map', '0:a?', '-c:v', encoder, '-crf', String(CRF[codec][Math.max(0, quality)])]
            if (encoder === 'libsvtav1') args.push('-preset', '8')
            else if (encoder === 'libaom-av1') args.push('-cpu-used', '6', '-row-mt', '1')
            else args.push('-preset', 'medium')
            if (codec === 'h265') args.push('-tag:v', 'hvc1')
            const size = Number(options['size'] || '0')
            const scale = size && media.height > size ? `scale=-2:${size}` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
            args.push('-vf', scale, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart')
            const output = await beside(input, '-small', 'mp4')
            args.push(output)
            return { name: basename(output), args, output, duration: media.duration, live: false }
        }

        if (spec.tool === 'gif') {
            const media = await needInput()
            if (!first(media, 'video')) throw refuse('No video')
            const start = seconds(options['start']) ?? 0
            if (options['what'] === 'frame') {
                const output = await beside(input, '-frame', 'jpg')
                return {
                    name: basename(output),
                    args: ['-ss', String(start), '-i', input, '-frames:v', '1', '-q:v', '2', output],
                    output,
                    duration: null,
                    live: false
                }
            }
            const length = seconds(options['length']) ?? 5
            if (!(length > 0)) throw refuse('Bad length')
            const width = Math.min(Number(options['width'] || '480'), media.width || 480)
            const output = await beside(input, '', 'gif')
            const filter = `fps=12,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`
            return {
                name: basename(output),
                args: ['-ss', String(start), '-t', String(length), '-i', input, '-filter_complex', filter, '-loop', '0', output],
                output,
                duration: length,
                live: false
            }
        }

        if (spec.tool === 'record') {
            const source = options['source'] || 'window'
            const mic = options['audio'] || ''
            const folder = join(ctx.dataHome, 'forge')
            await mkdir(folder, { recursive: true })
            const output = await beside(join(folder, `recording-${stamp()}.mp4`), '', 'mp4')
            const args = [...videoInput(source)]
            if (mic) args.push(...micInput(mic))
            args.push('-map', '0:v')
            if (mic) args.push('-map', '1:a', '-c:a', 'aac', '-b:a', '160k')
            args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', ...EVEN,
                '-movflags', '+frag_keyframe+empty_moov+default_base_moof', output)
            return { name: basename(output), args, output, duration: null, live: true }
        }

        if (spec.tool === 'stream') {
            const server = (options['server'] ?? '').trim().replace(/\/+$/, '')
            const key = (options['key'] ?? '').trim()
            if (!/^rtmps?:\/\//i.test(server)) throw refuse('rtmp:// or rtmps://')
            const source = options['source'] || 'file'
            const mic = options['audio'] || ''
            const args: string[] = []
            let duration: number | null = null
            let audioAt = -1
            if (source === 'file') {
                const media = await needInput()
                if (!first(media, 'video')) throw refuse('No video')
                duration = media.duration
                args.push('-re', '-i', input)
                if (first(media, 'audio')) audioAt = 0
            } else {
                args.push(...videoInput(source))
            }
            if (audioAt < 0 && mic) {
                args.push(...micInput(mic))
                audioAt = 1
            }
            if (audioAt < 0) {
                args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
                audioAt = 1
            }
            args.push('-map', '0:v:0', '-map', `${audioAt}:a:0`,
                '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '4500k', '-maxrate', '4500k', '-bufsize', '9000k',
                '-g', '60', ...EVEN, '-c:a', 'aac', '-b:a', '160k', '-ar', '44100',
                '-f', 'flv', key ? `${server}/${key}` : server)
            return { name: new URL(server.replace(/^rtmps?/i, 'http')).host, args, duration, live: true, secret: key || undefined }
        }

        throw refuse('Unknown tool')
    }

    function send(running: Running, force = false): void {
        const now = Date.now()
        if (!force && now - running.sent < 250) return
        running.sent = now
        ctx.broadcast('job', running.job)
    }

    function reason(running: Running): string {
        let lines = running.tail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        if (running.plan.secret) lines = lines.map((line) => line.split(running.plan.secret!).join('•••'))
        const said = lines.join('\n')
        if (/Connection refused|Error number -138|-10061|Connection timed out|Network is unreachable/i.test(said)) return 'Unreachable'
        if (/Input\/output error|I\/O error/i.test(said) && running.plan.live) return 'Connection lost'
        if (/No such file|does not exist/i.test(said)) return 'Not found'
        if (/Permission denied|Access is denied/i.test(said)) return 'No access'
        if (/Could not find video device|Could not enumerate/i.test(said)) return 'Device busy'
        const last = lines.at(-1) ?? 'Failed'
        return last.replace(/^\[[^\]]+\]\s*/, '').slice(0, 160)
    }

    async function finish(running: Running, code: number | null): Promise<void> {
        const { job, plan } = running
        if (job.state !== 'running') return
        if (plan.temporary) await rm(plan.temporary, { force: true })
        const made = plan.output ? await exists(plan.output) : false
        if (running.stopping) {
            if (plan.live) {
                job.state = plan.output && !made ? 'failed' : 'done'
            } else {
                job.state = 'stopped'
                if (plan.output && made) await rm(plan.output, { recursive: true, force: true })
                job.output = undefined
            }
        } else if (code === 0) {
            job.state = 'done'
            job.percent = 100
        } else {
            job.state = 'failed'
            job.error = reason(running)
            if (plan.output && made && !plan.live) await rm(plan.output, { recursive: true, force: true })
            if (!plan.live) job.output = undefined
        }
        job.ended = Date.now()
        running.child = null
        send(running, true)
    }

    async function start(spec: Spec): Promise<number> {
        const binary = await ffmpeg()
        const built = await plan(spec)
        const id = nextId++
        const job: Job = {
            id,
            tool: spec.tool,
            name: built.name,
            state: 'running',
            percent: built.duration ? 0 : null,
            started: Date.now(),
            output: built.output
        }
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-nostats']
        if (!built.live) args.push('-nostdin')
        args.push(...built.args)
        const child = spawn(binary, args, {
            windowsHide: true,
            stdio: [built.live ? 'pipe' : 'ignore', 'pipe', 'pipe']
        })
        const running: Running = { job, child, plan: built, stopping: false, sent: 0, tail: '' }
        jobs.set(id, running)
        let buffer = ''
        child.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) {
                const [key, value] = line.trim().split('=')
                if ((key === 'out_time_us' || key === 'out_time_ms') && built.duration) {
                    const done = Number(value) / 1e6
                    if (Number.isFinite(done) && done >= 0) {
                        job.percent = Math.min(99, Math.floor((done / built.duration) * 100))
                        send(running)
                    }
                }
            }
        })
        child.stderr?.on('data', (chunk: Buffer) => {
            running.tail = (running.tail + chunk.toString()).slice(-4000)
        })
        child.on('error', (error) => {
            running.tail += `\n${error.message}`
            void finish(running, -1)
        })
        child.on('close', (code) => void finish(running, code))
        send(running, true)
        return id
    }

    function stop(id: number): void {
        const running = jobs.get(id)
        if (!running?.child || running.job.state !== 'running') return
        running.stopping = true
        if (running.plan.live && running.child.stdin?.writable) {
            running.child.stdin.write('q')
            const child = running.child
            setTimeout(() => {
                if (running.child === child) child.kill()
            }, 5000)
        } else {
            running.child.kill()
        }
    }

    ctx.handle('ready', async (): Promise<Ready> => {
        const found = await ctx.binary('ffmpeg')
        return {
            ffmpeg: found !== null,
            capture: process.platform === 'win32',
            codecs: found ? await codecs() : []
        }
    })

    ctx.handle('pick', async (multiple) => {
        const options = {
            title: 'Media',
            properties: multiple ? (['openFile', 'multiSelections'] as const) : (['openFile'] as const),
            filters: [
                { name: 'Media', extensions: MEDIA },
                { name: 'All files', extensions: ['*'] }
            ]
        }
        const parent = BrowserWindow.getFocusedWindow()
        const result = parent
            ? await dialog.showOpenDialog(parent, { ...options, properties: [...options.properties] })
            : await dialog.showOpenDialog({ ...options, properties: [...options.properties] })
        return result.canceled ? [] : result.filePaths
    })

    ctx.handle('probe', (path) => probe(String(path)))

    ctx.handle('sources', async (): Promise<Sources> => {
        const { video, audio } = await devices()
        const screens = screen.getAllDisplays().map((display, i) => ({
            id: `screen:${display.id}`,
            name: `Screen ${i + 1}`
        }))
        return { screens, video, audio }
    })

    ctx.handle('start', (spec) => start(spec as Spec))
    ctx.handle('stop', (id) => stop(Number(id)))
    ctx.handle('jobs', () => [...jobs.values()].map((running) => running.job))
    ctx.handle('dismiss', (id) => {
        if (jobs.get(Number(id))?.job.state !== 'running') jobs.delete(Number(id))
    })
}
