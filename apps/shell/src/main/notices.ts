import { BrowserWindow, ipcMain, Notification } from 'electron'

export interface PluginNotice {
    title: string
    body: string
    action?: unknown
}

interface Delivered extends PluginNotice {
    pluginId: string
}

function windows(): BrowserWindow[] {
    return BrowserWindow.getAllWindows()
}

function surface(): BrowserWindow | null {
    const open = windows()
    return open.find((win) => win.isFocused()) ?? open[0] ?? null
}

function clean(text: unknown, limit: number): string {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit)
}

export function showNotice(pluginId: string, raw: PluginNotice): void {
    const notice: Delivered = {
        pluginId,
        title: clean(raw?.title, 120),
        body: clean(raw?.body, 400),
        action: raw?.action
    }
    if (!notice.title) return

    for (const win of windows()) win.webContents.send('shell:notice', notice)

    const focused = windows().some((win) => win.isFocused())
    if (focused || !Notification.isSupported()) return

    const native = new Notification({ title: notice.title, body: notice.body })
    native.on('click', () => {
        const win = surface()
        if (!win) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        activate(notice)
    })
    native.show()
}

function activate(notice: Delivered): void {
    for (const win of windows()) {
        win.webContents.send(`plugin:${notice.pluginId}:notice`, notice.action ?? null)
    }
}

export function registerNotices(): void {
    ipcMain.handle('shell:notice:activate', (_event, raw: unknown) => {
        const notice = raw as Delivered
        if (!notice?.pluginId) return false
        activate(notice)
        return true
    })
}
