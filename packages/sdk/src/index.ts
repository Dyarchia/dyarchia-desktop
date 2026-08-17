export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    duplicable?: boolean
}

export type PanelDispose = () => void

export type PanelMount = (container: HTMLElement) => PanelDispose | void

export interface PluginContext {
    readonly pluginId: string
    registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): () => void
}

export interface PluginMainContext {
    readonly pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
}
