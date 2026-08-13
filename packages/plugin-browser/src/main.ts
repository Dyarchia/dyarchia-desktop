import { BrowserWindow, WebContentsView } from 'electron'
import type { PluginMainContext } from '@decimatio/sdk'

interface Bounds {
    x: number
    y: number
    width: number
    height: number
}

const views = new Map<string, { view: WebContentsView; win: BrowserWindow }>()
let nextId = 1

function roundBounds(bounds: Bounds): Bounds {
    return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height))
    }
}

export function activate(ctx: PluginMainContext): void {
    ctx.handle('create', (...args: unknown[]) => {
        const [bounds] = args as [Bounds]
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return null
        const view = new WebContentsView({
            webPreferences: { sandbox: true, contextIsolation: true }
        })
        const id = String(nextId++)
        win.contentView.addChildView(view)
        view.setBounds(roundBounds(bounds))
        view.setBackgroundColor('#1b1b1f')

        const wc = view.webContents
        const emitState = (): void => {
            if (wc.isDestroyed()) return
            ctx.broadcast('nav', id, {
                url: wc.getURL(),
                title: wc.getTitle(),
                canGoBack: wc.navigationHistory.canGoBack(),
                canGoForward: wc.navigationHistory.canGoForward(),
                loading: wc.isLoading()
            })
        }
        wc.on('did-navigate', emitState)
        wc.on('did-navigate-in-page', emitState)
        wc.on('page-title-updated', emitState)
        wc.on('did-start-loading', emitState)
        wc.on('did-stop-loading', emitState)
        wc.setWindowOpenHandler(({ url }) => {
            void wc.loadURL(url)
            return { action: 'deny' }
        })

        views.set(id, { view, win })
        return id
    })

    ctx.handle('navigate', (...args: unknown[]) => {
        const [id, url] = args as [string, string]
        void views.get(id)?.view.webContents.loadURL(url)
    })

    ctx.handle('bounds', (...args: unknown[]) => {
        const [id, bounds] = args as [string, Bounds]
        views.get(id)?.view.setBounds(roundBounds(bounds))
    })

    ctx.handle('visible', (...args: unknown[]) => {
        const [id, visible] = args as [string, boolean]
        views.get(id)?.view.setVisible(visible)
    })

    ctx.handle('back', (...args: unknown[]) => {
        const [id] = args as [string]
        views.get(id)?.view.webContents.navigationHistory.goBack()
    })

    ctx.handle('forward', (...args: unknown[]) => {
        const [id] = args as [string]
        views.get(id)?.view.webContents.navigationHistory.goForward()
    })

    ctx.handle('reload', (...args: unknown[]) => {
        const [id] = args as [string]
        views.get(id)?.view.webContents.reload()
    })

    ctx.handle('destroy', (...args: unknown[]) => {
        const [id] = args as [string]
        const entry = views.get(id)
        if (!entry) return
        views.delete(id)
        entry.win.contentView.removeChildView(entry.view)
        entry.view.webContents.close()
    })
}
