import type { PluginContext } from '@dyarchia/sdk'

const PYINFO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>'

const STYLE_ID = 'dyarchia-pyinfo-style'

const STYLE = `
.pyinfo-root { height: 100%; overflow: auto; padding: 18px 22px; color: #c9c9d1;
    font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
.pyinfo-title { font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
    color: #6f6f7b; margin-bottom: 14px; }
.pyinfo-row { display: flex; gap: 12px; padding: 3px 0; }
.pyinfo-key { min-width: 130px; color: #6f6f7b; }
.pyinfo-value { color: #c9c9d1; word-break: break-all; }
.pyinfo-section { margin-top: 20px; }
.pyinfo-tick { color: #7ec9a5; }
.pyinfo-error { color: #d98b8b; }
.pyinfo-echo { margin-top: 10px; display: flex; gap: 8px; }
.pyinfo-echo input { flex: 1; background: #1b1b20; border: 1px solid #2c2c34; border-radius: 4px;
    color: #c9c9d1; padding: 5px 8px; font: inherit; }
.pyinfo-echo button { background: #24242b; border: 1px solid #2c2c34; border-radius: 4px;
    color: #c9c9d1; padding: 5px 12px; font: inherit; cursor: pointer; }
.pyinfo-echo button:hover { background: #2c2c34; }
`

function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = STYLE
    document.head.appendChild(style)
}

function row(key: string, value: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'pyinfo-row'
    const k = document.createElement('span')
    k.className = 'pyinfo-key'
    k.textContent = key
    const v = document.createElement('span')
    v.className = 'pyinfo-value'
    v.textContent = value
    el.append(k, v)
    return el
}

export function activate(ctx: PluginContext): void {
    ensureStyle()
    ctx.registerPanel(
        { id: 'pyinfo', title: 'Python', icon: PYINFO_ICON, duplicable: true },
        (container) => {
            const root = document.createElement('div')
            root.className = 'pyinfo-root'

            const title = document.createElement('div')
            title.className = 'pyinfo-title'
            title.textContent = 'python plugin'

            const facts = document.createElement('div')
            const events = document.createElement('div')
            events.className = 'pyinfo-section'

            const tick = document.createElement('div')
            tick.className = 'pyinfo-row pyinfo-tick'
            tick.textContent = 'waiting for broadcast…'

            const echoBox = document.createElement('div')
            echoBox.className = 'pyinfo-echo'
            const input = document.createElement('input')
            input.value = 'hola desde el renderer'
            const button = document.createElement('button')
            button.textContent = 'echo'
            const echoOut = document.createElement('div')
            echoOut.className = 'pyinfo-row'
            echoBox.append(input, button)

            const runEcho = async (): Promise<void> => {
                try {
                    const reply = await ctx.invoke('echo', input.value)
                    echoOut.textContent = String(reply)
                } catch (error) {
                    echoOut.className = 'pyinfo-row pyinfo-error'
                    echoOut.textContent = String(error)
                }
            }
            button.addEventListener('click', () => void runEcho())
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') void runEcho()
            })

            events.append(tick, echoBox, echoOut)
            root.append(title, facts, events)
            container.appendChild(root)

            void ctx
                .invoke('info')
                .then((value) => {
                    const data = value as Record<string, string>
                    facts.replaceChildren(
                        ...Object.entries(data).map(([key, val]) => row(key, String(val)))
                    )
                })
                .catch((error: unknown) => {
                    facts.className = 'pyinfo-error'
                    facts.textContent = `python host unreachable: ${String(error)}`
                })

            const unsubscribe = ctx.on('tick', (...args) => {
                tick.textContent = `broadcast tick #${String(args[0])} from python`
            })

            return () => {
                unsubscribe()
                root.remove()
            }
        }
    )
}
