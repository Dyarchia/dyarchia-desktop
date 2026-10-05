import { app, BrowserWindow, ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const THEME_ID = /^[a-z0-9-]{1,40}$/
const COLOUR = /^#[0-9a-f]{6}$/i

interface Stored {
    id: string | null
    ground: string | null
}

function themePath(): string {
    return join(app.getPath('userData'), 'theme.json')
}

/*
 * The theme is read synchronously because the window is created with its ground as the
 * background, before any page exists to say which theme it is. The renderer reports that ground
 * with each choice, so the colour shown while the window loads is the chosen theme's own.
 */
function read(): Stored {
    try {
        const parsed = JSON.parse(readFileSync(themePath(), 'utf-8')) as Record<string, unknown>
        const id = typeof parsed['id'] === 'string' && THEME_ID.test(parsed['id']) ? parsed['id'] : null
        const ground = typeof parsed['ground'] === 'string' && COLOUR.test(parsed['ground']) ? parsed['ground'] : null
        return { id, ground }
    } catch {
        return { id: null, ground: null }
    }
}

export function themeGround(fallback: string): string {
    return read().ground ?? fallback
}

export function registerTheme(): void {
    ipcMain.handle('shell:theme:get', () => read().id)
    ipcMain.handle('shell:theme:set', async (event, id: unknown, ground: unknown) => {
        if (typeof id !== 'string' || !THEME_ID.test(id)) return
        const colour = typeof ground === 'string' && COLOUR.test(ground) ? ground : null
        const path = themePath()
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, JSON.stringify({ id, ground: colour }, null, 2), 'utf-8')
        if (colour) BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(colour)
    })
}
