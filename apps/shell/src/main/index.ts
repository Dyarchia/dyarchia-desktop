import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'
import { registerLayoutStore } from './layoutStore'
import { adoptUserData, registerPaths } from './paths'
import { registerWindowControls } from './windowControls'
import { registerZoom } from './zoom'
import { registerPluginScheme, setupPlugins } from './plugins'
import { registerUpdates } from './updates'
import { stopPythonPlugins } from './pythonHost'
import { guardWebviews } from './webviews'

/*
 * Before anything else, and in this order. `userData` is read when the first session is created,
 * so it has to be pointed at `~/.dyarchia` while there is still nothing to move; and plugin
 * discovery reads that root to collect the custom schemes, which `registerSchemesAsPrivileged`
 * demands before the application is ready.
 */
adoptUserData()
registerPluginScheme()
guardWebviews()

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'] || process.env['DYARCHIA_DEBUG'])

const SHOW_DEADLINE_MS = 2000

/*
 * The debugging port is settable because it is a port: two instances cannot share one, and the
 * second to start loses it silently — Chromium logs a bind error into a stream nobody is reading
 * and carries on without a protocol endpoint, which reads as the second instance being broken.
 * A workspace checkout running beside a packaged build is the ordinary case, not an exotic one.
 */
if (isDev) {
    app.commandLine.appendSwitch(
        'remote-debugging-port',
        process.env['DYARCHIA_DEBUG_PORT'] || '9222'
    )
}

function createWindow(): void {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 640,
        minHeight: 400,
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        backgroundColor: '#0a0b0d',
        icon: DEV_ICON,
        webPreferences: {
            preload: join(import.meta.dirname, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: true
        }
    })

    /*
     * The window is built hidden so that the first thing on screen is a painted frame, and
     * `ready-to-show` is the event that says such a frame exists. It is not a promise. Measured
     * over six packaged launches on Windows it arrived once, at 174 ms, while `did-finish-load`
     * arrived on every one of them at 137 ms; on the five without it the window stayed built,
     * loaded, running its plugins and invisible for as long as the process lived. An application
     * whose only way onto the screen is an event that usually does not come is an application
     * that usually does not open, so the load and a deadline open it too and the first of the
     * three wins. The background colour is what a frame that has not painted yet shows, and it is
     * the ground's own, so arriving before the paint costs nothing.
     */
    let shown = false
    const reveal = (): void => {
        if (shown) return
        shown = true
        clearTimeout(deadline)
        if (!win.isDestroyed()) win.show()
    }
    const deadline = setTimeout(reveal, SHOW_DEADLINE_MS)
    win.once('ready-to-show', reveal)
    win.webContents.once('did-finish-load', reveal)
    win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
        if (isMainFrame) reveal()
    })
    win.once('closed', () => clearTimeout(deadline))
    registerZoom(win)

    if (isDev) {
        win.webContents.on('before-input-event', (_event, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                win.webContents.toggleDevTools()
            }
        })
    }

    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
    }
}

/*
 * Windows groups taskbar buttons, and remembers the icon it draws for them, by this identifier. A
 * workspace checkout runs the stock electron.exe, whose only icon is Electron's atom, and it used
 * the installed application's identifier: the two became one taskbar entry, and the atom was what
 * Windows kept for it. The installed window carried the right icon the whole time and the taskbar
 * drew the atom anyway. A checkout is a different application and says so, and it borrows the
 * installed icon for its window so that neither of them is ever drawn as Electron.
 */
const APP_ID = app.isPackaged ? 'dev.dyarchia.desktop' : 'dev.dyarchia.desktop.workspace'
const DEV_ICON = app.isPackaged ? undefined : join(app.getAppPath(), 'icon.png')

app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID)
    Menu.setApplicationMenu(null)
    registerLayoutStore()
    registerWindowControls()
    registerPaths()
    registerUpdates()
    await setupPlugins()
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('will-quit', () => {
    stopPythonPlugins()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
