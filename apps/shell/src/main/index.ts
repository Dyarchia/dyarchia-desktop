import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerLayoutStore } from './layoutStore'
import { registerWindowControls } from './windowControls'
import { registerPluginScheme, setupPlugins } from './plugins'

registerPluginScheme()

if (process.env['ELECTRON_RENDERER_URL'] || process.env['DECIMATIO_DEBUG']) {
    app.commandLine.appendSwitch('remote-debugging-port', '9222')
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
        backgroundColor: '#141417',
        webPreferences: {
            preload: join(import.meta.dirname, '../preload/index.mjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    })

    win.on('ready-to-show', () => win.show())

    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
    }
}

app.whenReady().then(async () => {
    registerLayoutStore()
    registerWindowControls()
    await setupPlugins()
    createWindow()
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
