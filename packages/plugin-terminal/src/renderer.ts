import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import xtermCss from '@xterm/xterm/css/xterm.css'
import type { PluginContext } from '@decimatio/sdk'

function ensureStyles(): void {
    if (document.getElementById('decimatio-terminal-styles')) return
    const style = document.createElement('style')
    style.id = 'decimatio-terminal-styles'
    style.textContent =
        xtermCss +
        '\n.xterm .xterm-viewport { background-color: transparent !important; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar { width: 8px; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-track { background: transparent; }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb {' +
        ' background-color: transparent; border-radius: 8px;' +
        ' border: 2px solid transparent; background-clip: padding-box; }' +
        '\n.xterm .xterm-viewport:hover::-webkit-scrollbar-thumb {' +
        ' background-color: rgba(255, 255, 255, 0.13); }' +
        '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {' +
        ' background-color: rgba(255, 255, 255, 0.26); }'
    document.head.appendChild(style)
}

const TERMINAL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>'

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        { id: 'terminal', title: 'Terminal', icon: TERMINAL_ICON, duplicable: true },
        (container) => {
        ensureStyles()
        container.style.padding = '6px 2px 2px 8px'
        container.style.background = 'rgba(0, 0, 0, 0.28)'

        const terminal = new Terminal({
            fontFamily: 'Cascadia Mono, Consolas, monospace',
            fontSize: 13,
            cursorBlink: true,
            allowTransparency: true,
            theme: {
                background: '#00000000',
                foreground: '#e0e0e0'
            }
        })
        const fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.open(container)
        fit.fit()

        let sessionId: string | null = null
        let disposed = false

        const offData = ctx.on('data', (...args) => {
            const [id, data] = args as [string, string]
            if (id === sessionId) terminal.write(data)
        })
        const offExit = ctx.on('exit', (...args) => {
            const [id] = args as [string]
            if (id === sessionId) {
                sessionId = null
                terminal.writeln('\r\n[session ended]')
            }
        })

        void ctx
            .invoke('spawn', { cols: terminal.cols, rows: terminal.rows })
            .then((id) => {
                if (disposed) {
                    void ctx.invoke('kill', id)
                    return
                }
                sessionId = id as string
            })

        const onInput = terminal.onData((data) => {
            if (sessionId) void ctx.invoke('write', sessionId, data)
        })

        const observer = new ResizeObserver(() => {
            fit.fit()
            if (sessionId) void ctx.invoke('resize', sessionId, terminal.cols, terminal.rows)
        })
        observer.observe(container)

        return () => {
            disposed = true
            observer.disconnect()
            offData()
            offExit()
            onInput.dispose()
            if (sessionId) void ctx.invoke('kill', sessionId)
            terminal.dispose()
        }
    })
}
