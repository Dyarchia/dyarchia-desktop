import { app, BrowserWindow, ipcMain, screen, shell } from 'electron'
import { stat } from 'node:fs/promises'

const savedBounds = new WeakMap<BrowserWindow, Electron.Rectangle>()

function isEffectivelyMaximized(win: BrowserWindow): boolean {
    if (win.isMaximized()) return true
    const bounds = win.getBounds()
    const workArea = screen.getDisplayMatching(bounds).workArea
    return (
        bounds.x <= workArea.x &&
        bounds.y <= workArea.y &&
        bounds.width >= workArea.width &&
        bounds.height >= workArea.height
    )
}

export function registerWindowControls(): void {
    ipcMain.handle('shell:window:minimize', (event) => {
        BrowserWindow.fromWebContents(event.sender)?.minimize()
    })

    ipcMain.handle('shell:window:toggle-maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return
        if (isEffectivelyMaximized(win)) {
            if (win.isMaximized()) {
                win.unmaximize()
            } else {
                const previous = savedBounds.get(win)
                if (previous) {
                    win.setBounds(previous)
                } else {
                    const workArea = screen.getDisplayMatching(win.getBounds()).workArea
                    win.setBounds({
                        width: 1400,
                        height: 900,
                        x: workArea.x + Math.round((workArea.width - 1400) / 2),
                        y: workArea.y + Math.round((workArea.height - 900) / 2)
                    })
                }
            }
        } else {
            savedBounds.set(win, win.getBounds())
            win.maximize()
        }
    })

    ipcMain.handle('shell:window:close', (event) => {
        BrowserWindow.fromWebContents(event.sender)?.close()
    })

    /*
     * Restarting is a shell control rather than a plugin's business, and it exists because
     * enabling a plugin cannot take effect without it: main modules are imported once and a
     * plugin's own scheme has to be registered before the application is ready. The setup panel
     * asks for this; nothing does it on the user's behalf.
     */
    ipcMain.handle('shell:app:relaunch', () => {
        app.relaunch()
        app.quit()
    })

    /*
     * Show a file where it lives, in whatever the platform calls its file manager. This is the
     * fallback for a plugin that found something no plugin here renders: it needs no reader, no
     * panel and no agreement between plugins, and it is the one answer that is always available.
     *
     * The path is checked before it is handed over. showItemInFolder on a path that does not
     * exist opens a window on nothing, which reads as the application losing the file rather than
     * as the file being gone.
     */
    ipcMain.handle('shell:app:reveal', async (_event, target: unknown) => {
        if (typeof target !== 'string' || !target) return false
        let entry: Awaited<ReturnType<typeof stat>>
        try {
            entry = await stat(target)
        } catch {
            return false
        }
        /*
         * A directory is opened, a file is selected in the one that holds it. showItemInFolder on
         * a directory opens its parent with the directory highlighted, which is the wrong answer
         * when what was asked for is "show me what is in here" — and that is what Setup asks when
         * it prints where this installation keeps the user's own material.
         */
        if (entry.isDirectory()) {
            const failure = await shell.openPath(target)
            return failure === ''
        }
        shell.showItemInFolder(target)
        return true
    })
}
