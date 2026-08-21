import type { PluginContext } from '@dyarchia/sdk'

const PYINFO_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>'

const STYLE_ID = 'dyarchia-pyinfo-style'

const STYLE = `
.pyinfo-root {
    height: 100%;
    overflow: auto;
    padding: var(--dya-space-5) var(--dya-space-5);
    color: var(--dya-text-2);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    line-height: 1.7;
}
.pyinfo-title {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    margin-bottom: var(--dya-space-4);
    color: var(--dya-text-3);
    text-transform: uppercase;
}
.pyinfo-title::before {
    content: '';
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-accent);
}
.pyinfo-row {
    display: flex;
    gap: var(--dya-space-3);
    padding: 2px 0;
}
.pyinfo-key {
    min-width: 130px;
    color: var(--dya-text-3);
    text-transform: uppercase;
}
.pyinfo-value {
    color: var(--dya-text-2);
    word-break: break-all;
}
.pyinfo-section {
    margin-top: var(--dya-space-5);
}
.pyinfo-tick {
    align-items: center;
    color: var(--dya-text-2);
}
.pyinfo-tick::before {
    content: '';
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-accent);
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
.pyinfo-echo input {
    flex: 1;
    height: 28px;
    padding: 0 var(--dya-space-3);
    border: none;
    border-radius: var(--dya-radius);
    color: var(--dya-text);
    background: var(--dya-bg);
    box-shadow: var(--dya-elev-pressed);
    font: inherit;
    letter-spacing: inherit;
}
.pyinfo-echo input::placeholder {
    color: var(--dya-text-3);
}
.pyinfo-echo button {
    height: 28px;
    padding: 0 var(--dya-space-4);
    border: none;
    border-radius: var(--dya-radius);
    color: var(--dya-text);
    background: var(--dya-surface-1);
    box-shadow: var(--dya-elev-raised);
    font: inherit;
    letter-spacing: inherit;
    text-transform: uppercase;
    cursor: pointer;
    transition: transform var(--dya-dur-press) var(--dya-ease-press);
}
.pyinfo-echo button:hover {
    box-shadow: var(--dya-elev-raised-hover);
}
.pyinfo-echo button:active {
    box-shadow: var(--dya-elev-pressed);
    transform: translateY(1px);
}
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
            input.value = 'hello from the renderer'
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
