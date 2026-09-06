import { injectStyles } from '@dyarchia/sdk'
import type { PluginContext } from '@dyarchia/sdk'

const SAMPLE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>'


const STYLES = `
.sample {
    height: 100%;
}
`


export function activate(ctx: PluginContext): void {
    injectStyles(ctx.pluginId, STYLES)
    ctx.registerPanel({ id: 'sample', title: 'Sample', icon: SAMPLE_ICON }, (container) => {
        const el = document.createElement('div')
        el.className = 'dya-empty sample'
        el.textContent = `sample panel — plugin id ${ctx.pluginId}`
        container.appendChild(el)
        return () => el.remove()
    })
}
