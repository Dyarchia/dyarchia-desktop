import { Terminal } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import xtermCss from '@xterm/xterm/css/xterm.css'
import { brandIcon, injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

const STYLES =
    xtermCss +
    '\n.dyarchia-terminal {' +
    ' position: relative;' +
    ' height: 100%; padding: var(--dya-space-2) 0 0 var(--dya-space-2); }' +
    '\n.dyarchia-terminal-connecting { position: absolute; inset: 0; }' +
    '\n.xterm .xterm-viewport { background-color: transparent !important; }' +
    '\n.xterm .xterm-viewport::-webkit-scrollbar { width: 8px; }' +
    '\n.xterm .xterm-viewport::-webkit-scrollbar-track { background: transparent; }' +
    '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb {' +
    ' background-color: transparent; border-radius: var(--dya-radius); }' +
    '\n.xterm .xterm-viewport:hover::-webkit-scrollbar-thumb {' +
    ' background-color: var(--dya-border); }' +
    '\n.xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {' +
    ' background-color: var(--dya-border-strong); }'

/*
 * The sixteen colours a program asks for by number, taken from kanon rather than written here. They
 * were sixteen hex values in this file, the one place in the application a plugin declared colours
 * of its own, and they were measured against nothing: a green chosen by eye on one theme's ground
 * is a green on the other theme's ground too, whatever it measures there. The chromatic six and
 * their bright twins are solved per theme against the surface the terminal draws on; black and
 * white are the system's own ink ranks, so a program's dim text is the dimmest text the system has.
 */
const ANSI_TOKENS = {
    black: 'border-strong',
    red: 'ansi-red',
    green: 'ansi-green',
    yellow: 'ansi-yellow',
    blue: 'ansi-blue',
    magenta: 'ansi-magenta',
    cyan: 'ansi-cyan',
    white: 'text-3',
    brightBlack: 'text-4',
    brightRed: 'ansi-bright-red',
    brightGreen: 'ansi-bright-green',
    brightYellow: 'ansi-bright-yellow',
    brightBlue: 'ansi-bright-blue',
    brightMagenta: 'ansi-bright-magenta',
    brightCyan: 'ansi-bright-cyan',
    brightWhite: 'text'
} as const satisfies Partial<Record<keyof ITheme, string>>

const TERMINAL_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>'

interface PortAnnouncement {
    dyarchiaPort?: {
        pluginId: string
        attachId: string
    }
}

type HostMessage = { t: 'data'; d: string } | { t: 'exit'; code: number }

/*
 * A tab named after what runs in it. Six tabs reading CLI said nothing about which one held the
 * agent and which one the build, so the tab takes the name of the program started at the prompt:
 * `claude` makes it CLAUDE, `kimi` KIMI, `npx vitest` VITEST, and a program with a known mark
 * wears it in place of the terminal's own icon. The prompt is recognised rather than
 * configured -- PowerShell, cmd and a POSIX shell each draw one these match -- and a line that is
 * not a prompt, such as an agent's own input box, is never read as a command. The shell is known
 * to be back only when a prompt of the same shape as the one the command was typed at is under
 * the cursor: an agent that draws inline can end a line of its own in `%` or `$`, and the loosest
 * shape would otherwise take that for the shell returning.
 */
const PROMPTS = [/^PS [^>]*>/, /^[A-Za-z]:\\[^>]*>/, /^[^$#%\s][^$#%]*[$#%](?= |$)/]

function promptOf(line: string): { shape: number; rest: string } | null {
    for (const [shape, pattern] of PROMPTS.entries()) {
        const match = pattern.exec(line)
        if (match) return { shape, rest: line.slice(match[0].length).trim() }
    }
    return null
}

const RUNNERS = new Set(['&', 'npx', 'pnpx', 'bunx', 'uvx', 'pipx', 'sudo', 'time'])
const RUNNER_VERBS: Record<string, Set<string>> = {
    pnpm: new Set(['dlx', 'exec']),
    npm: new Set(['exec']),
    yarn: new Set(['dlx']),
    bun: new Set(['x']),
    uv: new Set(['run'])
}

function isPrompt(line: string, shape: number): boolean {
    const prompt = promptOf(line)
    return prompt !== null && prompt.shape === shape && prompt.rest === ''
}

function commandOf(line: string): { name: string; shape: number } | null {
    const prompt = promptOf(line)
    if (!prompt) return null
    const words = prompt.rest.split(/\s+/).filter(Boolean)
    let index = 0
    while (index < words.length - 1) {
        const word = words[index].toLowerCase()
        if (RUNNERS.has(word)) index += 1
        else if (RUNNER_VERBS[word]?.has(words[index + 1].toLowerCase())) index += 2
        else if (word === 'uv' && words[index + 1] === 'tool' && words[index + 2] === 'run') index += 3
        else break
    }
    const program = (words[index] ?? '')
        .replace(/^[&."']+|["']+$/g, '')
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(exe|cmd|bat|ps1|com)$/i, '')
    return program ? { name: program.toUpperCase(), shape: prompt.shape } : null
}

export function activate(ctx: PluginContext): void {
    ctx.registerPanel(
        {
            id: 'terminal',
            title: 'CLI',
            icon: TERMINAL_ICON,
            note: 'A shell whose session survives the panel being closed and reopened.',
            duplicable: true
        },
        (container, handle) => {
        injectStyles(ctx.pluginId, STYLES)
        container.classList.add('dyarchia-terminal')

        const terminalTheme = (): ITheme => ({
            ...Object.fromEntries(
                Object.entries(ANSI_TOKENS).map(([slot, name]) => [slot, ctx.token(name)])
            ),
            background: ctx.token('sunken'),
            foreground: ctx.token('text'),
            cursor: ctx.token('text'),
            cursorAccent: ctx.token('sunken'),
            selectionBackground: ctx.token('accent-soft')
        })

        const terminal = new Terminal({
            fontFamily: ctx.token('font-mono'),
            fontSize: 13,
            cursorBlink: true,
            allowProposedApi: true,
            minimumContrastRatio: 4.5,
            scrollback: 10000,
            theme: terminalTheme()
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

        /*
         * The pty lives in its own process and starting it is not instant. A terminal that shows a
         * black rectangle while that happens reads as a terminal that is broken, which is what the
         * first open of a session looked like. It says it is attaching until the channel exists,
         * and stops saying it on the frame the channel arrives rather than on a timer.
         */
        const connecting = document.createElement('div')
        connecting.className = 'dya-loading dyarchia-terminal-connecting'
        const connectingText = document.createElement('span')
        connectingText.textContent = 'attaching to a shell'
        connecting.appendChild(connectingText)
        container.appendChild(connecting)

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
            connecting.remove()
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

        /*
         * The line under the cursor when Enter is pressed at a prompt is the command. The name is
         * shown only once the command has outlived 400 ms, so `cd` and `ls` do not flash their
         * names across the tab, and it goes back to the panel's own title when a prompt is under the
         * cursor again. Only the normal buffer is read for that: a full-screen program draws in the
         * alternate one, and whatever it draws there is not the shell coming back.
         */
        let running: number | null = null
        let naming = 0
        const cursorLine = (): string => {
            const buffer = terminal.buffer.active
            return buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? ''
        }

        const onInput = terminal.onData((data) => {
            if (running === null && data.includes('\r')) {
                const command = commandOf(cursorLine())
                if (command) {
                    running = command.shape
                    window.clearTimeout(naming)
                    naming = window.setTimeout(() => {
                        if (running !== null && !disposed) {
                            handle.setTitle(command.name, brandIcon(command.name))
                        }
                    }, 400)
                }
            }
            port?.postMessage({ t: 'in', d: data })
        })

        const onParsed = terminal.onWriteParsed(() => {
            if (running === null || terminal.buffer.active.type !== 'normal') return
            if (!isPrompt(cursorLine(), running)) return
            running = null
            window.clearTimeout(naming)
            handle.setTitle(null)
        })

        const observer = new ResizeObserver(() => {
            fit.fit()
            port?.postMessage({ t: 'resize', cols: terminal.cols, rows: terminal.rows })
        })
        observer.observe(container)

        return () => {
            disposed = true
            observer.disconnect()
            window.removeEventListener('message', onPortAnnouncement)
            container.removeEventListener('mouseup', onMouseUp)
            container.removeEventListener('contextmenu', onContextMenu)
            onInput.dispose()
            onParsed.dispose()
            window.clearTimeout(naming)
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
