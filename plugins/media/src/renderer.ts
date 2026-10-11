import { glyph, injectStyles, tips } from '@dyarchia/sdk'
import type { GlyphName, PluginContext } from '@dyarchia/sdk'
import type { Job, Probe, Ready, Sources, Spec, Tool } from './types.js'

/*
 * The panel's mark, one of a set in black and white and nothing else, each a thing of Sparta:
 * a Laconian bronze mirror, the polished disc a standing figure holds up with both arms, which
 * Spartan workshops made and sent across the Greek world. Solid shapes, so it reads at 18px.
 */
const MEDIA_ICON =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:var(--dya-text)"><path d="M2.3 20.3l1.4 1.4M3 21 13 11"/><path d="M13 11Q16.4 8.6 22.4 7.4L16.6 1.6Q15.4 7.6 13 11Z"/></svg>'

interface ToolInfo {
    id: Tool
    name: string
    icon: GlyphName
    verb: string
    capture?: boolean
}

const TOOLS: ToolInfo[] = [
    { id: 'download', name: 'Download', icon: 'download', verb: 'Download' },
    { id: 'convert', name: 'Convert', icon: 'convert', verb: 'Convert' },
    { id: 'cut', name: 'Cut', icon: 'cut', verb: 'Cut' },
    { id: 'join', name: 'Join', icon: 'join', verb: 'Join' },
    { id: 'extract', name: 'Extract', icon: 'extract', verb: 'Extract' },
    { id: 'compress', name: 'Compress', icon: 'contract', verb: 'Compress' },
    { id: 'gif', name: 'GIF', icon: 'film', verb: 'Make' },
    { id: 'record', name: 'Record', icon: 'record', verb: 'Record', capture: true },
    { id: 'stream', name: 'Stream', icon: 'broadcast', verb: 'Go live', capture: true },
    { id: 'inspect', name: 'Inspect', icon: 'inspect', verb: '' }
]

const STYLES = `
.media {
    display: flex;
    flex-direction: column;
    height: 100%;
}
.media-stage {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-6);
    padding: var(--dya-space-4);
}
.media-unit {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
}
.media-unit > .dya-field,
.media-time {
    width: 96px;
}
.media .dya-form__stack > .dya-key {
    align-self: flex-start;
}
.media-jobs {
    align-self: flex-start;
    max-width: 100%;
}
.media-status {
    width: var(--dya-size-control);
    text-align: center;
}
.media-status > .dya-ring {
    display: block;
}
.media-jobs .dya-table__name {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
`

/*
 * The one panel, so the palette's commands reach it: a tool asked for before it mounts waits here.
 */
