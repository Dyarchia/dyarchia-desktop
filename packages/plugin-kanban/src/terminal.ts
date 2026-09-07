import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { PluginContext } from '@dyarchia/sdk'

const ANSI: ITheme = {
    black: '#3a3d42',
    red: '#e07b7b',
    green: '#7fc99a',
    yellow: '#d6b168',
    blue: '#7ba6e8',
    magenta: '#c493dd',
    cyan: '#6dc3cf',
    white: '#a0a3a8',
    brightBlack: '#909398',
    brightRed: '#f09a9a',
    brightGreen: '#9bdcb2',
    brightYellow: '#e8c98a',
    brightBlue: '#9dbef2',
    brightMagenta: '#d7b0e8',
    brightCyan: '#8fd6e0',
    brightWhite: '#f4f4f6'
}

type HostMessage = { t: 'data'; d: string } | { t: 'exit'; code: number }

interface Announcement {
    dyarchiaPort?: { pluginId: string; attachId: string }
}

export interface Attached {
    dispose(): void
}

export function openTerminal(
    ctx: PluginContext,
    container: HTMLElement,
    slug: string,
    cardId: string,
    onFail: (reason: string) => void
): Attached {
    const theme = (): ITheme => ({
        ...ANSI,
        background: ctx.token('surface-1'),
        foreground: ctx.token('text'),
        cursor: ctx.token('text'),
        cursorAccent: ctx.token('surface-1'),
        selectionBackground: ctx.token('accent-soft')
    })

    const terminal = new Terminal({
        fontFamily: ctx.token('font-mono'),
        fontSize: 12,
        cursorBlink: true,
        allowProposedApi: true,
        minimumContrastRatio: 4.5,
        scrollback: 10_000,
        theme: theme()
    })

    let port: MessagePort | null = null
    let disposed = false
    const attachId = crypto.randomUUID()

    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)

    const resize = (): void => {
        if (container.clientWidth < 1 || container.clientHeight < 1) return
        fit.fit()
        port?.postMessage({ t: 'resize', cols: terminal.cols, rows: terminal.rows })
    }
    resize()

    const stopThemeWatch = ctx.onThemeChange(() => {
        terminal.options.theme = theme()
    })

    const onHostMessage = (event: MessageEvent): void => {
        const message = event.data as HostMessage
        if (message.t === 'data') {
            const chars = message.d.length
            terminal.write(message.d, () => port?.postMessage({ t: 'ack', n: chars }))
            return
        }
        port?.close()
        port = null
        terminal.write('\r\n[the session view closed]\r\n')
    }

    const onAnnouncement = (event: MessageEvent): void => {
        const payload = (event.data as Announcement).dyarchiaPort
        if (!payload || payload.pluginId !== 'kanban' || payload.attachId !== attachId) return
        window.removeEventListener('message', onAnnouncement)

        const received = event.ports[0]
        if (!received) return
        if (disposed) {
            received.postMessage({ t: 'detach' })
            received.close()
            return
        }
        port = received
        port.onmessage = onHostMessage
        port.postMessage({ t: 'resize', cols: terminal.cols, rows: terminal.rows })
    }

    window.addEventListener('message', onAnnouncement)
    void ctx
        .invoke('attach', { slug, cardId, attachId, cols: terminal.cols, rows: terminal.rows })
        .catch((error: unknown) => {
            window.removeEventListener('message', onAnnouncement)
            onFail(error instanceof Error ? error.message : String(error))
        })

    const onInput = terminal.onData((data) => port?.postMessage({ t: 'in', d: data }))

    const observer = new ResizeObserver(resize)
    observer.observe(container)

    return {
        dispose(): void {
            disposed = true
            stopThemeWatch()
            observer.disconnect()
            window.removeEventListener('message', onAnnouncement)
            onInput.dispose()
            if (port) {
                port.postMessage({ t: 'detach' })
                port.close()
                port = null
            }
            terminal.dispose()
        }
    }
}
