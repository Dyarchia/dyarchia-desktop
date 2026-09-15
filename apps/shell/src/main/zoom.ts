import { app, BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const STEP = 0.5
const MIN = -3
const MAX = 3
const SAVE_DELAY_MS = 300

const ZOOM_IN = new Set(['=', '+'])
const ZOOM_OUT = new Set(['-', '_'])

function zoomPath(): string {
    return join(app.getPath('userData'), 'zoom.json')
}

async function load(): Promise<number> {
    try {
        const parsed = JSON.parse(await readFile(zoomPath(), 'utf-8')) as { level?: unknown }
        return typeof parsed.level === 'number' ? clamp(parsed.level) : 0
    } catch {
        return 0
    }
}

async function save(level: number): Promise<void> {
    const path = zoomPath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify({ level }, null, 2), 'utf-8')
}

function clamp(level: number): number {
    return Math.min(MAX, Math.max(MIN, Math.round(level / STEP) * STEP))
}

function direction(input: Electron.Input): number | null {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return null
    if (ZOOM_IN.has(input.key) || input.code === 'NumpadAdd') return 1
    if (ZOOM_OUT.has(input.key) || input.code === 'NumpadSubtract') return -1
    if (input.key === '0' || input.code === 'Numpad0') return 0
    return null
}

/*
 * The application menu is null, so Chromium's own zoom accelerators never fire and every
 * shortcut has to be caught before the page sees it. The level is the shell's, not the
 * page's: it is stored beside the layout and reapplied on every load, so it survives a
 * restart and a dev reload alike, regardless of which origin the renderer came from.
 */
export function registerZoom(win: BrowserWindow): void {
    const contents = win.webContents
    let level = 0
    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const apply = (next: number): void => {
        level = clamp(next)
        contents.setZoomLevel(level)
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => void save(level), SAVE_DELAY_MS)
    }

    void load().then((stored) => {
        level = stored
        contents.setZoomLevel(level)
    })

    contents.on('did-finish-load', () => contents.setZoomLevel(level))

    contents.on('before-input-event', (event, input) => {
        const step = direction(input)
        if (step === null) return
        event.preventDefault()
        apply(step === 0 ? 0 : level + step * STEP)
    })

    contents.on('zoom-changed', (event, zoomDirection) => {
        event.preventDefault()
        apply(level + (zoomDirection === 'in' ? STEP : -STEP))
    })
}
