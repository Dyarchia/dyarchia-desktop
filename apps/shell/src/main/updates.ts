import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'

/*
 * Whether there is a newer build, and the three presses that get from here to running it.
 *
 * Nothing is downloaded without being asked for. An alpha replaces itself often enough that a
 * background download is a background use of somebody's connection and somebody's disk, for a
 * version they may not want yet, and the one thing this application must never do is decide on
 * its own that the reader is finished with the build they are using.
 *
 * Every release is a prerelease, so `allowPrerelease` is not a setting here but the whole of how
 * an update is ever found.
 */

const { autoUpdater } = electronUpdater

export type UpdatePhase =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'current'
    | 'failed'
    | 'unsupported'

export interface UpdateState {
    phase: UpdatePhase
    running: string
    version: string | null
    percent: number
    note: string | null
}

const CHANNEL = 'shell:update'

/*
 * The first check waits for the window to have been on screen a moment. A request to the GitHub
 * API during startup competes with plugin discovery, four renderer bundles and a Python
 * interpreter for the same few hundred milliseconds, and nothing about the answer is urgent.
 */
const FIRST_CHECK_MS = 8000

let state: UpdateState = {
    phase: 'idle',
    running: app.getVersion(),
    version: null,
    percent: 0,
    note: null
}

function publish(next: Partial<UpdateState>): void {
    state = { ...state, ...next }
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send(CHANNEL, state)
    }
}

/*
 * A development checkout has no installer to replace and no `app-update.yml` beside it, so
 * electron-updater fails on the first call rather than reporting that there is nothing to do.
 * Saying so is the honest answer, and it is what the panel shows instead of an error.
 */
function supported(): boolean {
    return app.isPackaged
}

function describe(error: unknown): string {
    const said = error instanceof Error ? error.message : String(error)
    if (/net::|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i.test(said)) return 'no answer from github'
    return said.split('\n')[0].slice(0, 200)
}

export function registerUpdates(): void {
    ipcMain.handle('shell:update:state', () => state)

    if (!supported()) {
        state = { ...state, phase: 'unsupported', note: 'this build updates with its checkout' }
        ipcMain.handle('shell:update:check', () => state)
        ipcMain.handle('shell:update:download', () => state)
        ipcMain.handle('shell:update:install', () => state)
        return
    }

    autoUpdater.allowPrerelease = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => publish({ phase: 'checking', note: null }))
    autoUpdater.on('update-available', (info) =>
        publish({ phase: 'available', version: info.version, percent: 0, note: null })
    )
    autoUpdater.on('update-not-available', () => publish({ phase: 'current', note: null }))
    autoUpdater.on('download-progress', (progress) =>
        publish({ phase: 'downloading', percent: Math.round(progress.percent) })
    )
    autoUpdater.on('update-downloaded', (info) =>
        publish({ phase: 'ready', version: info.version, percent: 100, note: null })
    )
    autoUpdater.on('error', (error) => publish({ phase: 'failed', note: describe(error) }))

    ipcMain.handle('shell:update:check', async () => {
        try {
            await autoUpdater.checkForUpdates()
        } catch (error) {
            publish({ phase: 'failed', note: describe(error) })
        }
        return state
    })

    ipcMain.handle('shell:update:download', async () => {
        if (state.phase !== 'available') return state
        publish({ phase: 'downloading', percent: 0 })
        try {
            await autoUpdater.downloadUpdate()
        } catch (error) {
            publish({ phase: 'failed', note: describe(error) })
        }
        return state
    })

    /*
     * `quitAndInstall` runs the downloaded installer and exits. The Python plugins are children of
     * this process and outlive a bare `app.quit()` on Windows, so they are stopped through the
     * ordinary shutdown path first -- `will-quit` fires on the way out of this call.
     */
    ipcMain.handle('shell:update:install', () => {
        if (state.phase !== 'ready') return state
        setImmediate(() => autoUpdater.quitAndInstall(false, true))
        return state
    })

    setTimeout(() => {
        void autoUpdater.checkForUpdates().catch((error: unknown) => {
            publish({ phase: 'failed', note: describe(error) })
        })
    }, FIRST_CHECK_MS)
}
