export interface PluginManifest {
    id: string
    name: string
    version: string
    renderer: string
    main?: string
}

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

export interface PluginModule {
    activate(ctx: PluginContext): void | Promise<void>
}

export interface PluginMainContext {
    readonly pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
}

export interface PluginMainModule {
    activate(ctx: PluginMainContext): void | Promise<void>
}
