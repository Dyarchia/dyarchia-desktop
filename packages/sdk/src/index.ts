export { highlight, highlightLines } from './highlight.js'
export { renderMarkdown } from './markdown.js'
export { texToUnicode } from './math.js'
export { HUES, hues, isHue } from './hues.js'
export type { Hue } from './hues.js'

import type { Hue } from './hues.js'

export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    /* One line saying what this panel is for, shown on its tile when nothing is open. */
    note?: string
    duplicable?: boolean
    /*
     * Which hue identifies this panel. Leave it out: the shell fills it from the plugin's manifest,
     * so a plugin's panels share its colour without restating it.
     */
    hue?: Hue
}

export type PanelDispose = () => void

export interface PanelHandle {
    readonly instanceId: string
    close(): void
    /*
     * What this panel's tab says while it says something more specific than the descriptor's
     * title, such as the program a terminal is running. `null` puts the descriptor's title back.
     * The layout keeps whatever was last set, and the shell restores the descriptor's title when
     * it loads a saved layout, so a name that stopped being true does not outlive the session.
     */
    setTitle(title: string | null): void
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
        hue?: Hue
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
 * Where this installation keeps things. `dataHome` is the one a user opens: `data/` under the
 * application's one root, `~/.dyarchia`, holding whatever a plugin produces on their behalf. A
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
    /*
     * The same `highlight` this package exports, handed over rather than imported, because a
     * plugin the shell serves as written has no build step to import anything with. A panel
     * showing code gets kanon's measured hues either way, and neither way carries a library.
     */
    highlight(source: string, language?: string): string
    /*
     * A hue for each of a set of things this plugin shows side by side -- the groups of its
     * corpora, the agents on its board. The same function this package exports, handed over for
     * the plugin with no build step, like `highlight`.
     */
    hues(keys: Iterable<string>): Record<string, Hue>
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
