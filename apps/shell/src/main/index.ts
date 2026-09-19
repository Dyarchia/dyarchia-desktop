import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'
import { registerLayoutStore } from './layoutStore'
import { registerPaths } from './paths'
import { registerWindowControls } from './windowControls'
import { registerZoom } from './zoom'
import { registerPluginScheme, setupPlugins } from './plugins'
import { stopPythonPlugins } from './pythonHost'

registerPluginScheme()

const isDev = Boolean(process.env['ELECTRON_RENDERER_URL'] || process.env['DYARCHIA_DEBUG'])

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
        backgroundColor: '#000000',
        webPreferences: {
            preload: join(import.meta.dirname, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    })

    win.on('ready-to-show', () => win.show())
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

app.whenReady().then(async () => {
    app.setAppUserModelId('dev.dyarchia.desktop')
    Menu.setApplicationMenu(null)
    registerLayoutStore()
    registerWindowControls()
    registerPaths()
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
