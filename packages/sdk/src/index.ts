export { highlight } from './highlight.js'
export { renderMarkdown } from './markdown.js'
export { texToUnicode } from './math.js'

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

export interface PluginRequirement {
    kind: string
    label: string
    name?: string
    hint?: string
    note?: string
    project?: string
}

export interface PluginCatalogueEntry {
    manifest: {
        id: string
        name: string
        version: string
        description?: string
        requires?: PluginRequirement[]
    }
    directory: string
    enabled: boolean
    loaded: boolean
}

export interface PluginCatalogue {
    chosen: boolean
    entries: PluginCatalogueEntry[]
}

/*
 * The shell's own surface, as opposed to a plugin's. Everything else a plugin invokes is namespaced
 * to its own id; this is not, so it stays small on purpose. It exists for the setup panel: what
 * this installation holds, which of it loads, and the restart that makes a change take effect.
 */
export interface ShellApi {
    catalogue(): Promise<PluginCatalogue>
    enable(ids: string[]): Promise<string[]>
    relaunch(): Promise<void>
}

export interface PluginContext {
    readonly pluginId: string
    token(name: string): string
    registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): () => void
    onThemeChange(listener: () => void): () => void
    shell: ShellApi
}

export interface PluginNotice {
    title: string
    body: string
    action?: unknown
}

export interface PluginMainContext {
    readonly pluginId: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
    notify(notice: PluginNotice): void
}

export function injectStyles(pluginId: string, css: string): void {
    const id = `dyarchia-${pluginId}-styles`
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
}
