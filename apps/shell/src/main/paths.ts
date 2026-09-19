import { app, ipcMain } from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * The three directories this installation writes to, and the one of them a user is ever expected
 * to open.
 *
 * `userData` is Electron's, under %APPDATA%: the layout, the enabled list, the environments Setup
 * builds, the MCP offer folder. Machine state, uninteresting, correctly hidden.
 *
 * `dataHome` is not. A corpus repository is hundreds of megabytes of somebody's own material, it
 * is cloned and committed on its own, and a plugin that puts it somewhere unnamed has hidden the
 * user's work from them. It lives under Documents, one folder, named after the application, and
 * Setup prints the path with a button that opens it.
 *
 * Until this existed a packaged build had no answer at all. The installer produced a portable
 * executable, which unpacks itself into %TEMP%\<guid> on every launch, so a plugin resolving a
 * path against its own directory — which is how the crawlee toolkit resolves its corpus, its
 * profiles and its index — wrote into a folder Windows deletes, at a different address each time.
 */

const FOLDER = 'Dyarchia'

export function dataHome(): string {
    const override = process.env['DYARCHIA_DATA_HOME']
    if (override) return override
    return join(app.getPath('documents'), FOLDER)
}

export async function ensureDataHome(): Promise<string> {
    const home = dataHome()
    await mkdir(home, { recursive: true }).catch(() => undefined)
    return home
}

export function registerPaths(): void {
    ipcMain.handle('shell:app:paths', async () => ({
        dataHome: await ensureDataHome(),
        userData: app.getPath('userData'),
        application: app.isPackaged ? join(app.getAppPath(), '..', '..') : app.getAppPath()
    }))
}
