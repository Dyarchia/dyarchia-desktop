export { highlight } from './highlight.js'
export { renderMarkdown } from './markdown.js'
export { texToUnicode } from './math.js'

export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    /* One line saying what this panel is for, shown on its tile when nothing is open. */
    note?: string
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
    postInstall?: string[][]
    verify?: string[]
}

export interface PluginCatalogueEntry {
    manifest: {
        id: string
        name: string
        version: string
        description?: string
        data?: string
        requires?: PluginRequirement[]
    }
    directory: string
    /*
     * Whether this plugin is part of the application rather than a choice. A core plugin is always
     * loaded, is never written to the enabled list, and the setup panel shows it without a tick.
     */
    core: boolean
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
export interface OpenRequest {
    path: string
    line?: number
}

export interface OpenerDescriptor {
    panelId: string
    extensions: string[]
}

/*
 * Where this installation keeps things. `dataHome` is the one a user opens: a folder under
 * Documents, named after the application, holding whatever a plugin produces on their behalf. A
 * plugin that writes something durable puts it there rather than beside its own code, which in a
 * packaged build is a directory it does not own and must not assume will still exist.
 */
export interface ShellPaths {
    dataHome: string
    userData: string
    application: string
}

export interface ShellApi {
    catalogue(): Promise<PluginCatalogue>
    paths(): Promise<ShellPaths>
    enable(ids: string[]): Promise<string[]>
    relaunch(): Promise<void>
    /*
     * Whether any plugin in this installation renders a file of that kind. A finder asks this
     * before offering to open something, so the offer never appears when nothing would answer it,
     * and never names the plugin that would.
     */
    canOpen(path: string): boolean
    open(request: OpenRequest): Promise<boolean>
    reveal(path: string): Promise<boolean>
}

export interface PluginContext {
    readonly pluginId: string
    token(name: string): string
    registerPanel(descriptor: PanelDescriptor, mount: PanelMount): void
    /*
     * Declare that this plugin renders files of these kinds, and which of its panels does it. The
     * shell shows that panel before handing the request over, so a reader only has to read.
     */
    registerOpener(descriptor: OpenerDescriptor, open: (request: OpenRequest) => void | Promise<void>): void
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
