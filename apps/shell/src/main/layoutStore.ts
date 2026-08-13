import { app, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

function layoutPath(): string {
    return join(app.getPath('userData'), 'layout.json')
}

export function registerLayoutStore(): void {
    ipcMain.handle('shell:layout:load', async () => {
        try {
            return JSON.parse(await readFile(layoutPath(), 'utf-8'))
        } catch {
            return null
        }
    })

    ipcMain.handle('shell:layout:save', async (_event, layout: unknown) => {
        const path = layoutPath()
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, JSON.stringify(layout, null, 2), 'utf-8')
    })
}
