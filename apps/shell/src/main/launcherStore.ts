import { app, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { workspaceHome } from './paths'

function launcherPath(): string {
    return join(workspaceHome() ?? app.getPath('userData'), 'launcher.json')
}

export function registerLauncherStore(): void {
    ipcMain.handle('shell:launcher:load', async () => {
        try {
            return JSON.parse(await readFile(launcherPath(), 'utf-8'))
        } catch {
            return null
        }
    })

    ipcMain.handle('shell:launcher:save', async (_event, state: unknown) => {
        const path = launcherPath()
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, JSON.stringify(state, null, 2), 'utf-8')
    })
}