let chooseTool: ((tool: Tool) => void) | null = null
let waitingTool: Tool | null = null

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function clock(total: number): string {
    const whole = Math.max(0, Math.round(total))
    const h = Math.floor(whole / 3600)
    const m = Math.floor((whole % 3600) / 60)
    const s = String(whole % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

function bytes(size: number): string {
    if (size >= 1e9) return `${(size / 1e9).toFixed(1)} GB`
    if (size >= 1e6) return `${(size / 1e6).toFixed(1)} MB`
    return `${Math.max(1, Math.round(size / 1e3))} KB`
}

export function activate(ctx: PluginContext): void {
    const ready = ctx.invoke('ready') as Promise<Ready>

    const open = (tool: Tool): void => {
        if (chooseTool) chooseTool(tool)
        else waitingTool = tool
        void ctx.shell.show('media')
    }

    void ready.then((state) => {
        if (!state.ffmpeg) return
        for (const tool of TOOLS) {
            if (tool.capture && !state.capture) continue
            if (tool.id === 'download' && !state.ytdlp) continue
            ctx.registerCommand({ id: `media.${tool.id}`, title: tool.name, icon: MEDIA_ICON, run: () => open(tool.id) })
        }
    })

    ctx.registerPanel({ id: 'media', title: 'Media', icon: MEDIA_ICON }, (container, handle) => {
        injectStyles(ctx.pluginId, STYLES)

        const root = el('div', 'media dya-pane')
        const stage = el('div', 'media-stage')
        const body = el('div')
        const jobsHolder = el('div')
        const tipHolder = el('div')
        const withTip = tips(tipHolder)
        stage.append(body, jobsHolder)
        root.append(stage, tipHolder)
        container.append(root)

        let state: Ready = { ffmpeg: false, ytdlp: false, capture: false, codecs: [] }
        let jobs: Job[] = []
        let disposed = false
        let sources: Promise<Sources> | null = null
        let watching: number | null = null
        let ticker: number | null = null

        function key(icon: GlyphName, label: string, act: () => void, tip = true): HTMLButtonElement {
            const button = el('button', 'dya-key')
            button.type = 'button'
            button.innerHTML = glyph(icon)
            button.setAttribute('aria-label', label)
            if (tip) withTip(button, label)
            button.addEventListener('click', act)
            return button
        }

        /*
         * An open tool closes with its X or with Escape, back to the tools.
         */
        const back = key('close', 'Close', () => show(null))
        handle.toolbar.append(back)
        root.tabIndex = -1
        root.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || event.defaultPrevented || back.hidden) return
            event.preventDefault()
            if (event.target instanceof HTMLElement && event.target.matches('textarea, input')) root.focus({ preventScroll: true })
            else show(null)
        })

        function fail(error: unknown): void {
            const line = body.querySelector('.media-failure')
            const message = error instanceof Error ? error.message : String(error)
            if (line) line.textContent = message
        }

        function select(label: string, values: [string, string][], chosen?: string): HTMLSelectElement & { wrap: HTMLElement } {
            const wrap = el('span', 'dya-select')
            const control = el('select', 'dya-field') as HTMLSelectElement & { wrap: HTMLElement }
            control.setAttribute('aria-label', label)
            const shown = el('button')
            shown.type = 'button'
            shown.append(document.createElement('selectedcontent'))
            control.append(shown)
            for (const [value, text] of values) {
                const option = el('option', undefined, text)
                option.value = value
                option.selected = value === chosen
                control.append(option)
            }
            wrap.append(control)
            control.wrap = wrap
            return control
        }

        function text(label: string, placeholder = '', type = 'text'): HTMLInputElement {
            const input = el('input', 'dya-field')
            input.type = type
            input.placeholder = placeholder
            input.spellcheck = false
            input.setAttribute('aria-label', label)
            return input
        }

        function unit(input: HTMLInputElement, word: string): HTMLElement {
            const row = el('span', 'media-unit')
            row.append(input, el('span', 'dya-meta', word))
            return row
        }

        /*
         * The file a tool works on: the path in a field with the browse key joined to it, and what
         * the file is, once it is known, as pills under it. A tool that wants its length asks for
         * the probe this keeps.
         */
        function fileField(onProbe: (media: Probe | null) => void): { node: HTMLElement; path: () => string; media: () => Probe | null } {
            const node = el('div', 'dya-form__stack')
            const row = el('div', 'dya-join')
            const field = el('input', 'dya-field dya-mono')
            field.readOnly = true
            field.setAttribute('aria-label', 'File')
            const pills = el('div', 'dya-pills')
            pills.hidden = true
            let probed: Probe | null = null
            const browse = key('folder', 'Browse', () => {
                void (ctx.invoke('pick', false) as Promise<string[]>).then(async (paths) => {
                    if (!paths[0]) return
                    field.value = paths[0]
                    probed = null
                    pills.hidden = true
                    try {
                        probed = (await ctx.invoke('probe', paths[0])) as Probe
                        pills.replaceChildren(...describe(probed).map((word) => el('span', 'dya-tag', word)))
                        pills.hidden = false
                    } catch (error) {
                        fail(error)
                    }
                    onProbe(probed)
                })
            })
            row.append(field, browse)
            node.append(row, pills)
            return { node, path: () => field.value, media: () => probed }
        }

        function describe(media: Probe): string[] {
            const video = media.tracks.find((track) => track.type === 'video')
            const audio = media.tracks.find((track) => track.type === 'audio')
            return [
                media.duration ? clock(media.duration) : '',
                media.width ? `${media.width}×${media.height}` : '',
                video?.codec ?? '',
                audio?.codec ?? '',
                media.size ? bytes(media.size) : ''
            ].filter(Boolean)
        }

        /*
         * Every tool is one form: what it is called on the left, the value on the right, the one
         * primary under it, and a line for what went wrong, which stays empty until something does.
         */
        function form(tool: ToolInfo, rows: [string, HTMLElement][], spec: () => Spec | null, live = false): HTMLElement {
            const node = el('div', 'dya-form')
            for (const [label, value] of rows) {
                const name = el('span', 'dya-label', label)
                node.append(name, value)
                if (value.hidden) name.hidden = true
                new MutationObserver(() => (name.hidden = value.hidden)).observe(value, { attributes: true, attributeFilter: ['hidden'] })
            }
            const failure = el('span', 'dya-text dya-text--danger media-failure')
            if (tool.verb) {
                const actions = el('div', 'dya-form__actions')
                const go = el('button', 'dya-button dya-button--primary', tool.verb)
                go.type = 'button'
                go.addEventListener('click', () => {
                    failure.textContent = ''
                    if (live && watching !== null) {
                        void ctx.invoke('stop', watching)
                        return
                    }
                    const wanted = spec()
                    if (!wanted) return
                    go.disabled = true
                    void (ctx.invoke('start', wanted) as Promise<number>)
                        .then((id) => {
                            if (live) {
                                watching = id
                                go.textContent = 'Stop'
                            }
                        })
                        .catch(fail)
                        .finally(() => (go.disabled = false))
                })
                if (live) {
                    liveKey = { go, verb: tool.verb }
                    const running = jobs.find((job) => job.tool === tool.id && job.state === 'running')
                    if (running) {
                        watching = running.id
                        go.textContent = 'Stop'
                    }
                }
                actions.append(go)
                node.append(actions)
            }
            node.append(failure)
            return node
        }

        let liveKey: { go: HTMLButtonElement; verb: string } | null = null

        function needFile(file: { path: () => string }): string | null {
            if (file.path()) return file.path()
            fail(new Error('No file'))
            return null
        }

        function buildConvert(tool: ToolInfo): HTMLElement {
            const file = fileField(() => undefined)
            const format = select('Format', [
                ['mp4', 'MP4'], ['webm', 'WebM'], ['mkv', 'MKV'], ['mov', 'MOV'],
                ['mp3', 'MP3'], ['m4a', 'M4A'], ['flac', 'FLAC'], ['wav', 'WAV'], ['ogg', 'OGG']
            ], 'mp4')
            return form(tool, [['File', file.node], ['Format', format.wrap]], () => {
                const path = needFile(file)
                return path ? { tool: tool.id, inputs: [path], options: { format: format.value } } : null
            })
        }

        function buildCut(tool: ToolInfo): HTMLElement {
            const start = text('Start', '0:00')
            const end = text('End', '')
            start.classList.add('media-time')
            end.classList.add('media-time')
            const exact = el('input', 'dya-checkbox')
            exact.type = 'checkbox'
            exact.setAttribute('aria-label', 'Exact')
            const file = fileField((media) => (end.placeholder = media?.duration ? clock(media.duration) : ''))
            return form(tool, [['File', file.node], ['Start', start], ['End', end], ['Exact', exact]], () => {
                const path = needFile(file)
                return path
                    ? { tool: tool.id, inputs: [path], options: { start: start.value, end: end.value, exact: exact.checked ? '1' : '' } }
                    : null
            })
        }

        function buildJoin(tool: ToolInfo): HTMLElement {
            const paths: string[] = []
            const list = el('div', 'dya-files')
            const value = el('div', 'dya-form__stack')
            const add = key('add', 'Add', () => {
                void (ctx.invoke('pick', true) as Promise<string[]>).then((picked) => {
                    paths.push(...picked)
                    paint()
                })
            })
            function paint(): void {
                list.replaceChildren(
                    ...paths.map((path, index) => {
                        const row = el('div', 'dya-file dya-reveals')
                        row.innerHTML = glyph('file')
                        row.append(el('span', 'dya-file__name', path.slice(Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1)))
                        const drop = key('close', 'Remove', () => {
                            paths.splice(index, 1)
                            paint()
                        })
                        drop.classList.add('dya-reveal')
                        row.append(drop)
                        return row
                    })
                )
                list.hidden = paths.length === 0
            }
            paint()
            value.append(list, add)
            return form(tool, [['Files', value]], () => {
                if (paths.length < 2) {
                    fail(new Error('Two files at least'))
                    return null
                }
                return { tool: tool.id, inputs: [...paths], options: {} }
            })
        }

        function buildExtract(tool: ToolInfo): HTMLElement {
            const file = fileField(() => undefined)
            const what = select('What', [['audio', 'Audio'], ['frames', 'Frames'], ['subtitles', 'Subtitles']], 'audio')
            const every = text('Every', '1')
            const everyRow = unit(every, 's')
            everyRow.hidden = true
            what.addEventListener('change', () => (everyRow.hidden = what.value !== 'frames'))
            return form(tool, [['File', file.node], ['What', what.wrap], ['Every', everyRow]], () => {
                const path = needFile(file)
                return path ? { tool: tool.id, inputs: [path], options: { what: what.value, every: every.value } } : null
            })
        }

        function buildCompress(tool: ToolInfo): HTMLElement {
            const file = fileField(() => undefined)
            const size = select('Size', [['0', 'Same'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], '0')
            const codecs: [string, string][] = [['h264', 'H.264']]
            if (state.codecs.includes('libx265')) codecs.push(['h265', 'H.265'])
            if (state.codecs.includes('libsvtav1') || state.codecs.includes('libaom-av1')) codecs.push(['av1', 'AV1'])
            const codec = select('Codec', codecs, 'h264')
            const quality = select('Quality', [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], 'medium')
            return form(tool, [['File', file.node], ['Size', size.wrap], ['Codec', codec.wrap], ['Quality', quality.wrap]], () => {
                const path = needFile(file)
                return path
                    ? { tool: tool.id, inputs: [path], options: { size: size.value, codec: codec.value, quality: quality.value } }
                    : null
            })
        }

        function buildGif(tool: ToolInfo): HTMLElement {
            const file = fileField(() => undefined)
            const what = select('What', [['gif', 'GIF'], ['frame', 'Frame']], 'gif')
            const start = text('Start', '0:00')
            start.classList.add('media-time')
            const length = text('Length', '5')
            const lengthRow = unit(length, 's')
            const width = select('Width', [['320', '320'], ['480', '480'], ['640', '640'], ['800', '800']], '480')
            what.addEventListener('change', () => {
                lengthRow.hidden = what.value !== 'gif'
                width.wrap.hidden = what.value !== 'gif'
            })
            return form(tool, [['File', file.node], ['What', what.wrap], ['Start', start], ['Length', lengthRow], ['Width', width.wrap]], () => {
                const path = needFile(file)
                return path
                    ? { tool: tool.id, inputs: [path], options: { what: what.value, start: start.value, length: length.value, width: width.value } }
                    : null
            })
        }

        function sourcePicker(withFile: boolean, then: (source: ReturnType<typeof select>, audio: ReturnType<typeof select>) => void): void {
            sources ??= ctx.invoke('sources') as Promise<Sources>
            void sources.then((found) => {
                const values: [string, string][] = []
                if (withFile) values.push(['file', 'File'])
                values.push(['window', 'Dyarchia'])
                for (const display of found.screens) values.push([display.id, display.name])
                for (const camera of found.video) values.push([`camera:${camera}`, camera])
                const source = select('Source', values, withFile ? 'file' : 'window')
                const audio = select('Audio', [['', 'None'], ...found.audio.map((mic): [string, string] => [mic, mic])], '')
                then(source, audio)
            }).catch(fail)
        }

        function buildRecord(tool: ToolInfo): HTMLElement {
            const holder = el('div')
            sourcePicker(false, (source, audio) => {
                holder.replaceWith(
                    form(tool, [['Source', source.wrap], ['Audio', audio.wrap]], () => ({
                        tool: tool.id,
                        inputs: [],
                        options: { source: source.value, audio: audio.value }
                    }), true)
                )
            })
            return holder
        }

        function buildStream(tool: ToolInfo): HTMLElement {
            const holder = el('div')
            sourcePicker(true, (source, audio) => {
                const file = fileField(() => undefined)
                const server = text('Server', 'rtmp://')
                const streamKey = text('Key', '', 'password')
                streamKey.autocomplete = 'off'
                const sync = (): void => {
                    file.node.hidden = source.value !== 'file'
                    audio.wrap.hidden = source.value === 'file'
                }
                source.addEventListener('change', sync)
                sync()
                holder.replaceWith(
                    form(tool, [['Source', source.wrap], ['File', file.node], ['Audio', audio.wrap], ['Server', server], ['Key', streamKey]], () => {
                        const path = source.value === 'file' ? needFile(file) : ''
                        if (path === null) return null
                        return {
                            tool: tool.id,
                            inputs: path ? [path] : [],
                            options: { source: source.value, audio: audio.value, server: server.value, key: streamKey.value }
                        }
                    }, true)
                )
            })
            return holder
        }

        function buildInspect(tool: ToolInfo): HTMLElement {
            const node = el('div', 'dya-stack')
            const facts = el('div', 'dya-pills')
            const table = el('table', 'dya-table')
            facts.hidden = true
            table.hidden = true
            const file = fileField((media) => {
                if (!media) return
                facts.replaceChildren(
                    ...[media.format, media.duration ? clock(media.duration) : '', media.size ? bytes(media.size) : '',
                        media.bitrate ? `${Math.round(media.bitrate / 1000)} kb/s` : '']
                        .filter(Boolean)
                        .map((word) => el('span', 'dya-tag', word))
                )
                const head = el('thead')
                const top = el('tr')
                for (const word of ['#', 'Type', 'Codec', 'Detail']) top.append(el('th', undefined, word))
                head.append(top)
                const rows = el('tbody')
                for (const track of media.tracks) {
                    const row = el('tr')
                    row.append(
                        el('td', 'dya-table__num', String(track.index)),
                        el('td', 'dya-table__fit', track.type),
                        el('td', 'dya-table__fit dya-mono', track.codec),
                        el('td', undefined, track.detail)
                    )
                    rows.append(row)
                }
                table.replaceChildren(head, rows)
                facts.hidden = false
                table.hidden = false
            })
            node.append(form(tool, [['File', file.node]], () => null), facts, table)
            return node
        }

        function buildDownload(tool: ToolInfo): HTMLElement {
            const link = text('Link', 'https://')
            link.classList.add('dya-mono')
            const what = select('What', [['video', 'Video'], ['audio', 'Audio']], 'video')
            const quality = select('Quality', [['0', 'Best'], ['2160', '2160p'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], '1080')
            const subs = el('input', 'dya-checkbox')
            subs.type = 'checkbox'
            subs.checked = true
            subs.setAttribute('aria-label', 'Subtitles')
            what.addEventListener('change', () => {
                quality.wrap.hidden = what.value !== 'video'
                subs.hidden = what.value !== 'video'
            })
            return form(tool, [['Link', link], ['What', what.wrap], ['Quality', quality.wrap], ['Subtitles', subs]], () => {
                if (!link.value.trim()) {
                    fail(new Error('No link'))
                    return null
                }
                return { tool: tool.id, inputs: [], options: { url: link.value, what: what.value, quality: quality.value, subs: subs.checked ? '1' : '' } }
            })
        }

        const BUILDERS: Record<Tool, (tool: ToolInfo) => HTMLElement> = {
            download: buildDownload,
            convert: buildConvert,
            cut: buildCut,
            join: buildJoin,
            extract: buildExtract,
            compress: buildCompress,
            gif: buildGif,
            record: buildRecord,
            stream: buildStream,
            inspect: buildInspect
        }

        function show(tool: Tool | null): void {
            if (disposed) return
            liveKey = null
            watching = null
            if (!state.ffmpeg) {
                back.hidden = true
                handle.setTitle(null)
                const empty = el('div', 'dya-empty')
                empty.append(el('span', 'dya-text', 'FFmpeg missing'))
                const actions = el('div', 'dya-empty__actions')
                const setup = el('button', 'dya-button dya-button--primary', 'Setup')
                setup.type = 'button'
                setup.addEventListener('click', () => void ctx.shell.show('settings'))
                actions.append(setup)
                empty.append(actions)
                body.replaceChildren(empty)
                return
            }
            const info = TOOLS.find((entry) => entry.id === tool)
            back.hidden = !info
            handle.setTitle(info ? info.name : null)
            if (!info) {
                const grid = el('div', 'dya-grid')
                for (const entry of TOOLS) {
                    if (entry.capture && !state.capture) continue
                    if (entry.id === 'download' && !state.ytdlp) continue
                    const tile = el('button', 'dya-tile')
                    tile.type = 'button'
                    tile.innerHTML = `<span class="dya-tile__icon">${glyph(entry.icon)}</span>`
                    tile.append(el('span', 'dya-tile__name', entry.name))
                    tile.addEventListener('click', () => show(entry.id))
                    grid.append(tile)
                }
                body.replaceChildren(grid)
                return
            }
            body.replaceChildren(BUILDERS[info.id](info))
        }

        function status(job: Job): HTMLElement {
            if (job.state === 'running') {
                if (job.percent === null) return el('span', 'dya-ring dya-ring--busy')
                const ring = el('span', 'dya-ring dya-ring--current')
                ring.style.setProperty('--dya-ring-n', '20')
                ring.style.setProperty('--dya-ring-done', String(Math.floor(job.percent / 5)))
                return ring
            }
            if (job.state === 'done') return el('span', job.output ? 'dya-light dya-light--success' : 'dya-light dya-light--warning')
            if (job.state === 'failed') return el('span', 'dya-light dya-light--danger')
            return el('span', 'dya-light')
        }

        function progress(job: Job): string {
            if (job.state === 'failed') return job.error ?? 'Failed'
            if (job.state === 'stopped') return 'Stopped'
            if (job.state === 'done' && !job.output) return 'Missing'
            if (job.state === 'running' && job.percent !== null) return `${job.percent}%`
            if (job.state === 'running') return clock((Date.now() - job.started) / 1000)
            return ''
        }

        /*
         * The jobs are one table whose rows are kept and updated in place: a repaint every second
         * would otherwise replace the key under the pointer, and its tip with it. A row's keys are
         * rebuilt only when its job changes state. Stop, open and dismiss are symbols nobody needs
         * named; only the folder says what it does.
         */
        const jobsTable = el('table', 'dya-table media-jobs')
        const jobRows = el('tbody')
        jobsTable.append(jobRows)
        const painted = new Map<number, {
            row: HTMLTableRowElement
            status: HTMLTableCellElement
            name: HTMLTableCellElement
            progress: HTMLTableCellElement
            end: HTMLTableCellElement
            state: string
            percent: number | null
            output: string | undefined
        }>()

        function jobKeys(job: Job): HTMLElement {
            const strip = el('span', 'dya-join')
            if (job.state === 'running') {
                const halt = key('stop', 'Stop', () => void ctx.invoke('stop', job.id), false)
                halt.classList.add('dya-reveal', 'dya-reveal--held')
                strip.append(halt)
                return strip
            }
            if (job.state === 'done' && job.output) {
                const output = job.output
                const still = async (): Promise<boolean> => (await ctx.invoke('present', job.id)) as boolean
                if (ctx.shell.canOpen(output)) {
                    const play = key('play', 'Open', () => void still().then((here) => here && ctx.shell.open({ path: output })), false)
                    play.classList.add('dya-reveal')
                    strip.append(play)
                }
                const folder = key('folder', 'Show', () => void still().then((here) => here && ctx.shell.reveal(output)))
                folder.classList.add('dya-reveal')
                strip.append(folder)
            }
            const dismiss = key('close', 'Dismiss', () => {
                void ctx.invoke('dismiss', job.id).then(() => {
                    jobs = jobs.filter((known) => known.id !== job.id)
                    paintJobs()
                })
            }, false)
            dismiss.classList.add('dya-reveal')
            strip.append(dismiss)
            return strip
        }

        function paintJobs(): void {
            for (const [id, entry] of painted) {
                if (jobs.some((job) => job.id === id)) continue
                entry.row.remove()
                painted.delete(id)
            }
            if (jobs.length === 0) {
                jobsHolder.replaceChildren()
                return
            }
            if (!jobsTable.isConnected) jobsHolder.replaceChildren(jobsTable)
            ;[...jobs].reverse().forEach((job, index) => {
                let entry = painted.get(job.id)
                if (!entry) {
                    const row = el('tr', 'dya-reveals')
                    entry = {
                        row,
                        status: el('td', 'dya-table__fit media-status'),
                        name: el('td', 'dya-table__name dya-mono'),
                        progress: el('td'),
                        end: el('td', 'dya-table__end'),
                        state: '',
                        percent: null,
                        output: undefined
                    }
                    row.append(entry.status, entry.name, entry.progress, entry.end)
                    painted.set(job.id, entry)
                }
                if (entry.state !== job.state || entry.percent !== job.percent || entry.output !== job.output) entry.status.replaceChildren(status(job))
                if (entry.state !== job.state || entry.output !== job.output) entry.end.replaceChildren(jobKeys(job))
                entry.name.textContent = job.name
                entry.progress.textContent = progress(job)
                entry.progress.className = job.state === 'failed' ? 'dya-table__prose dya-text--danger' : 'dya-table__num'
                entry.state = job.state
                entry.percent = job.percent
                entry.output = job.output
                if (jobRows.children[index] !== entry.row) jobRows.insertBefore(entry.row, jobRows.children[index] ?? null)
            })
        }

        function tick(): void {
            const live = jobs.some((job) => job.state === 'running' && job.percent === null)
            if (live && ticker === null) ticker = window.setInterval(paintJobs, 1000)
            if (!live && ticker !== null) {
                window.clearInterval(ticker)
                ticker = null
            }
        }

        const offJob = ctx.on('job', (raw: unknown) => {
            const job = raw as Job
            const at = jobs.findIndex((known) => known.id === job.id)
            if (at === -1) jobs.push(job)
            else jobs[at] = job
            if (job.id === watching && job.state !== 'running' && liveKey) {
                liveKey.go.textContent = liveKey.verb
                watching = null
            }
            paintJobs()
            tick()
        })

        void Promise.all([ready, ctx.invoke('jobs') as Promise<Job[]>]).then(([found, known]) => {
            if (disposed) return
            state = found
            jobs = known
            paintJobs()
            tick()
            const asked = waitingTool
            waitingTool = null
            show(asked)
        })

        chooseTool = (tool) => show(tool)
        back.hidden = true

        return () => {
            disposed = true
            chooseTool = null
            offJob()
            if (ticker !== null) window.clearInterval(ticker)
            container.replaceChildren()
        }
    })
}
