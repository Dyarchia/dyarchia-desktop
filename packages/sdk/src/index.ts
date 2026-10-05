export { highlight, highlightLines } from './highlight.js'
export { renderMarkdown } from './markdown.js'
export { texToUnicode } from './math.js'
export { hues } from './hues.js'
export { when } from './when.js'
export { brandIcon, ownIds } from './brands.js'
export { glyph } from './glyphs.js'
export { tips } from './tips.js'
export { terminalTheme } from './terminal.js'
export type { Tip } from './tips.js'
export type { GlyphName } from './glyphs.js'
export type { Hue } from './hues.js'

import type { Hue } from './hues.js'
import type { GlyphName } from './glyphs.js'

export interface PanelDescriptor {
    id: string
    title: string
    icon: string
    duplicable?: boolean
    /*
     * Keep the panel in the document while another tab covers it. Only for a panel whose content
     * cannot be put back cheaply, a live web page above all; the default frees what is hidden.
     */
    keepAlive?: boolean
    /*
     * How wide the panel wants to be when it opens beside others, and how wide its content may
     * grow. A panel with a narrow job opens as a column of `width` rather than taking half the
     * window, and past `maxWidth` its content stays at the top left and the rest is room.
     */
    width?: number
    maxWidth?: number
    /*
     * A panel that is visited rather than worked in opens over the window as a modal, never in
     * the dock: somewhere to decide something and leave.
     */
    modal?: boolean
}

export type PanelDispose = () => void

export interface PanelHandle {
    readonly instanceId: string
    close(): void
    /*
     * What this panel's tab says while it says something more specific than the descriptor's
     * title, such as the program a terminal is running, and the mark it wears beside it: an inline
     * SVG in currentColor, or none to keep the descriptor's icon. `null` puts both back. The shell
     * restores the descriptor's title when it loads a saved layout, and never saves an icon, so a
     * name that stopped being true does not outlive the session.
     */
    setTitle(title: string | null, icon?: string | null): void
    /*
     * The panel's own actions, shown in the dock's tab row while this panel is the one its group
     * shows: a view switch, a run key, a picker. A panel fills it once; the shell moves it in and
     * out of the header as the group changes tab.
     */
    readonly toolbar: HTMLElement
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
    /* For a binary: an archive to download per `<platform>-<arch>`, used only when it is missing. */
    assets?: Record<string, string>
    /* Fetched the moment the plugin is turned on in Setup, with no Install button in between. */
    withPlugin?: boolean
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
     * The icon of the plugin's first panel, when the plugin is loaded and has one. It is what the
     * plugin looks like everywhere else, so a list of plugins can show it rather than a dot.
     */
    icon?: string
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
    instanceId?: string
}

export interface OpenerDescriptor {
    panelId: string
    extensions: string[]
    route?(request: OpenRequest): string | null
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
    show(panelId: string, options?: { fresh?: boolean }): Promise<string | undefined>
}

export interface PluginCommand {
    id: string
    title: string
    icon?: string
    run(): void | Promise<void>
}

/*
 * One thing a plugin found for what is typed in the palette: a page, a card, a crawled document.
 * The title is the thing's own name and the detail where it lives or the line that matched.
 */
export interface SearchHit {
    id: string
    title: string
    detail?: string
    run(): void | Promise<void>
}

export type PluginSearch = (query: string) => Promise<SearchHit[]>

export interface Theme {
    id: string
    name: string
}

/*
 * Which kanon theme the window wears. Everything drawn in CSS follows a change by itself; what a
 * plugin painted from `token()` in JavaScript, a terminal or a diagram, reads the tokens again in
 * `on`. A plugin offering a choice of theme calls `set`, which the shell stores.
 */
export interface ThemeApi {
    list(): Theme[]
    current(): string
    set(id: string): Promise<void>
    on(listener: (id: string) => void): () => void
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
    registerCommand(command: PluginCommand): () => void
    /*
     * The face of a plugin with no panel to lend it one, shown wherever plugins are listed. A
     * plugin with a panel wears its first panel's icon and needs nothing here.
     */
    mark(svg: string): void
    /*
     * What this plugin holds that matches the palette's words. The shell asks once the typing
     * pauses, every plugin at once, and drops an answer to words no longer typed.
     */
    registerSearch(search: PluginSearch): () => void
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
    on(channel: string, listener: (...args: unknown[]) => void): () => void
    /*
     * The same `highlight` this package exports, handed over rather than imported, because a
     * plugin the shell serves as written has no build step to import anything with. A panel
     * showing code gets kanon's measured inks either way, from the shell's copy of highlight.js
     * rather than one of its own.
     */
    highlight(source: string, language?: string): string
    /*
     * A hue for each of a set of things this plugin shows side by side -- the groups of its
     * corpora, the agents on its board. The same function this package exports, handed over for
     * the plugin with no build step, like `highlight`.
     */
    hues(keys: Iterable<string>): Record<string, Hue>
    when(value: Date | number | string | null | undefined): string
    glyph(name: GlyphName): string
    theme: ThemeApi
    shell: ShellApi
}

export interface PluginNotice {
    title: string
    body: string
    action?: unknown
}

export interface PluginMainContext {
    readonly pluginId: string
    readonly dataHome: string
    handle(channel: string, handler: (...args: unknown[]) => unknown | Promise<unknown>): void
    broadcast(channel: string, ...args: unknown[]): void
    notify(notice: PluginNotice): void
    /*
     * Where a binary is, on PATH or where Setup put it, or null when the machine has neither: a
     * plugin that needs FFmpeg asks here and hides what needs it when the answer is null.
     */
    binary(name: string): Promise<string | null>
}

export function injectStyles(pluginId: string, css: string): void {
    const id = `dyarchia-${pluginId}-styles`
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
}
