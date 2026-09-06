import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

const PYINFO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>'


const STYLE = `
.pyinfo-root {
    height: 100%;
    overflow: auto;
    padding: var(--dya-space-5);
}
.pyinfo-title {
    margin-bottom: var(--dya-space-4);
}
.pyinfo-row {
    display: flex;
    gap: var(--dya-space-3);
    padding: 2px 0;
}
.pyinfo-key {
    flex: none;
    min-width: 130px;
}
.pyinfo-value {
    word-break: break-all;
}
.pyinfo-section {
    margin-top: var(--dya-space-5);
}
.pyinfo-error {
    color: var(--dya-danger);
}
.pyinfo-echo {
    display: flex;
    gap: var(--dya-space-2);
    max-width: 520px;
    margin-top: var(--dya-space-3);
}
.pyinfo-input {
    flex: 1;
}
`


function row(key: string, value: string): HTMLElement {
    const el = document.createElement('div')
    el.className = 'pyinfo-row'
    const k = document.createElement('span')
    k.className = 'dya-key-label pyinfo-key'
    k.textContent = key
    const v = document.createElement('span')
    v.className = 'dya-mono pyinfo-value'
    v.textContent = value
    el.append(k, v)
    return el
}

export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLE)
    ctx.registerPanel(
        { id: 'pyinfo', title: 'Python', icon: PYINFO_ICON, duplicable: true },
        (container) => {
            const root = document.createElement('div')
            root.className = 'pyinfo-root'

            const title = document.createElement('div')
            title.className = 'dya-eyebrow pyinfo-title'
            title.textContent = 'python plugin'

            const facts = document.createElement('div')
            const events = document.createElement('div')
            events.className = 'pyinfo-section'

            const tick = document.createElement('div')
            tick.className = 'dya-value pyinfo-row'
            tick.textContent = 'waiting for broadcast…'

            const echoBox = document.createElement('div')
            echoBox.className = 'pyinfo-echo'
            const input = document.createElement('input')
            input.className = 'dya-field pyinfo-input'
            input.value = 'hello from the renderer'
            const button = document.createElement('button')
            button.className = 'dya-button'
            button.textContent = 'echo'
            const echoOut = document.createElement('div')
            echoOut.className = 'dya-mono pyinfo-row'
            echoBox.append(input, button)

            const runEcho = async (): Promise<void> => {
                try {
                    const reply = await ctx.invoke('echo', input.value)
                    echoOut.textContent = String(reply)
                } catch (error) {
                    echoOut.className = 'dya-mono pyinfo-row pyinfo-error'
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
                    facts.className = 'dya-mono pyinfo-error'
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
