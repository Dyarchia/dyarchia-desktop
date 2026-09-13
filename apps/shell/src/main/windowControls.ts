import { app, BrowserWindow, ipcMain, screen } from 'electron'

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
}
