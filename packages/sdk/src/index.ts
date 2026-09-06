export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    duplicable?: boolean
}

export type PanelDispose = () => void

export interface PanelHandle {
    readonly instanceId: string
    close(): void
}

export type PanelMount = (container: HTMLElement, handle: PanelHandle) => PanelDispose | void

export interface PluginContext {
    readonly pluginId: string
    token(name: string): string
    registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): () => void
}

export interface PluginMainContext {
    readonly pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
}

export function injectStyles(pluginId: string, css: string): void {
    const id = `dyarchia-${pluginId}-styles`
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
}
