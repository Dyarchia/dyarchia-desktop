import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import xtermCss from '@xterm/xterm/css/xterm.css'
import type { PluginContext } from '@dyarchia/sdk'

function ensureStyles(): void {
    if (document.getElementById('dyarchia-terminal-styles')) return
    const style = document.createElement('style')
    style.id = 'dyarchia-terminal-styles'
    style.textContent =
        xtermCss +
        '\n.dyarchia-terminal {' +
        ' height: 100%; padding: var(--dya-space-2) 0 0 var(--dya-space-2); }' +
        '\n.xterm .xterm-viewport { background-color: transparent !important; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar { width: 8px; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-track { background: transparent; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb {' +
        ' background-color: transparent; border-radius: var(--dya-radius); }' +
        '\n.xterm .xterm-viewport:hover::-webkit-scrollbar-thumb {' +
        ' background-color: var(--dya-border); }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {' +
        ' background-color: var(--dya-border-control); }'
    document.head.appendChild(style)
}

const ANSI_LIGHT: ITheme = {
    black: '#141312',
    red: '#8f1414',
    green: '#175226',
    yellow: '#6b4400',
    blue: '#173c80',
    magenta: '#6d2478',
    cyan: '#0b515b',
    white: '#4a4643',
    brightBlack: '#5c5855',
    brightRed: '#a81f1f',
    brightGreen: '#1d6a34',
    brightYellow: '#7d5100',
    brightBlue: '#1f4c9c',
    brightMagenta: '#832d92',
    brightCyan: '#0d626e',
    brightWhite: '#020202'
}

const ANSI_DARK: ITheme = {
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

const TERMINAL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>'

interface PortAnnouncement {
    dyarchiaPort?: {
        pluginId: string
        attachId: string
    }
}

type HostMessage = { t: 'data'; d: string } | { t: 'exit'; code: number }

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'terminal', title: 'Terminal', icon: TERMINAL_ICON, duplicable: true },
        (container, handle) => {
        ensureStyles()
        container.classList.add('dyarchia-terminal')

        const terminalTheme = (): ITheme => ({
            ...(ctx.theme.current === 'dark' ? ANSI_DARK : ANSI_LIGHT),
            background: ctx.theme.token('surface-1'),
            foreground: ctx.theme.token('text'),
            cursor: ctx.theme.token('text'),
            cursorAccent: ctx.theme.token('surface-1'),
            selectionBackground: ctx.theme.token('accent-soft')
        })

        const terminal = new Terminal({
            fontFamily: "'Geist Mono', 'Cascadia Mono', Consolas, monospace",
            fontSize: 13,
            cursorBlink: true,
            allowProposedApi: true,
            minimumContrastRatio: 4.5,
            scrollback: 10000,
            theme: terminalTheme()
        })
        const unwatchTheme = ctx.theme.onChange(() => {
            terminal.options.theme = terminalTheme()
        })
        const fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.loadAddon(new Unicode11Addon())
        terminal.loadAddon(new ClipboardAddon())
        terminal.unicode.activeVersion = '11'
        terminal.open(container)
        try {
            const webgl = new WebglAddon()
            webgl.onContextLoss(() => webgl.dispose())
            terminal.loadAddon(webgl)
        } catch {}
        fit.fit()

        let port: MessagePort | null = null
        let disposed = false
        const attachId = crypto.randomUUID()

        const onHostMessage = (event: MessageEvent): void => {
            const msg = event.data as HostMessage
            if (msg.t === 'data') {
                const chars = msg.d.length
                terminal.write(msg.d, () => port?.postMessage({ t: 'ack', n: chars }))
            } else if (msg.t === 'exit') {
                port?.close()
                port = null
                terminal.write('\r\n[process exited]\r\n')
                setTimeout(() => {
                    if (!disposed) handle.close()
                }, 150)
            }
        }

        const onPortAnnouncement = (event: MessageEvent): void => {
            const payload = (event.data as PortAnnouncement).dyarchiaPort
            if (!payload || payload.pluginId !== 'terminal' || payload.attachId !== attachId) {
                return
            }
            window.removeEventListener('message', onPortAnnouncement)
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
        window.addEventListener('message', onPortAnnouncement)
        void ctx.invoke('attach', { attachId, cols: terminal.cols, rows: terminal.rows })

        const copySelection = (): void => {
            if (!terminal.hasSelection()) return
            void navigator.clipboard.writeText(terminal.getSelection())
        }
        const pasteClipboard = (): void => {
            void navigator.clipboard.readText().then((text) => {
                if (text) terminal.paste(text)
            })
        }

        terminal.attachCustomKeyEventHandler((event) => {
            if (event.type !== 'keydown') return true
            if (!event.ctrlKey || event.altKey || event.metaKey) return true
            const key = event.key.toLowerCase()
            if (key === 'c' && terminal.hasSelection()) {
                event.preventDefault()
                copySelection()
                terminal.clearSelection()
                return false
            }
            if (key === 'v') {
                event.preventDefault()
                pasteClipboard()
                return false
            }
            return true
        })

        const onMouseUp = (event: MouseEvent): void => {
            if (event.button === 0) copySelection()
        }
        const onContextMenu = (event: MouseEvent): void => {
            event.preventDefault()
            if (terminal.hasSelection()) {
                copySelection()
                terminal.clearSelection()
            } else {
                pasteClipboard()
            }
        }
        container.addEventListener('mouseup', onMouseUp)
        container.addEventListener('contextmenu', onContextMenu)

        const onInput = terminal.onData((data) => {
            port?.postMessage({ t: 'in', d: data })
        })

        const observer = new ResizeObserver(() => {
            fit.fit()
            port?.postMessage({ t: 'resize', cols: terminal.cols, rows: terminal.rows })
        })
        observer.observe(container)

        return () => {
            disposed = true
            unwatchTheme()
            observer.disconnect()
            window.removeEventListener('message', onPortAnnouncement)
            container.removeEventListener('mouseup', onMouseUp)
            container.removeEventListener('contextmenu', onContextMenu)
            onInput.dispose()
            if (port) {
                port.postMessage({ t: 'detach' })
                port.close()
                port = null
            }
            terminal.dispose()
            container.classList.remove('dyarchia-terminal')
        }
    })
}
