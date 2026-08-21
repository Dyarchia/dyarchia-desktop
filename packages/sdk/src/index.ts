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

export type ThemeName = 'light' | 'dark'

export interface ThemeApi {
    readonly current: ThemeName
    token(name: string): string
    onChange(listener: (theme: ThemeName) => void): () => void
}

export interface PluginContext {
    readonly pluginId: string
    readonly theme: ThemeApi
    registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): () => void
}

export interface PluginMainContext {
    readonly pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
}
